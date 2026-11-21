import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handler, json, fail, readJson } from "@/lib/afg/api";
import { AuthError, createSession, destroySession, getSessionUser, toSafeUser, clientIp } from "@/lib/afg/auth";
import { hashPassword, verifyPassword, generateNumericCode, sha256Hex, safeEqual } from "@/lib/afg/crypto";
import { rateLimit } from "@/lib/afg/rate-limit";
import { logAudit, logError } from "@/lib/afg/logs";
import { config } from "@/lib/afg/config";
import { registerSchema, loginSchema, guestSchema, codeRequestSchema, codeConfirmSchema, passwordChangeSchema, profileUpdateSchema, formatZodError } from "@/lib/afg/validate";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ action: string }> };

// ---------------------------------------------------------------------------
// Email delivery (real implementation; dev-code fallback documented honestly)
// ---------------------------------------------------------------------------

async function sendEmail(to: string, subject: string, text: string): Promise<{ delivered: boolean; devCode?: string }> {
  if (config.email.resendApiKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.email.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.email.from, to, subject, text }),
    });
    if (!res.ok) {
      await logError({ scope: "auth", code: "EMAIL_SEND_FAILED", message: `Resend HTTP ${res.status}`, meta: { to: to.slice(0, 3) + "***" } });
      throw new AuthError("EMAIL_SEND_FAILED", 502);
    }
    return { delivered: true };
  }
  // No mail provider configured. In development the code is returned so the
  // flow remains testable; production deployments must configure RESEND_API_KEY.
  const devCode = config.allowDevCodes ? (subject.match(/\b\d{6}\b/)?.[0] ?? undefined) : undefined;
  return { delivered: false, devCode };
}

async function issueCode(userId: string, email: string, kind: "VERIFY_EMAIL" | "RESET_PASSWORD") {
  // Invalidate previous codes of this kind
  await db.verificationCode.updateMany({
    where: { userId, kind, usedAt: null },
    data: { usedAt: new Date() },
  });
  const code = generateNumericCode(6);
  await db.verificationCode.create({
    data: { userId, kind, codeHash: sha256Hex(`${code}:${config.sessionSecret.toString("hex")}`), expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
  });
  const subject = kind === "VERIFY_EMAIL" ? `AFG AI email verification: ${code}` : `AFG AI password reset: ${code}`;
  const text = `Your AFG AI verification code is ${code}. It expires in 15 minutes. If you did not request this, ignore this email.`;
  return sendEmail(email, subject, text);
}

async function confirmCode(email: string, code: string, kind: "VERIFY_EMAIL" | "RESET_PASSWORD") {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw new AuthError("INVALID_CODE", 400);
  const record = await db.verificationCode.findFirst({
    where: { userId: user.id, kind, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!record || !safeEqual(record.codeHash, sha256Hex(`${code}:${config.sessionSecret.toString("hex")}`))) {
    throw new AuthError("INVALID_CODE", 400);
  }
  await db.verificationCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return user;
}

// ---------------------------------------------------------------------------
// Google OAuth (enabled only when configured)
// ---------------------------------------------------------------------------

async function googleStart(origin: string): Promise<Response> {
  if (!config.googleOAuth.clientId) {
    return fail("GOOGLE_NOT_CONFIGURED", "Google sign-in is not configured on this deployment.", 400);
  }
  const redirectUri = `${config.appOrigin || origin}/api/auth/google-callback`;
  const params = new URLSearchParams({
    client_id: config.googleOAuth.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

async function googleCallback(req: NextRequest, origin: string): Promise<Response> {
  const code = req.nextUrl.searchParams.get("code");
  if (!code || !config.googleOAuth.clientId) {
    return NextResponse.redirect(`${origin}/?authError=google_unavailable`);
  }
  try {
    const redirectUri = `${config.appOrigin || origin}/api/auth/google-callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.googleOAuth.clientId,
        client_secret: config.googleOAuth.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return NextResponse.redirect(`${origin}/?authError=google_token`);
    const tokens = await tokenRes.json();
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!infoRes.ok) return NextResponse.redirect(`${origin}/?authError=google_userinfo`);
    const info = await infoRes.json();
    const email = String(info.email || "").toLowerCase();
    if (!email || info.email_verified === false) return NextResponse.redirect(`${origin}/?authError=google_email_unverified`);

    let user = await db.user.findUnique({ where: { email } });
    if (!user) {
      user = await db.user.create({ data: { email, name: info.name || email.split("@")[0], emailVerifiedAt: new Date() } });
    }
    if (user.status !== "ACTIVE") return NextResponse.redirect(`${origin}/?authError=suspended`);
    await createSession(user.id, req.headers.get("user-agent"), clientIp(req));
    await logAudit({ actorId: user.id, actorEmail: user.email, action: "auth.google_login", ip: clientIp(req) });
    return NextResponse.redirect(`${origin}/`);
  } catch (err) {
    await logError({ scope: "auth", code: "GOOGLE_OAUTH_FAILED", message: err instanceof Error ? err.message : String(err) });
    return NextResponse.redirect(`${origin}/?authError=google_failed`);
  }
}

// ---------------------------------------------------------------------------
// GET: session bootstrap
// ---------------------------------------------------------------------------

export const GET = handler(async (req: NextRequest, ctx: RouteCtx) => {
  const { action } = await ctx.params;
  if (action === "google-callback") return googleCallback(req, req.nextUrl.origin);
  if (action !== "session") return fail("NOT_FOUND", "Unknown action", 404);

  const user = await getSessionUser();
  const [announcements, flags, googleEnabled] = await Promise.all([
    db.announcement.findMany({ where: { active: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.featureFlag.findMany(),
    Promise.resolve(!!config.googleOAuth.clientId),
  ]);
  return json({
    user: user ? toSafeUser(user) : null,
    announcements: announcements.map((a) => ({ id: a.id, title: a.title, body: a.body, level: a.level, createdAt: a.createdAt.toISOString() })),
    flags: Object.fromEntries(flags.map((f) => [f.key, f.enabled])),
    googleEnabled,
    devCodes: config.allowDevCodes,
  });
});

// ---------------------------------------------------------------------------
// POST actions
// ---------------------------------------------------------------------------

export const POST = handler(async (req: NextRequest, ctx: RouteCtx) => {
  const { action } = await ctx.params;
  const ip = clientIp(req);

  switch (action) {
    case "register": {
      const rl = await rateLimit(`auth:register:${ip}`, config.limits.authPerHour);
      if (!rl.allowed) return fail("RATE_LIMITED", "Too many attempts. Try again later.", 429, { resetAt: rl.resetAt });
      const body = registerSchema.safeParse(await readJson(req));
      if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
      const email = body.data.email.toLowerCase();
      const existing = await db.user.findUnique({ where: { email } });
      if (existing && !existing.isGuest) return fail("EMAIL_TAKEN", "An account with this email already exists.", 409);

      const passwordHash = hashPassword(body.data.password);
      const totalUsers = await db.user.count({ where: { isGuest: false } });
      let user;
      if (existing) {
        // Upgrade a guest account that registered with its placeholder email
        user = await db.user.update({
          where: { id: existing.id },
          data: { email, passwordHash, name: body.data.name || existing.name, isGuest: false, role: totalUsers === 0 ? "ADMIN" : existing.role },
        });
      } else {
        user = await db.user.create({
          data: {
            email,
            passwordHash,
            name: body.data.name || email.split("@")[0],
            // Bootstrap: the first registered account becomes platform admin.
            role: totalUsers === 0 ? "ADMIN" : "USER",
          },
        });
      }
      await createSession(user.id, req.headers.get("user-agent"), ip);
      await logAudit({ actorId: user.id, actorEmail: user.email, action: "auth.register", ip, meta: { bootstrapAdmin: totalUsers === 0 } });
      const emailResult = await issueCode(user.id, email, "VERIFY_EMAIL").catch(() => ({ delivered: false as const, devCode: undefined as string | undefined }));
      return json({ user: toSafeUser(user), emailDelivered: emailResult.delivered, devCode: emailResult.devCode }, { status: 201 });
    }

    case "login": {
      const rl = await rateLimit(`auth:login:${ip}`, config.limits.authPerHour);
      if (!rl.allowed) return fail("RATE_LIMITED", "Too many attempts. Try again later.", 429);
      const body = loginSchema.safeParse(await readJson(req));
      if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
      const user = await db.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
      if (!user || !user.passwordHash || !verifyPassword(body.data.password, user.passwordHash)) {
        await logAudit({ action: "auth.login_failed", meta: { email: body.data.email.slice(0, 3) + "***" }, ip });
        return fail("INVALID_CREDENTIALS", "Incorrect email or password.", 401);
      }
      if (user.status !== "ACTIVE") return fail("SUSPENDED", "This account is suspended.", 403);
      await createSession(user.id, req.headers.get("user-agent"), ip);
      await logAudit({ actorId: user.id, actorEmail: user.email, action: "auth.login", ip });
      return json({ user: toSafeUser(user) });
    }

    case "guest": {
      const rl = await rateLimit(`auth:guest:${ip}`, 10);
      if (!rl.allowed) return fail("RATE_LIMITED", "Too many guest sessions. Try again later.", 429);
      const body = guestSchema.safeParse(await readJson(req).catch(() => ({})));
      const suffix = Math.random().toString(36).slice(2, 8);
      const user = await db.user.create({
        data: { email: `guest-${suffix}-${Date.now()}@guest.afg-ai.local`, name: body.success && body.data.name ? body.data.name : "Guest", isGuest: true },
      });
      await createSession(user.id, req.headers.get("user-agent"), ip);
      await logAudit({ actorId: user.id, action: "auth.guest_session", ip });
      return json({ user: toSafeUser(user) }, { status: 201 });
    }

    case "logout": {
      const user = await getSessionUser();
      await destroySession();
      if (user) await logAudit({ actorId: user.id, action: "auth.logout", ip });
      return json({ ok: true });
    }

    case "verify-request": {
      const user = await requireVerifiedTarget();
      const rl = await rateLimit(`auth:verify:${user.id}`, 5);
      if (!rl.allowed) return fail("RATE_LIMITED", "Too many requests.", 429);
      const result = await issueCode(user.id, user.email!, "VERIFY_EMAIL");
      return json({ delivered: result.delivered, devCode: result.devCode });
    }

    case "verify-confirm": {
      const body = codeConfirmSchema.safeParse(await readJson(req));
      if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
      const user = await confirmCode(body.data.email, body.data.code, "VERIFY_EMAIL");
      await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      await logAudit({ actorId: user.id, action: "auth.email_verified", ip });
      return json({ ok: true });
    }

    case "reset-request": {
      const body = codeRequestSchema.safeParse(await readJson(req));
      if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
      const rl = await rateLimit(`auth:reset:${ip}`, config.limits.authPerHour);
      if (!rl.allowed) return fail("RATE_LIMITED", "Too many requests.", 429);
      const user = await db.user.findUnique({ where: { email: body.data.email.toLowerCase() } });
      // Always report ok to avoid account enumeration; delivery only for real accounts
      if (!user || !user.email || user.isGuest) return json({ delivered: false });
      const result = await issueCode(user.id, user.email, "RESET_PASSWORD");
      return json({ delivered: result.delivered, devCode: result.devCode });
    }

    case "reset-confirm": {
      const body = codeConfirmSchema.safeParse(await readJson(req));
      if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
      if (!body.data.newPassword || body.data.newPassword.length < 8) {
        return fail("INVALID_INPUT", "newPassword: must be at least 8 characters", 400);
      }
      const user = await confirmCode(body.data.email, body.data.code, "RESET_PASSWORD");
      await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(body.data.newPassword) } });
      // Revoke all sessions after a password reset
      await db.session.deleteMany({ where: { userId: user.id } });
      await logAudit({ actorId: user.id, action: "auth.password_reset", ip });
      return json({ ok: true });
    }

    case "password-change": {
      const user = await getSessionUser();
      if (!user) throw new AuthError("UNAUTHENTICATED", 401);
      const body = passwordChangeSchema.safeParse(await readJson(req));
      if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
      if (!verifyPassword(body.data.currentPassword, user.passwordHash)) {
        return fail("INVALID_CREDENTIALS", "Current password is incorrect.", 401);
      }
      await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(body.data.newPassword) } });
      await logAudit({ actorId: user.id, actorEmail: user.email, action: "auth.password_changed", ip });
      return json({ ok: true });
    }

    case "profile": {
      const user = await getSessionUser();
      if (!user) throw new AuthError("UNAUTHENTICATED", 401);
      const body = profileUpdateSchema.safeParse(await readJson(req));
      if (!body.success) return fail("INVALID_INPUT", formatZodError(body.error), 400);
      const updated = await db.user.update({ where: { id: user.id }, data: body.data });
      return json({ user: toSafeUser(updated) });
    }

    case "google-start": {
      return googleStart(req.nextUrl.origin);
    }

    default:
      return fail("NOT_FOUND", "Unknown auth action", 404);
  }
});

async function requireVerifiedTarget() {
  const user = await getSessionUser();
  if (!user) throw new AuthError("UNAUTHENTICATED", 401);
  if (!user.email || user.isGuest) throw new AuthError("NO_EMAIL", 400);
  return user;
}

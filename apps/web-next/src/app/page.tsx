"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AfgApp } from "@/components/afg/afg-app";
import { BrandMark } from "@/components/afg/afg-app";
import { Markdown } from "@/components/afg/markdown";
import { useT } from "@/components/afg/providers";
import { api } from "@/components/afg/api-client";

type SharedPayload = {
  conversation: { title: string; createdAt: string };
  messages: { id: string; role: string; content: string }[];
};

export default function Home() {
  return (
    <Suspense fallback={<BrandSplash />}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const params = useSearchParams();
  const share = params.get("share");
  const [shared, setShared] = useState<SharedPayload | null>(null);
  const [shareError, setShareError] = useState(false);

  useEffect(() => {
    if (!share) return;
    api.get<SharedPayload>(`/api/share/${encodeURIComponent(share)}`)
      .then(setShared)
      .catch(() => setShareError(true));
  }, [share]);

  if (share) {
    return <SharedView shared={shared} error={shareError} />;
  }
  return <AfgApp />;
}

function BrandSplash() {
  return (
    <div className="min-h-screen grid place-items-center bg-background afg-grid-bg">
      <BrandMark />
    </div>
  );
}

function SharedView({ shared, error }: { shared: SharedPayload | null; error: boolean }) {
  const t = useT();
  if (error) {
    return (
      <div className="min-h-screen grid place-items-center bg-background afg-grid-bg">
        <div className="text-center">
          <div className="text-lg font-semibold">{t.errors.notFound}</div>
          <a href="/" className="text-sm text-primary hover:underline">AFG AI</a>
        </div>
      </div>
    );
  }
  if (!shared) {
    return (
      <div className="min-h-screen grid place-items-center bg-background afg-grid-bg">
        <BrandMark />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b flex items-center px-4 sticky top-0 bg-background/95 backdrop-blur">
        <BrandMark compact />
        <div className="flex-1 text-center font-medium truncate">{shared.conversation.title}</div>
        <a href="/" className="text-sm text-primary hover:underline">{t.meta.appName}</a>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {shared.messages.map((m) => (
          <div key={m.id} className="flex gap-3" style={{ flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
            <div className="font-semibold text-xs text-muted-foreground w-14 shrink-0 pt-1" style={{ textAlign: m.role === "user" ? "end" : "start" }}>
              {m.role === "user" ? t.chat.you : t.chat.assistantLabel}
            </div>
            <div className="min-w-0 flex-1">
              {m.role === "user" ? (
                <p className="whitespace-pre-wrap rounded-2xl bg-secondary px-4 py-3 text-[15px]">{m.content}</p>
              ) : (
                <Markdown content={m.content} />
              )}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}

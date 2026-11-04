# AFG AI — GitHub Collaboration and Agent Isolation

This guide adapts the useful engineering lessons from large-scale Git collaboration to this repository. GitHub remains the source of truth; this project does not need a custom Git server or a home-grown replacement for Git.

## 1. Work intake: one outcome per issue

Create one GitHub issue for each independently deliverable change. The issue should contain:
- The user problem and desired outcome.
- Acceptance criteria that can be checked against the real application.
- In-scope paths/modules and explicit non-goals.
- Dependencies such as provider credentials, database migrations, permissions, or another PR.
- A named owner and verification plan.

Use the Feature Request template for product work, Bug Report for defects, and Agent / Parallel Task for work delegated across agents. Do not start parallel implementation while file ownership is ambiguous.

## 2. Branch isolation

- `main` is the integration target. Contributors do their work on dedicated branches; no direct pushes to `main`.
- Branch names use `feat/`, `fix/`, `security/`, `perf/`, `docs/`, or `chore/` plus a short kebab-case subject.
- Keep a branch limited to one issue/outcome. Avoid long-lived branches containing unrelated features.
- Split parallel work by non-overlapping directories or files. Example: one task owns `src/api/`, another owns `src/workspace/`, and an integrator owns shared contracts. If two changes require the same interface file, agree on the interface first and serialize that edit.
- Do not share a mutable working tree between agents. Each task has its own branch/worktree and a written scope. The issue/PR is the coordination record; it is not a claim that an automated lock exists.
- Do not force-push or rewrite a branch another contributor may be using. Resolve conflicts with the branch owner and preserve the intent of both changes.

## 3. Pull request contract

When a task is ready and PR execution is authorized:
1. Open one normal, non-draft PR against `main`.
2. Link the issue and summarize the user-visible change.
3. List touched paths, API/schema changes, feature flags, environment variables, security/ownership effects, and rollback needs.
4. Complete the repository PR template. Mark checks as not run when they were not run.
5. Review the complete diff and check for secrets, generated artifacts, accidental unrelated changes, and stale assumptions.
6. Merge only after the required checks and review are satisfied.

A PR is a review boundary, not proof of completion. A merged source change is not proof that a database migration, provider configuration, production build, Android install, or deployment succeeded.

## 4. Existing GitHub Actions behavior

The workflows currently checked into this repository have these triggers:

| Workflow | Trigger | Work performed |
|---|---|---|
| `i18n-build.yml` | Pull request to `main`; manual dispatch | Installs dependencies, checks locale dictionaries, builds the web app |
| `offline-ai-ci.yml` | Pull request; manual dispatch | Installs dependencies, runs TypeScript validation, offline SHA regression checks, and web build |
| `android-offline-build.yml` | Pull request touching offline/Android-related paths; manual dispatch | Installs dependencies, builds web assets, syncs Capacitor and assembles a debug APK |
| `android-apk.yml` | Manual dispatch only | Builds and uploads a debug APK |

Opening/updating a PR can therefore start automated jobs even when an agent did not manually request them. The project owner controls whether PR creation and those automatic checks are authorized for a particular task. Do not manually dispatch workflows or describe an unexecuted workflow as passed.

When CI fails, inspect the exact run, failed job, and logs before changing code. Fix the root cause; do not disable a check merely to obtain a green status. If a check is unrelated or flaky, document the evidence and propose a scoped workflow improvement.

## 5. Review and integration

Reviewers should check, in order:
- Does the change solve the issue's stated problem?
- Are frontend routes, backend routes, schemas, provider IDs, and permissions consistent?
- Are unsupported capabilities disabled rather than simulated?
- Are secrets and private data kept out of the client, logs, and Git history?
- Are migrations additive and safe for existing installations?
- Are errors, cancellation, retries, and user recovery handled?
- Are localization, RTL, accessibility, and Android constraints respected where relevant?
- Is the PR small enough to review, and does the report distinguish implementation from verification?

The current repository connection could not read the main branch's protection settings. Do not assume that required reviews, status checks, or a merge queue are configured. The owner should inspect **Settings → Branches** in GitHub and enable the strongest protection available for `main` (block force pushes/deletion, require a PR, and require the relevant checks/review where supported). Re-check the actual settings before claiming enforcement.

## 6. Reliability principles for parallel work

Git's object model makes commits immutable, but it does not prevent two agents from making incompatible product decisions. Use these safeguards:
- Assign file ownership before parallel work.
- Keep commits focused and descriptive.
- Integrate small batches frequently rather than allowing many branches to drift.
- Review semantic conflicts, API contracts, database changes, and configuration names even when Git reports no textual conflict.
- Preserve request IDs, stable model IDs, audit events, and migration order across integrations.
- Record decisions in the issue/PR or a durable architecture document, not only in chat.

## 7. Definition of done

A task is ready for integration only when its acceptance criteria are met in source, security and data effects are documented, configuration requirements are explicit, the diff is reviewed, and verification status is honest. Use `docs/FINAL_REPORT_FORMAT.md` for the handoff report.

No custom Git service, distributed Git cache, or agent lock service is introduced by this guide. Those systems would add operational complexity without evidence that this repository needs them.

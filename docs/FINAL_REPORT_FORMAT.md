# AFG AI — Mandatory Final Implementation Report

Use this exact structure at the end of every implementation task or milestone. Keep the headings and report honestly. Do not omit incomplete work, configuration blockers, or verification limits.

```markdown
## AFG AI — Implementation Report

### ✅ Completed
- [feature] — [files touched] — [how verified in code]

### ⚠️ Partially Implemented
- [feature] — what exists — what's missing — why

### 🔒 Configuration Required (env / provider)
- KEY_NAME — purpose — where to obtain

### 🧪 Not Verified (by design, per rules)
- No tests/builds/deploys were run.

### 🚧 Recommended Next Steps
1. ...
2. ...

### 🧭 Known Limitations
- ...
```

## Reporting rules

1. **Completed** may contain only features that satisfy every applicable item in [Acceptance Criteria](./ACCEPTANCE_CRITERIA.md). Include concrete file paths and code-level evidence. If runtime verification was not performed, say so; code inspection alone is not proof of runtime behavior.
2. **Partially Implemented** must list what already exists, the exact missing acceptance criteria, and why the work is incomplete. Never move a partially implemented feature into Completed for presentation purposes.
3. **Configuration Required** lists only real, currently required environment variables, provider credentials, external services, permissions or migrations. For each item, state its purpose and the official place or administrator from which it is obtained. Never invent key names or imply that a key is required if code does not use it. If none are required for the task, write "None identified for this task."
4. **Not Verified** must state exactly which checks were not run: tests, type-check, lint, build, migration, deployment, manual UI verification or provider smoke test. Respect the project owner's instruction not to run tests/builds/deploys unless explicitly requested.
5. **Recommended Next Steps** must be actionable and ordered by dependency or priority.
6. **Known Limitations** must include relevant provider availability, localization coverage, platform constraints, migration state, security gaps and unverified behavior. Write "None identified" only after checking the relevant scope.
7. Never claim a feature is complete unless it satisfies all applicable Acceptance Criteria. Never hide a gap, infer provider support from configuration alone, fabricate test results, or describe a planned action as completed.
8. If a section has no entries, retain the heading and write "None identified for this task" or an equally explicit statement. Do not silently omit mandatory headings.

## Status vocabulary

- **Completed** — all applicable acceptance criteria satisfied with evidence.
- **Partially Implemented** — useful code/UI/API exists, but one or more acceptance criteria are unmet or unverified.
- **Blocked** — progress depends on missing credentials, provider capability, external service, permissions, migration or a product decision.
- **Not Verified** — no claim of runtime correctness is made because the corresponding verification was not performed.

The report is a delivery record, not marketing copy. Code committed, a route added, or a control displayed does not by itself establish end-to-end completion.

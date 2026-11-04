## Summary

<!-- What user problem does this solve? What changes for the user or operator? -->

## Tracking

- Issue: <!-- Fixes #123 / Related to #123 -->
- Work branch:
- Scope owner:

## Scope and isolation

- In-scope paths:
- Explicitly out of scope:
- Other active branches/PRs this change depends on:
- Confirmed no unrelated files or another task's branch were modified: [ ] Yes

## Implementation

- [ ] Frontend and backend behavior are connected; no dead control or simulated success was added.
- [ ] API contracts, validation, error handling, cancellation, and request IDs are consistent.
- [ ] Provider/model capabilities are based on verified support.
- [ ] Localization and RTL behavior were considered where applicable.

## Security and data

- [ ] No secrets, tokens, private payloads, or real user data are included in the diff.
- [ ] Server-side authorization, role checks, ownership, quotas, and CSRF are enforced where relevant.
- [ ] Database changes use a new additive migration; existing migrations were not edited.
- [ ] Data retention, backup, rollout, and rollback implications are documented.
- [ ] Logs and client errors are redacted.

## Verification

Mark only what actually happened.

- [ ] Source/diff review
- [ ] Unit/integration tests (list commands and results below)
- [ ] Type-check / lint (list commands and results below)
- [ ] Web build
- [ ] Android build / device check
- [ ] Provider smoke test
- [ ] Database migration / integration check

**Checks run and results:**

**Checks not run and reason:**

## Configuration and release

- Required environment variables / secrets:
- Required provider permissions or external services:
- Migration required? If yes, exact migration and whether it has been applied:
- Feature flag / rollout steps:
- Rollback plan:
- Deployment status (do not infer from merge):

## Known limitations

<!-- List remaining gaps. Write "None identified" only after reviewing the relevant scope. -->

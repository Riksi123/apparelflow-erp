# AI Optimization Report

Status: in progress. This report records actual AI-assisted work and review findings observed so far. It must be updated as implementation, testing, and deployment continue.

## 1. Tools and prompting

- ChatGPT/Codex was used for repository inspection, architecture planning from the supplied six-page assessment, scaffold/configuration work, Prisma schema and migration drafting, server-side workflow implementation, UI implementation, and domain-test design.
- The initial task prompt was the user's pasted project brief, which directed the agent to read the full assessment first and then proceed incrementally after user approval.
- Follow-up prompts were short milestone instructions such as "proceed" and asked for the next approved stage. The assessment PDF was treated as the business specification.

## 2. Flawed or sub-optimal AI-generated code found

1. The first cutting workspace implementation called a loader directly from a React effect. ESLint's `react-hooks/set-state-in-effect` rule flagged synchronous state changes from that effect. The loader was rewritten so state is updated from asynchronous fetch callbacks, with cleanup to ignore results after unmount.
2. The first hand-written SQL migration was maintained separately from the Prisma schema and could drift as models changed (for example, when the component variance audit snapshot was added). It was replaced with SQL generated from the Prisma schema, and subsequent additive changes were placed in their own migrations.
3. The generated Next.js project scaffold assumed a URL-friendly directory name and rejected the actual workspace path containing spaces and uppercase letters. Scaffolding was moved through a lowercase child directory. The interrupted move/install temporarily left an extra scaffold directory and a partial dependency tree; the extra directory was later removed and `npm ci` restored dependencies.
4. `@prisma/client` was pinned to 6.16.2 while the Prisma CLI/generator was 6.19.3. A clean install exposed missing generated enum/client exports, causing TypeScript and enum-based policy tests to fail. The package versions were aligned at 6.19.3 and the client regenerated; checks then passed.

## 3. Human review and refactoring

- The verifier approval service was reviewed against the security contract. It reloads the authenticated user's role from PostgreSQL, recalculates component expectations from recipe data, validates all counts, and writes the audit record and status transition in a serializable transaction.
- Expected quantities, traffic-light classification, approval eligibility, wastage calculation, role eligibility, state transitions, and the sewing queue filter were factored into a pure domain policy module and covered by Vitest tests.
- The sewing queue applies `status = VERIFIED` in the Prisma database query; it does not retrieve all orders and filter in the browser.
- Prisma generated migration SQL from the schema. A PostgreSQL trigger was added to make verification log rows resistant to update/delete operations.
- The absent PostgreSQL service was treated as a validation constraint, not a reason to weaken validation or RBAC.

## 4. Defensive architecture and security decisions

- Role and identity are obtained from an HTTP-only signed session and reloaded from the database. Request bodies cannot set role, verifier identity, status, expected component counts, or wastage.
- Approval is the only implemented route into `VERIFIED`; it is verifier-only, checks pending state, recalculates all recipe components, rejects missing/invalid/RED counts, computes wastage server-side, and atomically records the immutable approval data and transition.
- Rejection requires a trimmed non-empty reason and is logged with component count variance data.
- Sewing access is restricted to sewing supervisors, the queue query selects only verified orders, and starting assembly uses a conditional `VERIFIED → SEWING_IN_PROGRESS` database update.
- Rejected orders now return to their creating cutting supervisor for a re-cut. The immutable rejection snapshot stays in the audit log, current counts are reset, and re-verification is required after resubmission.

## Review status

- Core domain and mocked Prisma service tests: 20 passing with Vitest 3.2.7.
- Docker Compose configuration: `docker compose config --quiet` passed. Docker image build and runtime were not tested because the Docker daemon is unavailable.
- Prisma schema validation: passed.
- ESLint, TypeScript typecheck, production build, Prisma client generation, and schema validation: passed after aligning Prisma package versions.
- The npm dependency tree is now complete, and the temporary scaffold directory was removed.
- Contrast review found secondary text at 4.15:1 and input borders at 2.06:1. Colors were darkened; current sampled ratios are at least 4.97:1 for text and 3.48:1 for input borders.
- Real PostgreSQL integration tests, browser E2E tests, public deployment, and the final requirement audit: not yet completed.

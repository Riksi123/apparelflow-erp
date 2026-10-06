# ApparelFlow ERP

ApparelFlow is a production batch verification module for apparel manufacturing. It is being built in milestones around a server-enforced cutting quality gate and verified handoff to sewing.

## Architecture

The application uses Next.js App Router and TypeScript. PostgreSQL is the persistent relational database, accessed through Prisma. Domain rules and permission checks live in server-only services; browser input is never an authority for user role, verifier identity, expected component quantity, or order status.

## Technology

- Next.js App Router, React, TypeScript
- Tailwind CSS
- PostgreSQL and Prisma ORM
- Zod validation, Vitest domain/service tests, and Playwright for important end-to-end flows

## Local setup

1. Install Node.js and PostgreSQL.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`, a random `SESSION_SECRET` of at least 32 characters, and a private `DEMO_PASSWORD` of at least 12 characters.
3. Install dependencies with `npm install`.
4. Generate the Prisma client with `npm run db:generate`.
5. Create/apply the development schema with `npm run db:migrate` (or deploy checked-in migrations with `npm run db:deploy`).
6. Seed the production recipes with `npm run db:seed`.
7. Start the app with `npm run dev` and open `http://localhost:3000`.

Alternatively, with Docker Desktop running, set `SESSION_SECRET` and `DEMO_PASSWORD` in your shell and run `docker compose up --build`. Compose starts PostgreSQL, waits for its health check, applies migrations, seeds recipes/demo users, and starts the production server. The credentials in `compose.yaml` are for local development only.

Use `npm run db:deploy` to apply checked-in migrations in a deployment environment. Demo emails are `cutting.supervisor@apparelflow.local`, `cutting.verifier@apparelflow.local`, and `sewing.supervisor@apparelflow.local`; all use the private `DEMO_PASSWORD` value supplied at seed time.

## Data model and state

Prisma models cover users, recipes, recipe components, cutting orders, verification items, and verification logs. The lifecycle is `CUTTING_IN_PROGRESS → PENDING_VERIFICATION → VERIFIED → SEWING_IN_PROGRESS`, with `PENDING_VERIFICATION → REJECTED → CUTTING_IN_PROGRESS` for re-cutting. Server domain services enforce legal transitions.

The database seed contains the assessment's Casual Blouse (`REC-BL01`) and Crop Top (`REC-CT02`) recipes and exact component multipliers. When `DEMO_PASSWORD` is configured, it also creates the three demo accounts shown on the login page, storing bcrypt password hashes.

## Authentication and role enforcement

Login accepts email and password only. The authenticated role comes from the persisted user record; the browser cannot choose it. Sessions use an eight-hour, signed HS256 token in an HTTP-only, same-site cookie. Every server session lookup reloads the user and role from PostgreSQL so role changes and removed accounts take effect immediately. Set `SESSION_SECRET` to a unique random value for each deployment.

## Cutting order API

- `GET /api/recipes` returns recipe/component data to an authenticated cutting supervisor.
- `GET /api/cutting-orders` lists that supervisor's orders.
- `POST /api/cutting-orders` accepts `recipeId`, integer `targetQuantity`, `fabricRollId`, and positive `actualFabricYards`. Role and values are validated server-side; expected component counts are recalculated from recipe multipliers and written with the order in one transaction.

Order submission starts at `PENDING_VERIFICATION`, matching the assessment's submit behavior. Later state changes will be owned by verification and sewing domain operations.

Rejected batches stay visible to their creating cutting supervisor with the rejection audit preserved. `POST /api/cutting-orders/:orderId/recut` starts `REJECTED → CUTTING_IN_PROGRESS`, updates the recorded roll/fabric usage, and clears only current count fields. `POST /api/cutting-orders/:orderId/submit` returns a completed re-cut to `PENDING_VERIFICATION`; a new verification decision is required before sewing.

## Verification gate

- `GET /api/verification/pending` is cutting-verifier only and queries pending orders in the database.
- `GET /api/verification/:orderId` returns recipe components and current physical counts to a verifier.
- `PATCH /api/verification/:orderId` saves integer counts for components belonging to that order's recipe.
- `POST /api/verification/:orderId/approve` re-derives all expected quantities and traffic lights, calculates wastage on the server, and atomically writes the immutable approval log and transitions the order to `VERIFIED`.
- `POST /api/verification/:orderId/reject` requires a nonblank reason and atomically writes the rejection log and transitions the order to `REJECTED`.

Approval returns 403 for non-verifiers, 409 for an order in the wrong state, and 422 for missing/invalid counts or shortages. PostgreSQL rejects updates and deletes to verification log rows through the immutable audit trigger migration.

## Sewing handoff

- `GET /api/sewing/queue` is sewing-supervisor only and selects `status = VERIFIED` in its Prisma database query.
- `POST /api/sewing/:orderId/start` performs a conditional `VERIFIED → SEWING_IN_PROGRESS` update. Other roles receive 403 and stale/invalid transitions receive 409.

The sewing workspace shows component counts, verifier attribution and timestamp, stored component variances, and calculated fabric wastage from the approval audit. Starting assembly removes the order from the verified queue.

## Tests

Run unit and mocked service tests with `npm test`. They cover recipe multipliers, traffic-light statuses, GREEN/YELLOW approval, RED and incomplete-count hard stops, rejection reason validation, role checks, state transitions, wastage, transactional audit writes, and the verified-only sewing query predicate.

Two Playwright browser workflows cover GREEN approval through sewing and RED shortage rejection through re-cut/resubmission. To run them, start PostgreSQL, apply migrations, seed the demo accounts, set `DEMO_PASSWORD` to the seed password, and install Chromium with `npx playwright install chromium`; then run `npm run test:e2e`. Set `BASE_URL` to target an already running app instead of starting a local development server. The browser tests use timestamped fabric roll IDs and leave their resulting audit data in the database.

## Deployment

The Dockerfile builds Next.js in standalone mode and runs as an unprivileged user. For a cloud deployment, provide a managed PostgreSQL `DATABASE_URL`, a unique random `SESSION_SECRET` (at least 32 characters), and a private `DEMO_PASSWORD` (at least 12 characters). Run `npm run db:deploy` as a release step before routing traffic. Do not use the local Compose database password in a public environment. A public cloud deployment has not yet been created.

## Milestone status

- [x] Project scaffold and initial database schema/seed
- [x] Login, signed HTTP-only sessions, and server-derived role enforcement
- [x] Cutting supervisor order creation and persistent order list
- [x] Verifier terminal, server-side approval hard stop, rejection reason, and immutable audit trail
- [x] Verified-only sewing queue and guarded start-sewing transition
- [x] Re-cut and resubmission path for rejected orders
- [x] Core domain and mocked service tests (20 Vitest cases)
- [x] Playwright browser workflow specs authored and discoverable
- [x] Docker and Compose deployment configuration
- [ ] PostgreSQL-backed and browser E2E execution, public deployment, and final audit

<!--
  SYNC IMPACT REPORT
  ==================
  Version Change: 2.4.0 → 2.4.1
  Rationale: PATCH bump — Reword Principle XI's "Incremental Delivery by Journey"
             to "Incremental Delivery by Implementation Phase" to disambiguate from
             OwnYourGig's Customer Journey product entity (J-XXX rows). Clarify that
             implementation phases are author-side pacing within a single \build pass,
             NOT pipeline stage exits. The pipeline is single-pass per feature
             (spec → build → test → uat → release); never pause \build to ask user
             confirmation between phases.
  Date: 2026-04-30

  Previous Version History:
  - 2.3.0 → 2.4.0 (2026-04-05): Added Principle XI: Verification-Driven Implementation.
  - 2.2.0 → 2.3.0 (2026-03-30): Added Principle X: AI-Driven Implementation
    Pipeline (FR-105).
  - 2.1.0 → 2.2.0 (2026-03-04): Added Deployment & Hosting subsection to
    Technology Stack.
  - 2.0.0 → 2.1.0 (2026-03-02): Split Security from Performance, elevate Security
    to NON-NEGOTIABLE. Driven by FR-062 RLS audit.
  - 1.0.0 → 2.0.0 (2025-11-04): Complete architecture redesign from Rails to TypeScript/React
-->

# OwnYourGig Full-Stack Monorepo Constitution

## Project Overview

**OwnYourGig** -- The Gig Platform That's Actually On Your Side.

Own your work. Own your future.

## Core Principles

### I. Monorepo Architecture & Domain-Driven Design

**MUST** maintain clean separation between frontend, backend, and shared code:

- **Monorepo structure** with clear boundaries:
  - `apps/web/` - React frontend application
  - `apps/functions/` - Supabase Edge Functions (backend APIs)
  - `packages/` - Shared libraries (types, utils, configs)
  - `prisma/` - Database schema and migrations
- **Domain-Driven Design** where applicable:
  - Organize code by business domain, not technical layer
  - Keep related business logic together (cohesion)
  - Clear bounded contexts between domains
  - Shared kernel only for truly cross-domain concerns
- **API-first contracts**: Frontend and backend communicate via well-defined APIs
- **Dependency direction**: Frontend depends on backend contracts, never
  implementation details
- No circular dependencies between packages

**Rationale**: Monorepo enables code sharing and atomic changes while maintaining
separation of concerns. DDD reduces coupling and improves maintainability.

### II. TypeScript-First Development (Strict Mode) (NON-NEGOTIABLE)

**MUST** use TypeScript with strict mode across the entire stack:

- **`strict: true`** in all `tsconfig.json` files
- **Zero `any` types** - proper type definitions required for all values
- **Type inference preferred** over explicit types when clear
- **Type-safe database access** via Prisma (generated types from schema)
- **API contract types** shared between frontend and backend
- **Runtime validation** at API boundaries (Zod or similar)
- **Generic types** for reusable components and utilities
- **Discriminated unions** for state management and data variants

**Rationale**: TypeScript prevents entire classes of bugs at compile time. Strict
mode eliminates unsafe patterns. Type safety across the stack enables confident
refactoring and catches integration issues early.

### III. API-First Design with Contract-Driven Development

**MUST** design and document APIs before implementation:

- **API contracts defined first** using TypeScript types or OpenAPI schemas
- **Edge Functions** follow RESTful conventions:
  - `GET` for retrieval (idempotent, no side effects)
  - `POST` for creation
  - `PUT`/`PATCH` for updates
  - `DELETE` for removal
- **Consistent response format**:
  ```typescript
  { data: T } // Success
  { error: { code: string, message: string } } // Error
  ```
- **Status codes** used correctly:
  - `200` OK (success with body)
  - `201` Created
  - `400` Bad Request (client error)
  - `401` Unauthorized
  - `403` Forbidden
  - `404` Not Found
  - `500` Internal Server Error
- **Error handling** at all API boundaries:
  - Structured error responses
  - User-friendly error messages
  - Technical details logged but not exposed to client
- **API versioning** when breaking changes required (`/v1/`, `/v2/`)

**Rationale**: API-first design enables parallel frontend/backend development,
clear contracts prevent integration issues, and consistent patterns reduce bugs.

### IV. Component-Driven Frontend Architecture

**MUST** follow React and component-driven development best practices:

- **React with TypeScript** for all UI components
- **TanStack Router** for type-safe routing and navigation
- **Tailwind CSS** with utility-first approach + **shadcn/ui** for base
  components
- **Component architecture**:
  - Small, focused components (Single Responsibility)
  - Composition over prop drilling (Context for shared state)
  - Custom hooks for reusable logic
  - Presentational vs Container component separation when beneficial
- **Web-first, responsive design**:
  - Desktop as primary target
  - Mobile-responsive views via Tailwind breakpoints
  - Touch-friendly interactive elements
- **Accessibility (WCAG AA minimum)**:
  - Semantic HTML elements
  - ARIA labels where needed
  - Keyboard navigation support
  - Color contrast ratios meet AA standards
  - Focus management for modals/dialogs
- **State management**:
  - Server state via TanStack Query (React Query)
  - Client state via React hooks (useState, useReducer)
  - Avoid global state unless truly global
- **Performance**:
  - Lazy load routes via TanStack Router
  - Code splitting at route boundaries
  - Optimize bundle size (tree-shaking, dynamic imports)
  - Virtualize long lists

**Rationale**: Component-driven architecture enables reusability and testability.
Accessibility is non-negotiable. Performance patterns prevent slow user
experience.

### V. Supabase Backend Platform Standards

**MUST** leverage Supabase services correctly and securely:

- **Supabase Auth** for authentication:
  - SMS OTP as primary authentication method
  - Row Level Security (RLS) policies on all tables
  - JWT tokens for API authorization
  - No auth logic in Edge Functions (delegated to Supabase)
- **PostgreSQL + Prisma**:
  - Prisma schema as single source of truth
  - Migrations via `prisma migrate`
  - Type-safe queries via Prisma Client
  - Database indexes on foreign keys and queried columns
  - Constraints at database level (NOT NULL, UNIQUE, foreign keys)
- **Supabase Edge Functions**:
  - TypeScript for all functions
  - One function per logical endpoint/operation
  - Environment variables for configuration
  - CORS configured appropriately per environment
  - Rate limiting implemented via middleware
- **Supabase Storage**:
  - RLS policies on storage buckets
  - File uploads validated (type, size)
  - Signed URLs for temporary access
  - CDN-friendly paths for public assets
- **Stripe Integration**:
  - Webhooks handled via Edge Functions
  - Payment intents created server-side only
  - Idempotency keys for payment operations
  - Secure webhook signature verification
  - Payout tracking via Stripe Connect APIs

**Rationale**: Supabase provides managed backend infrastructure. Following
platform best practices ensures security, scalability, and maintainability.

### VI. Code Quality & SOLID Principles (NON-NEGOTIABLE)

**MUST** write clean, maintainable code following SOLID principles:

- **Single Responsibility Principle**:
  - Functions do one thing well
  - Components have one reason to change
  - Files focused on single concern
- **Open/Closed Principle**:
  - Extend behavior via composition, not modification
  - Use TypeScript generics for reusable abstractions
- **Liskov Substitution Principle**:
  - Interfaces and types honor contracts
  - Subtypes don't break parent expectations
- **Interface Segregation**:
  - Small, focused interfaces
  - No "fat" interfaces forcing unused dependencies
- **Dependency Inversion**:
  - Depend on abstractions (interfaces/types), not concrete implementations
  - Higher-level modules don't depend on lower-level details
- **Code quality rules**:
  - Maximum file length: **300 lines** (including tests)
  - Functions SHOULD be < 20 lines; > 50 lines requires justification
  - Meaningful names: `getUserById` not `get` or `fetch`
  - Prefer composition over inheritance (React functional components)
  - No dead code or unused imports (ESLint enforced)
  - Comments only for complex business logic, not obvious code
  - Consistent formatting via Prettier (auto-format on save)

**Rationale**: SOLID principles reduce coupling and improve testability. Code
quality standards prevent technical debt and improve long-term velocity.

### VII. Testing Standards & Coverage Requirements

**MUST** maintain comprehensive test coverage across the stack:

- **Unit tests** for business logic and utilities:
  - Pure functions tested in isolation
  - Edge cases and error conditions covered
  - Test framework: Vitest or Jest
- **Component tests** for React components:
  - User interactions tested via Testing Library
  - Render behavior and state changes validated
  - Accessibility checked via jest-axe
- **Integration tests** for API endpoints:
  - Edge Functions tested with real Supabase client
  - Request/response contracts validated
  - Error handling verified
- **Coverage target: 80% minimum**:
  - Enforced in CI pipeline
  - Exceptions documented (e.g., trivial getters/setters)
  - Trend tracked: coverage should not decrease
- **Test quality standards**:
  - Tests must be maintainable and readable
  - Descriptive test names: "should return error when user not found"
  - Arrange-Act-Assert pattern
  - No flaky tests (deterministic, no race conditions)
  - Fast execution (< 1 second per unit test)

**Rationale**: Tests catch regressions, enable refactoring, and serve as
documentation. 80% coverage ensures critical paths are validated.

### VIII. Security Engineering (NON-NEGOTIABLE)

**MUST** implement security from day one — security is a continuous process, not a one-time task:

- **OWASP Top 10 compliance**:
  - **Never commit secrets**: `.env` files in `.gitignore`
  - Environment variables for all sensitive data (API keys, DB URLs)
  - Input validation on all API endpoints (Zod schemas)
  - SQL injection prevention (Prisma parameterized queries)
  - XSS prevention (React auto-escapes, sanitize user HTML)
  - CSRF protection via Supabase Auth tokens
  - Rate limiting on public API endpoints (per IP/user)
  - Content Security Policy (CSP) headers
  - HTTPS only in production
  - Secure cookie settings (httpOnly, secure, sameSite)
- **Row Level Security (RLS)**:
  - RLS policies on ALL public schema tables — no exceptions
  - New tables MUST have RLS enabled in the same migration that creates them
  - RLS verification (`pnpm verify:rls`) MUST pass before any release
  - Migrations MUST be verified as applied, not just written (FR-062 lesson)
- **Data protection**:
  - User PII (phone numbers, names, addresses) encrypted at rest (Supabase default)
  - Minimal data collection — only store what's needed for functionality
  - User data accessible only to the owning user via RLS policies
  - Service role access restricted to Edge Functions (never client-side)
- **Dependency security**:
  - No libraries with known critical vulnerabilities
  - `npm audit` or equivalent run before releases
  - Library approval process enforced (see Approved Libraries section)
- **Pre-launch security checklist**:
  - [ ] All tables have RLS enabled (`pnpm verify:rls` passes)
  - [ ] No secrets in codebase (`git log` audit)
  - [ ] API endpoints validate all inputs (Zod schemas)
  - [ ] Auth tokens verified on all protected routes
  - [ ] Stripe webhook signatures verified
  - [ ] CORS configured for production domain only
  - [ ] Service role key never exposed to client

**Rationale**: Security vulnerabilities are expensive to fix post-release.
The FR-062 audit revealed 12 tables with RLS disabled in production despite
migrations being written — verification must be automated and continuous.

### IX. Performance Engineering

**MUST** meet performance targets for production readiness:

- **Performance targets**:
  - Initial page load: < 2 seconds (3G connection)
  - Time to Interactive (TTI): < 3 seconds
  - API response time: < 500ms p95
  - Database queries: < 100ms p95 (optimize with indexes)
  - Bundle size: < 500KB initial JavaScript (compressed)
- **Performance patterns**:
  - Code splitting at route level
  - Lazy load non-critical features
  - Image optimization (WebP, lazy loading, responsive sizes)
  - Database query optimization (no N+1, proper indexes)
  - Caching strategies (React Query for API, memoization for expensive
    computations)
- **Observability**:
  - Error tracking (Sentry or similar)
  - Performance monitoring (Supabase analytics + custom metrics)
  - Structured logging in Edge Functions
  - Key metrics: API latency, error rate, user session length

**Rationale**: Performance directly impacts user experience and business metrics.

### X. AI-Driven Implementation Pipeline (FR-105 — Foundational Pillar)

**MUST** deliver autonomous, end-to-end feature implementation from specification to production:

The AI-Driven Implementation Pipeline is the engine that powers AI DevPilot. It bridges Business, Analysis, and Engineering by consuming SpecKit artifacts (constitution, spec, plan, tasks, roadmap) and autonomously producing production-ready code — verified, deployed, and validated.

- **SpecKit Integration** (the pipeline's brain):
  - **Constitution-aware**: Generated code MUST comply with all constitution principles; the pipeline reads and enforces them automatically
  - **Spec-aware**: Implementation reads `spec.md` to understand user journeys, acceptance criteria, and business intent — not just task descriptions
  - **Plan-aware**: Generated code follows the technical approach, data models, and API contracts defined in `plan.md` and `contracts/`
  - **Roadmap-aware**: Pipeline checks existing features on the roadmap to avoid duplication, leverage existing components, and maintain consistency
  - **Context-aware codegen**: AI MUST read existing file contents before generating code — modify, never blindly replace
- **CI Pipeline Stages** (quality gates within Write Code):
  - Stage 1: **TypeScript** compilation (`tsc --noEmit`) — zero type errors
  - Stage 2: **ESLint** — zero lint errors on written files
  - Stage 3: **Vitest** — all tests pass on affected files
  - Each stage supports **AI auto-fix**: on failure, errors are sent back to AI with stage-specific fix prompts
  - Pipeline MUST complete all 3 stages before code is accepted
- **Autonomous Deployment** (post-CI):
  - Database migrations auto-applied after CI passes (not left as manual steps)
  - Edge Functions auto-deployed after CI passes
  - Rollback capability: if deployment fails, revert to pre-implementation state
- **Intelligent Task Management**:
  - Tasks auto-split when they exceed complexity thresholds (lines of code, number of files)
  - Dependency ordering respected — parallel tasks executed concurrently where safe
  - File-level context provided to each task (existing content, imports, exports)
- **Dev Release on Build Complete**:
  - When a feature reaches Build — Completed, it MUST be released in Dev (localhost) automatically
  - The Product Team must be able to test functionality and technical aspects immediately — no manual setup steps
  - Dev release includes: migrations applied locally, Edge Functions running, feature accessible in the UI
  - Feature status on the roadmap updated to reflect "Available for Testing in Dev"
- **Observability & Feedback Loop**:
  - Every implementation attempt logged (task ID, files written, CI results, fix attempts)
  - Failed implementations inform future codegen (learning from errors)
  - Pipeline progress visible in real-time via the DevPilot UI

**Rationale**: AI DevPilot's value proposition is simplifying the SDLC so that Business, Analysis, and Engineering collaborate seamlessly. The implementation pipeline is the mechanism that delivers this promise. Without autonomous, SpecKit-integrated implementation, every feature requires manual developer intervention — defeating the purpose of AI-driven development. FR-105 is foundational because every other feature (FR-108 testing, FR-109 validation, FR-111 review, FR-112 usage tracking) depends on a reliable implementation pipeline to deliver their code.

### XI. Verification-Driven Implementation (NON-NEGOTIABLE)

**MUST** verify each implementation step works before proceeding to the next:

AI-generated code has consistently produced integration defects when tasks are executed sequentially without verification. Unit tests alone are insufficient — most defects are integration bugs (wrong column names, missing RLS policies, mismatched API contracts, UI state issues) that only surface when components interact. This principle establishes verification as a mandatory quality gate at every level of implementation.

- **Task-Level Verification Gates**:
  - After each task, verify: Does it compile? (`pnpm tsc --noEmit`) Does the type check pass?
  - For database tasks: Does the migration apply? Does the query return expected results?
  - For Edge Functions: Does the function deploy? Does it respond correctly to a test request?
  - For frontend tasks: Does the component render without errors? Does the UI state behave correctly?
  - **DO NOT proceed to the next task until the current task is verified working**
- **Incremental Delivery by Implementation Phase** (developer discipline, NOT pipeline gating):
  - Within a single `\build` pass, implement the P1 phase first, then P2, then P3 — verifying each phase before moving on.
  - "Phase" here means an implementation priority slice within one feature, NOT a Customer Journey (which is the OwnYourGig product entity `J-XXX` in `product_features` with `feature_type='journey'`). Never label these implementation phases "Journey 1, Journey 2…".
  - Each phase must be internally verifiable (compiles, deploys, renders) before moving to the next phase.
  - **Do NOT pause `\build` to ask the user for confirmation between phases.** The pipeline is single-pass per feature (`spec → build → test → uat → release`); pausing mid-build at fake phase boundaries leaves `implementation_requests` and `pipeline_runs` in a half-populated state the pipeline was never designed to model.
  - User verification happens once at the end of `\build`, via `pnpm verify:feature FR-XXX --stage build`, not phase-by-phase.
- **Post-Implementation Self-Review** (before declaring any feature complete):
  - Error handling: Every async handler has try/catch with visible error UI
  - Type safety: No `any` types, all API contracts match between frontend and Edge Functions
  - RLS: All new tables have RLS policies (`pnpm verify:rls`)
  - Edge cases: Empty states, loading states, error states all handled
  - Regression: Existing features still work after new code lands
- **Structured Defect Resolution** (when defects are found post-implementation):
  - **Trace**: Identify which spec/task produced the defect
  - **Update artifact**: Edit acceptance criteria in spec.md or add a patch task in tasks.md
  - **Re-implement**: Fix from the updated artifact, not ad-hoc
  - **Verify**: Confirm the fix works before marking done
  - **NEVER vibe code a fix** — all defect fixes must be traceable to an artifact
- **Verification Over Testing**:
  - TDD is valuable for pure logic (calculations, validation, transformations)
  - But integration verification ("does this actually work end-to-end?") catches more defects than mocked unit tests
  - Prioritize: compile check → type check → integration verification → unit tests
  - Every task in tasks.md SHOULD include a verification criterion describing how to confirm it works

**Rationale**: Recent AI-generated features consistently required manual intervention to fix integration defects. The root cause was executing tasks sequentially without verifying each step worked before moving on. Errors in early tasks compounded through later ones, and context window pressure caused inconsistencies. This principle establishes verification discipline as a mandatory part of implementation — not optional, not aspirational, but required at every step. The cost of verifying is minutes; the cost of not verifying is hours of defect fixing.

## Technology Stack

**MUST** use these technologies unless specific feature requirements demand
alternatives:

### Frontend

- **Language**: TypeScript 5.0+ (strict mode)
- **Framework**: React 18+
- **Router**: TanStack Router (type-safe routing)
- **Styling**: Tailwind CSS 3+ with shadcn/ui component library
- **State Management**: TanStack Query (server state) + React hooks (client
  state)
- **Forms**: React Hook Form + Zod validation
- **Build Tool**: Vite
- **Testing**: Vitest + React Testing Library + jest-axe

### Backend

- **Platform**: Supabase (managed backend)
- **Runtime**: Supabase Edge Functions (Deno runtime, TypeScript)
- **Database**: PostgreSQL 14+ (Supabase-managed)
- **ORM**: Prisma 5+ (type-safe database access)
- **Authentication**: Supabase Auth (SMS OTP)
- **Storage**: Supabase Storage (file management)
- **Payments**: Stripe API + Stripe Connect (payouts)

### Shared/Tooling

- **Monorepo**: Turborepo or pnpm workspaces
- **Package Manager**: pnpm (fast, efficient)
- **Linting**: ESLint (TypeScript rules, React hooks rules)
- **Formatting**: Prettier (auto-format on save)
- **Type Checking**: TypeScript compiler + tsc --noEmit in CI
- **Environment**: dotenv for local, Supabase secrets for production

### Deployment & Hosting

- **Platform**: DigitalOcean App Platform (NOT Vercel, Netlify, or any other host)
- **Frontend**: Deployed as a Static Site (Vite build output)
- **Region**: SYD1 (Sydney, Australia)
- **Backend**: Supabase-hosted (Edge Functions, database, auth, storage)
- **Environment**: Development environment on DigitalOcean; Supabase manages all backend infrastructure

### Approved Libraries

Pre-vetted for common needs:

- `zod` - Schema validation and type inference
- `date-fns` - Date manipulation (tree-shakeable)
- `clsx` / `tailwind-merge` - Conditional class names
- `react-hook-form` - Form state management
- `@tanstack/react-query` - Server state caching
- `@tanstack/react-router` - Type-safe routing
- `lucide-react` - Icon library (tree-shakeable)
- `@stripe/stripe-js` - Stripe frontend SDK
- `stripe` (backend) - Stripe Node.js SDK

### Library Approval Process

New libraries require review:

1. Actively maintained (commit within 6 months)
2. TypeScript support (native or @types package)
3. Tree-shakeable (ESM support)
4. No critical security vulnerabilities
5. Bundle size impact acceptable (< 50KB gzipped)
6. Clear documentation and types

## Monorepo Structure

**MUST** follow this directory organization:

```
ownyourgig/
├── apps/
│   ├── web/                    # React frontend
│   │   ├── src/
│   │   │   ├── components/     # Reusable UI components
│   │   │   ├── features/       # Feature-specific code (domain-driven)
│   │   │   ├── lib/            # Utilities and helpers
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   ├── routes/         # TanStack Router routes
│   │   │   └── main.tsx        # Entry point
│   │   ├── public/             # Static assets
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   │
│   └── functions/              # Supabase Edge Functions
│       ├── _shared/            # Shared utilities for functions
│       ├── stripe-webhook/     # Individual function
│       ├── create-payment/
│       └── process-payout/
│
├── packages/
│   ├── types/                  # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── api.ts          # API contract types
│   │   │   ├── database.ts     # Prisma-generated types (re-exported)
│   │   │   └── common.ts       # Shared utility types
│   │   └── tsconfig.json
│   │
│   ├── config/                 # Shared configs (ESLint, Prettier, tsconfig)
│   │   ├── eslint-config/
│   │   ├── prettier-config/
│   │   └── tsconfig/
│   │
│   └── utils/                  # Shared utility functions
│       ├── src/
│       │   ├── date.ts
│       │   ├── validation.ts
│       │   └── formatting.ts
│       └── tsconfig.json
│
├── prisma/
│   ├── schema.prisma           # Database schema (single source of truth)
│   ├── migrations/             # Migration history
│   └── seed.ts                 # Seed data for development
│
├── supabase/
│   ├── config.toml             # Supabase project config
│   ├── migrations/             # Supabase-specific migrations (if needed)
│   └── functions/              # Symlink or copy of apps/functions/
│
├── docs/
│   ├── adr/                    # Architecture Decision Records
│   ├── api/                    # API documentation
│   └── guides/                 # Development guides
│
├── .github/
│   └── workflows/              # CI/CD pipelines
│
├── package.json                # Root package.json (workspaces)
├── pnpm-workspace.yaml         # pnpm workspace config
├── turbo.json                  # Turborepo config (if using Turbo)
├── .env.example                # Example environment variables
└── README.md                   # Project overview
```

## Development Workflow

**MUST** follow these development practices:

### Code Review Requirements

- **All code MUST be reviewed** before merging to `main`
- **Review checklist**:
  - [ ] TypeScript compiles without errors (`tsc --noEmit`)
  - [ ] ESLint passes (zero errors)
  - [ ] Tests written and passing (80% coverage maintained)
  - [ ] API contracts validated (types match between frontend/backend)
  - [ ] Constitution compliance verified
  - [ ] Security considerations addressed (no secrets, input validation)
  - [ ] Performance acceptable (no bundle size regressions)
  - [ ] Accessibility checked (no axe violations)

### Branch Strategy

- `main` branch is production-ready at all times
- Feature branches: `[###-feature-name]` (Specify workflow convention)
- No direct commits to `main`; all changes via Pull Requests
- Squash commits on merge for clean history

### CI/CD Requirements

- **CI pipeline MUST enforce**:
  - TypeScript compilation passes across all packages
  - ESLint passes (zero errors, warnings acceptable if documented)
  - Prettier formatting verified
  - Test suites pass (unit + integration + component)
  - Code coverage ≥ 80% (maintained or improved)
  - Bundle size checks (no regressions > 10%)
  - Dependency vulnerabilities scan (npm audit or similar)
- **Deployment gates**:
  - All CI checks green
  - At least one approval on PR
  - Staging deployment successful (for high-risk changes)

### Environment Management

- **Development**: Local Supabase via Docker, `.env.local`
- **Staging**: Separate Supabase project, `.env.staging`
- **Production**: Production Supabase project, `.env.production`
- **Secrets**: Never committed, managed via Supabase dashboard or CI variables

### Database Migrations

- **Schema changes via Prisma**:
  1. Update `prisma/schema.prisma`
  2. Run `prisma migrate dev --name descriptive-name`
  3. Review generated SQL migration
  4. Test migration locally
  5. Commit schema + migration files
- **Deployment**:
  - Migrations run automatically on deploy (or manually for high-risk)
  - Staging migrations tested before production
  - Zero-downtime patterns: add before remove, backfill data

## Member-Governed Business Model

OwnYourGig operates as a **member-governed platform** - owned and governed by its service provider members.

### Membership Tiers

| Tier          | Investment                   | Transaction Fee | Benefits                                                 |
| ------------- | ---------------------------- | --------------- | -------------------------------------------------------- |
| **Member**    | $1,500 (first 300 at $1,000) | 10%             | AI Coach, Voting Rights, Certification Path, Equity      |
| **Associate** | $0                           | 20%             | Marketplace access, Job matching, Bid & provide services |

### Fee Structure

- **Members pay 10% transaction fee** directly on completed jobs
- **Associates pay 20% transaction fee** directly on completed jobs
- Fees applied at the point of transaction—no monthly rebate complexity
- Fee tier determined by provider's enrollment status (enrollment_fee_paid)

### AI Coach (Members Only)

Exclusive 24/7 AI-powered business advisor providing:

- **Grow Your Business**: Smart pricing, bid writing tips, competitor trends
- **Market Intelligence**: Demand forecasts, seasonal planning, opportunity alerts
- **Training & Certification**: Certification prep, skills development, trade resources
- **Materials & Suppliers**: Best materials, top suppliers, cost estimates

### Democratic Governance

**Important**: Membership provides **voting rights only** - members do **NOT** receive share equity or ownership stakes in the platform. The investment is a membership fee that provides platform benefits and voting participation.

- **One member, one vote** - Members have equal voting rights on roadmap and platform features
- **Feature prioritization** - Members vote on which features and improvements to build next
- **Platform policies** - Major policy changes require member input and approval
- **Transparent operations** - Platform decisions and reasoning shared with all members

### First 300 Founding Member Discount

- First **300 Members** receive 33% discount: $1,000 instead of $1,500
- After 300 members, Membership investment is $1,500
- Founding members receive special recognition
- **Membership investment is a fee, not equity** - provides voting rights and platform benefits only

## Governance

This constitution **supersedes all other development practices** for this
project.

### Amendment Process

1. Proposed changes submitted as PR to `.specify/memory/constitution.md`
2. Include rationale and impact analysis in PR description
3. Requires team discussion and consensus
4. Version bump according to semantic versioning:
   - **MAJOR**: Principle removal or incompatible governance change (tech stack
     change)
   - **MINOR**: New principle or section added
   - **PATCH**: Clarifications, wording improvements
5. Update all dependent templates (plan, spec, tasks, CLAUDE.md) in same PR
6. Update `LAST_AMENDED_DATE` to amendment date

### Compliance & Enforcement

- **All Pull Requests MUST verify constitution compliance** before approval
- Constitution violations require either:
  - Code changes to comply, OR
  - Explicit justification documented in PR (rare exceptions only)
- Technical debt from non-compliance MUST be tracked and prioritized
- Review constitution quarterly; propose amendments as project evolves

### Complexity Justification

When constitution principles cannot be followed, **document in Complexity
Tracking** section of `plan.md`:

- Which principle violated
- Why needed for this feature
- What simpler alternative was rejected and why
- Migration plan to return to compliance (if applicable)

### Reference Documentation

- Runtime development guidance in `CLAUDE.md` (for AI assistants)
- Human developer onboarding in `README.md`
- API documentation in `docs/api/`
- Architecture Decision Records (ADRs) in `docs/adr/` for major technical
  choices
- Component storybook (if implemented) for UI component documentation

**Version**: 2.4.1 | **Ratified**: 2025-11-03 | **Last Amended**: 2026-04-30

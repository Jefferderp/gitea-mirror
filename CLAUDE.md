# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gitea Mirror is a self-hosted web application that automatically mirrors repositories from GitHub to Gitea instances. It's built with Astro (SSR mode), React, and runs on the Bun runtime with SQLite for data persistence.

**Key capabilities:**
- Mirrors public, private, and starred GitHub repos to Gitea
- Supports metadata mirroring (issues, PRs as issues, labels, milestones, releases, wiki)
- Git LFS support
- Multiple authentication methods (email/password, OIDC/SSO, header auth)
- Scheduled automatic syncing with configurable intervals
- Auto-discovery of new repos and cleanup of deleted repos
- Multi-user support with encrypted token storage (AES-256-GCM)

## Development Commands

### Setup and Installation
```bash
# Install dependencies
bun install

# Initialize database (first time setup)
bun run setup

# Clean start (reset database)
bun run dev:clean
```

### Development
```bash
# Start development server (http://localhost:4321)
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview

# Start production server
bun run start
```

### Testing
```bash
# Run all tests
bun test

# Run tests in watch mode
bun test:watch

# Run tests with coverage
bun test:coverage
```

**Test configuration:**
- Test runner: Bun's built-in test runner (configured in `bunfig.toml`)
- Setup file: `src/tests/setup.bun.ts` (auto-loaded via bunfig.toml)
- Timeout: 5000ms default
- Tests are colocated with source files using `*.test.ts` pattern

### Database Management
```bash
# Database operations via Drizzle
bun run db:generate    # Generate migrations from schema
bun run db:migrate     # Run migrations
bun run db:push        # Push schema changes directly
bun run db:studio      # Open Drizzle Studio (database GUI)
bun run db:check       # Check schema consistency

# Database utilities via custom scripts
bun run manage-db init       # Initialize database
bun run manage-db check      # Check database health
bun run manage-db fix        # Fix database issues
bun run manage-db reset-users # Reset all users
bun run cleanup-db           # Delete database file
```

### Utility Scripts
```bash
# Recovery and diagnostic scripts
bun run startup-recovery       # Recover from crashes
bun run startup-recovery-force # Force recovery
bun run test-recovery          # Test recovery mechanism
bun run test-shutdown          # Test graceful shutdown

# Environment configuration
bun run startup-env-config     # Load config from env vars
```

## Architecture

### Tech Stack
- **Frontend:** Astro v5 (SSR mode) + React v19 + Shadcn UI + Tailwind CSS v4
- **Backend:** Astro API routes (Node adapter, standalone mode)
- **Runtime:** Bun (>=1.2.9)
- **Database:** SQLite via Drizzle ORM
- **Authentication:** Better Auth (session-based)
- **APIs:** GitHub (Octokit with throttling plugin), Gitea REST API

### Directory Structure

```
src/
├── components/          # React components (UI, features)
│   ├── ui/             # Shadcn UI components
│   ├── repositories/   # Repository management components
│   ├── organizations/  # Organization management components
│   └── ...
├── pages/              # Astro pages and API routes
│   ├── api/            # API endpoints (Better Auth integration)
│   │   ├── auth/       # Authentication endpoints
│   │   ├── github/     # GitHub operations
│   │   ├── gitea/      # Gitea operations
│   │   ├── sync/       # Mirror sync operations
│   │   ├── job/        # Job management
│   │   └── ...
│   └── *.astro         # Page components
├── lib/                # Core business logic
│   ├── db/             # Database (Drizzle ORM)
│   │   ├── schema.ts   # Database schema with Zod validation
│   │   ├── index.ts    # Database instance and table exports
│   │   └── adapter.ts  # Better Auth SQLite adapter
│   ├── github.ts       # GitHub API client (Octokit)
│   ├── gitea.ts        # Gitea API client
│   ├── gitea-enhanced.ts # Enhanced Gitea operations (metadata)
│   ├── scheduler-service.ts # Automatic mirroring scheduler
│   ├── cleanup-service.ts   # Activity log cleanup
│   ├── repository-cleanup-service.ts # Orphaned repo cleanup
│   ├── auth.ts         # Better Auth configuration
│   ├── config.ts       # Configuration management
│   ├── helpers.ts      # Mirror job creation
│   ├── utils/          # Utility functions
│   │   ├── encryption.ts        # AES-256-GCM token encryption
│   │   ├── config-encryption.ts # Config token encryption
│   │   ├── duration-parser.ts   # Parse intervals (e.g., "8h", "30m")
│   │   ├── concurrency.ts       # Concurrency control utilities
│   │   └── mirror-strategies.ts # Mirror strategy logic
│   └── ...
├── types/              # TypeScript type definitions
├── tests/              # Test utilities and setup
└── middleware.ts       # Astro middleware (auth, session)

scripts/                # Utility scripts
├── manage-db.ts        # Database management CLI
├── startup-recovery.ts # Crash recovery
└── ...
```

### Key Architectural Patterns

#### 1. Database Schema and Validation
- **Location:** `src/lib/db/schema.ts`
- **Pattern:** Drizzle ORM tables + Zod schemas for validation
- **Key tables:**
  - `configs` - User configuration (GitHub/Gitea settings, mirror options)
  - `repositories` - Tracked repositories with metadata
  - `organizations` - GitHub organizations with destination overrides
  - `mirrorJobs` - Mirror job queue and history
  - `activities` - Activity log for dashboard
  - `user`, `session`, `account` - Better Auth tables

**Important:** All config tokens (GitHub/Gitea) are encrypted at rest using AES-256-GCM. Use helper functions from `src/lib/utils/config-encryption.ts` to decrypt.

#### 2. Mirror Job System
- **Location:** `src/lib/helpers.ts` (createMirrorJob)
- **Flow:**
  1. User triggers mirror via API endpoint
  2. `createMirrorJob()` creates job record with status "pending"
  3. Job processor (in API routes) performs GitHub → Gitea operations
  4. Job status updated throughout: "mirroring" → "success"/"failed"
  5. Events published via SSE for real-time UI updates

#### 3. GitHub ↔ Gitea Mirroring
- **GitHub Client:** `src/lib/github.ts` - Octokit with rate limit tracking
- **Gitea Client:** `src/lib/gitea.ts` - Basic repo operations
- **Enhanced Gitea:** `src/lib/gitea-enhanced.ts` - Metadata mirroring (issues, PRs, releases)

**Mirror strategies (configured per user):**
- `preserve` - Maintain GitHub org structure in Gitea
- `single-org` - All repos into one Gitea org
- `flat-user` - All repos under user account
- `mixed` - Personal repos in one org, org repos preserve structure

**Metadata mirroring:**
- Issues transferred with comments, labels, assignees
- PRs converted to issues (Gitea API limitation - cannot create PRs)
  - Tagged with "pull-request" label
  - Title prefixed with `[PR #number] [STATUS]`
  - Body includes commit history, file changes, merge status
- Releases mirrored with assets
- Labels and milestones preserved
- Wiki content cloned if enabled
- **Sequential processing:** Issues/PRs mirrored one at a time to prevent out-of-order creation (see `src/lib/gitea-enhanced.ts`)

#### 4. Scheduler Service
- **Location:** `src/lib/scheduler-service.ts`
- **Features:**
  - Cron-based or interval-based scheduling (uses `duration-parser.ts`)
  - Auto-start on boot when `SCHEDULE_ENABLED=true` or `GITEA_MIRROR_INTERVAL` is set
  - Auto-import new GitHub repos
  - Auto-cleanup orphaned repos (archive or delete)
  - Respects per-repo mirror intervals (not Gitea's default 24h)
- **Concurrency control:** Uses `src/lib/utils/concurrency.ts` for batch processing

#### 5. Authentication System
- **Location:** `src/lib/auth.ts`, `src/lib/auth-client.ts`
- **Better Auth integration:**
  - Email/password (always enabled)
  - OIDC/SSO providers (configurable via UI)
  - Header authentication for reverse proxies (Authentik, Authelia)
- **Session management:** Cookie-based, validated in Astro middleware
- **User helpers:** `src/lib/utils/auth-helpers.ts`

#### 6. Environment Configuration
- **Startup:** `src/lib/env-config-loader.ts` + `scripts/startup-env-config.ts`
- **Pattern:** Environment variables can pre-configure settings, but users can override via web UI
- **Encryption:** `ENCRYPTION_SECRET` for tokens, `BETTER_AUTH_SECRET` for sessions

#### 7. Real-time Updates
- **Events:** `src/lib/events.ts` + `src/lib/events/realtime.ts`
- **Pattern:** Server-Sent Events (SSE) for live dashboard updates
- **Endpoints:** `/api/sse` - client subscribes to job/repo events

### Testing Patterns

**Unit tests:**
- Colocated with source: `filename.test.ts` alongside `filename.ts`
- Use Bun's built-in assertions and mocking
- Mock external APIs (GitHub, Gitea) using `src/tests/mock-fetch.ts`

**Integration tests:**
- Located in `src/tests/`
- Test database operations with in-memory SQLite
- Example: `src/lib/db/index.test.ts`

**Test utilities:**
- `src/tests/setup.bun.ts` - Global test setup (loaded via bunfig.toml)
- `src/tests/mock-fetch.ts` - Fetch mocking utilities

### Important Development Notes

1. **Path Aliases:** Use `@/` for imports (configured in `tsconfig.json`)
   ```typescript
   import { db } from '@/lib/db';
   ```

2. **Token Encryption:** Always use encryption helpers when dealing with tokens:
   ```typescript
   import { getDecryptedGitHubToken, getDecryptedGiteaToken } from '@/lib/utils/config-encryption';
   ```

3. **API Route Pattern:** Astro API routes in `src/pages/api/` should:
   - Check authentication via Better Auth
   - Validate input with Zod schemas
   - Handle errors gracefully
   - Return JSON responses

4. **Database Migrations:**
   - Schema changes: Update `src/lib/db/schema.ts`
   - Generate migration: `bun run db:generate`
   - Review generated SQL in `drizzle/` directory
   - Apply: `bun run db:migrate` (or `db:push` for dev)

5. **Concurrency Control:**
   - Use utilities from `src/lib/utils/concurrency.ts` for batch operations
   - Respect rate limits (GitHub: 5000 req/hr authenticated, Gitea: varies)
   - Issue/PR mirroring is sequential to maintain chronological order

6. **Duration Parsing:**
   - Use `parseInterval()` from `src/lib/utils/duration-parser.ts`
   - Supports: "30m", "8h", "24h", "7d", cron expressions, or milliseconds

7. **Graceful Shutdown:**
   - Services implement cleanup handlers (see `src/lib/shutdown-manager.ts`)
   - Recovery system in `src/lib/recovery.ts` handles interrupted jobs

## Common Development Workflows

### Adding a new mirror option
1. Update Zod schema in `src/lib/db/schema.ts` (e.g., `giteaConfigSchema`)
2. Update TypeScript types in `src/types/config.ts`
3. Add UI control in settings page component
4. Update API handler in `src/pages/api/config/`
5. Implement logic in `src/lib/gitea.ts` or `src/lib/gitea-enhanced.ts`

### Debugging mirror failures
1. Check mirror jobs: `bun run db:studio` → `mirrorJobs` table
2. Review activity logs: Dashboard → Activity tab
3. Check console logs for API errors (GitHub/Gitea rate limits, auth issues)
4. Use diagnostic scripts: `bun run test-recovery`

### Adding authentication provider
1. Update Better Auth config in `src/lib/auth.ts`
2. Add provider configuration UI in settings
3. Test with `src/tests/test-gitea-auth.ts` patterns
4. Update documentation in `docs/SSO-OIDC-SETUP.md`

## Docker Deployment

- **Dockerfile:** Multi-stage build (bun base → build → production)
- **Entrypoint:** `docker-entrypoint.sh` - handles CA certs, user permissions, database init
- **Compose files:**
  - `docker-compose.alt.yml` - Quick start (pre-built image, minimal config)
  - `docker-compose.yml` - Full setup (build from source, all env vars)
  - `docker-compose.dev.yml` - Development with hot reload

## Additional Resources

- **Environment Variables:** See `docs/ENVIRONMENT_VARIABLES.md` for complete list
- **Development Workflow:** See `docs/DEVELOPMENT_WORKFLOW.md`
- **SSO Setup:** See `docs/SSO-OIDC-SETUP.md`
- **Contributing:** See `CONTRIBUTING.md` for code guidelines and scope
- **Graceful Shutdown:** See `docs/GRACEFUL_SHUTDOWN.md` for crash recovery details

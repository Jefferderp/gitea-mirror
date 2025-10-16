# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

DONT HALLUCIATE THINGS. IF YOU DONT KNOW LOOK AT THE CODE OR ASK FOR DOCS

NEVER MENTION CLAUDE CODE ANYWHERE.

## Project Overview

Gitea Mirror is a web application that automatically mirrors repositories from GitHub to self-hosted Gitea instances. It uses Astro for SSR, React for UI, SQLite for data storage, and Bun as the JavaScript runtime.

## Essential Commands

### Development
```bash
bun run dev          # Start development server (port 3000)
bun run build        # Build for production
bun run preview      # Preview production build
```

### Testing
```bash
bun test             # Run all tests
bun test:watch       # Run tests in watch mode
bun test:coverage    # Run tests with coverage
```

### Database Management
```bash
bun run init-db      # Initialize database
bun run reset-users  # Reset user accounts (development)
bun run cleanup-db   # Remove database files
```

### Production
```bash
bun run start        # Start production server
```

## Architecture & Key Concepts

### Technology Stack
- **Frontend**: Astro (SSR) + React + Tailwind CSS v4 + Shadcn UI
- **Backend**: Bun runtime + SQLite + Drizzle ORM
- **APIs**: GitHub (Octokit) and Gitea APIs
- **Auth**: Better Auth with email/password, SSO, and OIDC provider support

### Project Structure
- `/src/pages/api/` - API endpoints (Astro API routes)
- `/src/components/` - React components organized by feature
- `/src/lib/db/` - Database queries and schema (Drizzle ORM)
- `/src/hooks/` - Custom React hooks for data fetching
- `/data/` - SQLite database storage location

### Key Architectural Patterns

1. **API Routes**: All API endpoints follow the pattern `/api/[resource]/[action]` and use `createSecureErrorResponse` for consistent error handling:
```typescript
import { createSecureErrorResponse } from '@/lib/utils/error-handler';

export async function POST({ request }: APIContext) {
  try {
    // Implementation
  } catch (error) {
    return createSecureErrorResponse(error);
  }
}
```

2. **Database Queries**: Located in `/src/lib/db/queries/` organized by domain (users, repositories, etc.)

3. **Real-time Updates**: Server-Sent Events (SSE) endpoint at `/api/events` for live dashboard updates

4. **Authentication System**: 
   - Built on Better Auth library
   - Three authentication methods:
     - Email & Password (traditional auth)
     - SSO (authenticate via external OIDC providers)
     - OIDC Provider (act as OIDC provider for other apps)
   - Session-based authentication with secure cookies
   - First user signup creates admin account
   - Protected routes use Better Auth session validation

5. **Mirror Process**:
   - Discovers repos from GitHub (user/org)
   - Creates/updates mirror in Gitea
   - Tracks status in database
   - Supports scheduled automatic mirroring

6. **Mirror Strategies**: Four ways to organize repositories in Gitea:
   - **preserve**: Maintains GitHub structure (default)
     - Organization repos → Same organization name in Gitea
     - Personal repos → Under your Gitea username
   - **single-org**: All repos go to one organization
     - All repos → Single configured organization
   - **flat-user**: All repos go under user account
     - All repos → Under your Gitea username
   - **mixed**: Hybrid approach
     - Organization repos → Preserve structure
     - Personal repos → Single configured organization
   - Starred repos always go to separate organization (starredReposOrg, default: "starred")
   - Routing logic in `getGiteaRepoOwner()` function

### Database Schema (SQLite)
- `users` - User accounts and authentication
- `configs` - GitHub/Gitea connection settings
- `repositories` - Repository mirror status and metadata
- `organizations` - Organization structure preservation
- `mirror_jobs` - Scheduled mirror operations
- `events` - Activity log and notifications

### Testing Approach
- Uses Bun's native test runner (`bun:test`)
- Test files use `.test.ts` or `.test.tsx` extension
- Setup file at `/src/tests/setup.bun.ts`
- Mock utilities available for API testing.

### Development Tips
- Environment variables in `.env` (copy from `.env.example`)
- BETTER_AUTH_SECRET required for session signing
- Database auto-initializes on first run
- Use `bun run dev:clean` for fresh database start
- Tailwind CSS v4 configured with Vite plugin

### Authentication Setup
- **Better Auth** handles all authentication
- Configuration in `/src/lib/auth.ts` (server) and `/src/lib/auth-client.ts` (client)
- Auth endpoints available at `/api/auth/*`
- SSO providers configured through the web UI
- OIDC provider functionality for external applications

### Common Tasks

**Adding a new API endpoint:**
1. Create file in `/src/pages/api/[resource]/[action].ts`
2. Use `createSecureErrorResponse` for error handling
3. Add corresponding database query in `/src/lib/db/queries/`
4. Update types in `/src/types/` if needed

**Adding a new component:**
1. Create in appropriate `/src/components/[feature]/` directory
2. Use Shadcn UI components from `/src/components/ui/`
3. Follow existing naming patterns (e.g., `RepositoryCard`, `ConfigTabs`)

**Modifying database schema:**
1. Update schema in `/src/lib/db/schema.ts`
2. Run `bun run init-db` to recreate database
3. Update related queries in `/src/lib/db/queries/`

## Configuration Options

### GitHub Configuration (UI Fields)

#### Basic Settings (`githubConfig`)
- **username**: GitHub username
- **token**: GitHub personal access token (requires repo and admin:org scopes)
- **privateRepositories**: Include private repositories
- **mirrorStarred**: Mirror starred repositories

### Gitea Configuration (UI Fields)
- **url**: Gitea instance URL
- **username**: Gitea username
- **token**: Gitea access token
- **organization**: Destination organization (for single-org/mixed strategies)
- **starredReposOrg**: Organization for starred repositories (default: "starred")
- **visibility**: Organization visibility - "public", "private", "limited"
- **mirrorStrategy**: Repository organization strategy (set via UI)
- **preserveOrgStructure**: Automatically set based on mirrorStrategy

### Schedule Configuration (`scheduleConfig`)
- **enabled**: Enable automatic mirroring (default: false)
- **interval**: Cron expression or seconds (default: "0 2 * * *" - 2 AM daily)
- **concurrent**: Allow concurrent mirror operations (default: false)
- **batchSize**: Number of repos to process in parallel (default: 10)

### Database Cleanup Configuration (`cleanupConfig`)
- **enabled**: Enable automatic cleanup (default: false)
- **retentionDays**: Days to keep events (stored as seconds internally)

### Mirror Options (UI Fields)
- **mirrorReleases**: Mirror GitHub releases to Gitea
- **mirrorLFS**: Mirror Git LFS (Large File Storage) objects
  - Requires LFS enabled on Gitea server (LFS_START_SERVER = true)
  - Requires Git v2.1.2+ on server
- **mirrorMetadata**: Enable metadata mirroring (master toggle)
- **metadataComponents** (only available when mirrorMetadata is enabled):
  - **issues**: Mirror issues
  - **pullRequests**: Mirror pull requests  
  - **labels**: Mirror labels
  - **milestones**: Mirror milestones
  - **wiki**: Mirror wiki content

### Advanced Options (UI Fields)
- **skipForks**: Skip forked repositories (default: false)
- **starredCodeOnly**: Skip issues for starred repositories (default: false) - enables "Lightweight mode" for starred repos

### Repository Statuses
Repositories can have the following statuses:
- **imported**: Repository discovered from GitHub
- **mirroring**: Currently being mirrored to Gitea
- **mirrored**: Successfully mirrored
- **syncing**: Repository being synchronized
- **synced**: Successfully synchronized
- **failed**: Mirror/sync operation failed
- **skipped**: Skipped due to filters or conditions
- **ignored**: User explicitly marked to ignore (won't be mirrored/synced)
- **deleting**: Repository being deleted
- **deleted**: Repository deleted

### Scheduling and Synchronization (Issue #72 Fixes)

#### Fixed Issues
1. **Mirror Interval Bug**: Added `mirror_interval` parameter to Gitea API calls when creating mirrors (previously defaulted to 24h)
2. **Auto-Discovery**: Scheduler now automatically discovers and imports new GitHub repositories
3. **Interval Updates**: Sync operations now update existing mirrors' intervals to match configuration
4. **Repository Cleanup**: Integrated automatic cleanup of orphaned repositories (repos removed from GitHub)

#### Environment Variables for Auto-Import
- **AUTO_IMPORT_REPOS**: Set to `false` to disable automatic repository discovery (default: enabled)

#### How Scheduling Works
- **Scheduler Service**: Runs every minute to check for scheduled tasks
- **Sync Interval**: Configured via `GITEA_MIRROR_INTERVAL` or UI (e.g., "8h", "30m", "1d")
- **Auto-Import**: Checks GitHub for new repositories during each scheduled sync
- **Auto-Cleanup**: Removes repositories that no longer exist in GitHub (if enabled)
- **Mirror Interval Update**: Updates Gitea's internal mirror interval during sync operations

### Authentication Configuration

#### SSO Provider Configuration
- **issuerUrl**: OIDC issuer URL (e.g., https://accounts.google.com)
- **domain**: Email domain for this provider
- **providerId**: Unique identifier for the provider
- **clientId**: OAuth client ID from provider
- **clientSecret**: OAuth client secret from provider
- **authorizationEndpoint**: OAuth authorization URL (auto-discovered if supported)
- **tokenEndpoint**: OAuth token exchange URL (auto-discovered if supported)
- **jwksEndpoint**: JSON Web Key Set URL (optional, auto-discovered)
- **userInfoEndpoint**: User information endpoint (optional, auto-discovered)

#### OIDC Provider Settings (for external apps)
- **allowedRedirectUris**: Comma-separated list of allowed redirect URIs
- **clientId**: Generated client ID for the application
- **clientSecret**: Generated client secret for the application
- **scopes**: Available scopes (openid, profile, email)

#### Environment Variables
- **BETTER_AUTH_SECRET**: Secret key for signing sessions (required)
- **BETTER_AUTH_URL**: Base URL for authentication (default: http://localhost:4321)

## Security Guidelines

- **Confidentiality Guidelines**:
  - Dont ever say Claude Code or generated with AI anyhwere.
- Never commit without the explicict ask
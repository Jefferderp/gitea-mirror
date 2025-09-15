# Implementation Specifications: Starred Repository Organization Management

## Scope
- Documentation to implement configurable management for starred repositories with two strategies:
  - Single Organization (default, backward compatible).
  - Preserve Structure (create/manage Gitea orgs per GitHub owner).
- Implementation completed with precise file references and line numbers.

## Cross-references
- Architecture and logic: [STARRED_REPO_DESIGN.md](STARRED_REPO_DESIGN.md), [STARRED_REPO_LOGIC_MODIFICATIONS.md](STARRED_REPO_LOGIC_MODIFICATIONS.md), [MIRROR_DESTINATION_LOGIC_UPDATES.md](MIRROR_DESTINATION_LOGIC_UPDATES.md)
- Database: [DATABASE_MIGRATION_PLAN.md](DATABASE_MIGRATION_PLAN.md)
- API: [API_ENDPOINT_EXTENSIONS.md](API_ENDPOINT_EXTENSIONS.md)
- Backend processing: [BACKEND_PROCESSING_LOGIC_UPDATES.md](BACKEND_PROCESSING_LOGIC_UPDATES.md)
- UI: [UI_COMPONENT_UPDATES.md](UI_COMPONENT_UPDATES.md), [CONFIGURATION_OPTIONS.md](CONFIGURATION_OPTIONS.md)
- Testing: [COMPREHENSIVE_TESTING_PLAN.md](COMPREHENSIVE_TESTING_PLAN.md)
- User docs: [DOCUMENTATION_AND_USER_GUIDES.md](DOCUMENTATION_AND_USER_GUIDES.md)

## Defaults and backward compatibility
- New enum starredReposStrategy supports "single-organization" | "preserve-structure".
- Default to "single-organization" for all existing and new configs.
- Accept legacy "single-org" value and normalize to "single-organization" at load/migration time to avoid breaking existing docs/tests referencing "single-org".

## Phase 1 – Database Migration

### Tables and artifacts to modify
- Organizations table:
  - Add column organization_type TEXT DEFAULT 'joined' NOT NULL CHECK (organization_type IN ('joined', 'starred-owner')).
  - Add column source_owner TEXT NULL.
  - Add composite index idx_organizations_type_source on (organization_type, source_owner).
- Configs table:
  - starredReposStrategy is stored within JSON column github_config; no SQL column required.
  - Update Zod schema and types for JSON validation defaults.

### Current schema references
- Organizations table definition starts at [src/lib/db/schema.ts:428](src/lib/db/schema.ts:428).
- GitHub config schema starts at [src/lib/db/schema.ts:16](src/lib/db/schema.ts:16).

### New columns and rationale
- organization_type (TEXT):
  - Enum semantics: "joined" | "starred-owner".
  - Default: "joined".
  - Used to distinguish organizations originating from starred repo owners.
- source_owner (TEXT):
  - Stores GitHub owner login for "starred-owner" organizations.
  - Enables lookups, filtering, and display.

### Migration filename and contents
- Created [drizzle/0006_starred_strategy.sql](drizzle/0006_starred_strategy.sql) with:
  - SQL (SQLite):
    - ALTER TABLE organizations ADD COLUMN organization_type TEXT DEFAULT 'joined' NOT NULL CHECK (organization_type IN ('joined', 'starred-owner'));
    - ALTER TABLE organizations ADD COLUMN source_owner TEXT;
    - CREATE INDEX IF NOT EXISTS idx_organizations_type_source ON organizations(organization_type, source_owner);
    - UPDATE organizations SET organization_type = 'joined' WHERE organization_type IS NULL;
- Rollback guidance:
  - SQLite does not support DROP COLUMN. For rollback, either:
    - Keep no-op rollback (safe, non-breaking).
    - Or perform table-rebuild pattern if absolutely needed (out of scope for this release). Documented in [DATABASE_MIGRATION_PLAN.md](DATABASE_MIGRATION_PLAN.md).

### Data backfill and defaults
- All existing org rows get organization_type='joined'.
- source_owner remains NULL unless created as a starred-owner org.
- Config defaults applied in Zod/type layer ensure starredReposStrategy = "single-organization" when missing.

### Zod schema/type mapping updates
- Add starredReposStrategy to githubConfig Zod schema with default, and expose in types:
  - Update [src/lib/db/schema.ts:28](src/lib/db/schema.ts:28) to include:
    - starredReposStrategy: z.enum(["single-organization", "preserve-structure"]).default("single-organization"),
    - Accept legacy alias "single-org" during load by normalization in config loaders (see Phase 4).
- Extend organization schema types (consumer-side type, not DB schema object) with:
  - organizationType: "joined" | "starred-owner"
  - sourceOwner?: string

### Acceptance criteria (Phase 1)
- Migration applies cleanly: new columns exist, index created, backfill executed.
- Drizzle connects successfully post-migration (see [src/lib/db/index.ts:35](src/lib/db/index.ts:35)).
- Config Zod validation accepts starredReposStrategy and applies default when missing.
- No data loss; existing flows operate unchanged.

## Phase 2 – Configuration UI

### UI requirements
- Add radio group control "Starred Repos Strategy" with two options:
  - Single Organization (default).
  - Preserve Structure.
- When "Single Organization" selected, show and validate organization name input (reuses existing starred org behavior).
- A11y: Use existing radio group component.

### Exact UI integration points
- Use RadioGroup from [src/components/ui/radio-group.tsx:43](src/components/ui/radio-group.tsx:43).
- Primary config page/components:
  - [src/components/config/StarredReposStrategy.tsx:17](src/components/config/StarredReposStrategy.tsx:17)
  - [src/components/config/OrganizationConfiguration.tsx:57-84](src/components/config/OrganizationConfiguration.tsx:57)

### State shape and API payloads
- Add optional starredReposStrategy?: "single-organization" | "preserve-structure".
- Location: GitHubConfig in [src/types/config.ts:41](src/types/config.ts:41) alongside mirrorStarred.
  - Update GitHubConfig:
    - starredReposStrategy?: "single-organization" | "preserve-structure"
- SaveConfigApiRequest remains in [src/types/config.ts:63](src/types/config.ts:63); include the above in githubConfig in requests and responses.

### Validation
- If starredReposStrategy === "single-organization":
  - Require starredReposOrg input (existing field).
  - Validate with same constraints used today (alphanumeric, hyphens, underscores).
- If "preserve-structure":
  - Hide starredReposOrg input (not used for starred repos routing in this mode).

### Acceptance criteria (Phase 2)
- Radio selection persists in config and round-trips via API.
- "Single Organization" shows org name input; "Preserve Structure" hides it.
- A11y is preserved; no regressions for other config controls.

## Phase 3 – Core Logic

### Branch by strategy in starred processing
- Starred orchestration entrypoints:
  - [export async function processStarredRepositories](src/lib/starred-repos-handler.ts:21)
  - [async function processStarredRepository](src/lib/starred-repos-handler.ts:145)
- Strategy logic (high-level):
  - Strategy is derived from config.githubConfig.starredReposStrategy with default "single-organization".
  - If "single-organization":
    - Maintain current behavior with starredReposOrg (or fallback "starred").
  - If "preserve-structure":
    - For each starred repo, resolve GitHub owner (repository.fullName split by "/").
    - Get or create Gitea organization named after the owner.
    - Ensure parity features: destination overrides, include/ignore, status tracking apply identically to these starred-owner orgs.

### Organization creation utilities
- Reuse enhanced org-creation with retries:
  - [export async function getOrCreateGiteaOrgEnhanced](src/lib/gitea-enhanced.ts:69)
  - Optional batch-safe creation:
  - [export async function createOrganizationsSequentially](src/lib/gitea-enhanced.ts:462)

### Parities to enforce
- Destination overrides: repository.destinationOrg and organization.destinationOrg remain respected.
- Include/Ignore: organization.isIncluded and include/exclude lists continue to filter as today.
- Status tracking: use mirrorJobs and repo/org statuses consistently, as already done in:
  - [export const mirrorGithubRepoToGitea](src/lib/gitea.ts:274)
  - [export async function mirrorGitHubOrgToGitea](src/lib/gitea.ts:1062)

### Acceptance criteria (Phase 3)
- "Preserve Structure" results in per-owner Gitea org routing for starred repos.
- No change in behavior for non-starred repos or for starred repos when strategy is "single-organization".
- Logs and DB statuses reflect accurate target owners and locations.

## Phase 4 – Destination Routing and API

### Destination routing algorithm
- Entry point:
  - [export const getGiteaRepoOwnerAsync](src/lib/gitea.ts:56)
- Current starred behavior:
  - At [src/lib/gitea.ts:75], starred repos route to starredReposOrg or "starred".
- Required update:
  - If repository.isStarred and config.githubConfig.starredReposStrategy === "preserve-structure":
    - Return GitHub owner (from repository.fullName prefix) unless an org-specific destination override exists.
    - If an override exists in DB for that org, use it (via [export const getOrganizationConfig](src/lib/gitea.ts:19)).
  - Else preserve current behavior.

### API endpoint adjustments
- Document query parameters and response fields in [API_ENDPOINT_EXTENSIONS.md](API_ENDPOINT_EXTENSIONS.md):
  - Add organizationType filter param (joined | starred-owner | all).
  - Return organizationType and sourceOwner where applicable.
- Likely handlers to extend (Astro API routes):
  - [src/pages/api/github/organizations.ts](src/pages/api/github/organizations.ts)
  - [src/pages/api/github/repositories.ts](src/pages/api/github/repositories.ts)
  - Any org detail/status endpoints under [src/pages](src/pages)

### Types, serializers, validators
- Update Organization type shape in consumer types to include:
  - organizationType?: "joined" | "starred-owner"
  - sourceOwner?: string
- Ensure request/response serializers pass through starredReposStrategy, organizationType, sourceOwner.

### Acceptance criteria (Phase 4)
- getGiteaRepoOwnerAsync returns correct owner for starred repos in both strategies.
- API supports filtering or distinguishing starred-owner orgs without breaking existing clients.

## Phase 5 – UI Integration

### Visual requirements
- Starred-owner organizations should display with amber theme and star icon.
- Use existing ShadCN components.

### Components and styling
- Organization list/cards (implementation locations vary by app layout; entry page is):
  - [src/pages/organizations.astro](src/pages/organizations.astro)
  - Shared UI components:
    - [src/components/ui/badge.tsx](src/components/ui/badge.tsx)
    - [src/styles/global.css](src/styles/global.css)
- Rendering hints:
  - Add a Badge with icon for starred-owner orgs.
  - Ensure list filtering can include a "Starred-owner" filter using org type.

### Feature guard/backward compatibility
- If starredReposStrategy is not "preserve-structure", do not show extra filtering affordances that could confuse users.
- Star icon should only appear where organizationType === "starred-owner".

### Acceptance criteria (Phase 5)
- Starred-owner orgs stand out visually with an amber theme and star.
- Filters or badges do not disrupt current joined org experiences.

## Phase 6 – Testing

### Unit tests
- Destination routing:
  - [src/lib/gitea.test.ts](src/lib/gitea.test.ts)
  - Add tests ensuring:
    - Starred + single-organization returns starredReposOrg or "starred".
    - Starred + preserve-structure returns GitHub owner or org override.
- Starred orchestration:
  - [src/lib/gitea-starred-repos.test.ts](src/lib/gitea-starred-repos.test.ts)
  - Add coverage for branching logic and idempotent mirror behavior.
- Org creation:
  - [src/lib/gitea-org-creation.test.ts](src/lib/gitea-org-creation.test.ts)
  - Ensure retries and duplicate handling are validated for per-owner org creation.

### Integration/API tests
- API handlers:
  - Extend or add tests under [src/pages](src/pages) for organizations endpoint filtering by type and inclusion of new fields.

### UI tests (component-level)
- Component tests for radio selection, visibility of starred org name input, and badges for starred-owner orgs:
  - Use Bun test runner (see [bunfig.toml](bunfig.toml) and [src/tests/setup.bun.ts](src/tests/setup.bun.ts)).

### Migration verification
- Exercise migration entry scripts:
  - [scripts/run-migration.ts](scripts/run-migration.ts)
  - [scripts/manage-db.ts](scripts/manage-db.ts)
- Validate that existing datasets continue to function (strict BC).

### Acceptance criteria (Phase 6)
- Tests added/updated to cover both strategies and org creation paths.
- Migration scripts pass locally and in CI with no regressions.

## Phase 7 – Deployment and Rollback

### Deployment notes
- Environment variables unaffected; config defaulting covers starredReposStrategy.
- Include migration in CI/CD step (drizzle migrations auto-run at app boot via [src/lib/db/index.ts:41](src/lib/db/index.ts:41)).

### Rollback strategy
- Application-level: switch strategy back to "single-organization". No data loss.
- Database-level: retain new columns (SQLite drop column is non-trivial). Safe to keep even if not used.
- If hard rollback is mandatory, apply table-rebuild pattern as documented in [DATABASE_MIGRATION_PLAN.md](DATABASE_MIGRATION_PLAN.md).

### Operational runbook (commands)
- Setup:
  - bun run setup
- Generate/apply migrations:
  - bun run db:generate
  - bun run db:migrate
  - Validate: bun run manage-db check
- Dev server:
  - bun run dev
- Tests:
  - bun test
  - bun run test:coverage

## Appendix A – Concrete Migration Plan

### New migration file
- Created [drizzle/0006_starred_strategy.sql](drizzle/0006_starred_strategy.sql) with:

```sql
-- Starred Repository Organization Strategy Support

-- 1) Extend organizations with type and source owner
ALTER TABLE organizations ADD COLUMN organization_type TEXT DEFAULT 'joined' NOT NULL CHECK (organization_type IN ('joined', 'starred-owner'));
ALTER TABLE organizations ADD COLUMN source_owner TEXT;

-- 2) Index to accelerate filtering and lookups
CREATE INDEX IF NOT EXISTS idx_organizations_type_source
ON organizations(organization_type, source_owner);

-- 3) Backfill existing rows
UPDATE organizations SET organization_type = 'joined' WHERE organization_type IS NULL;
```

### Rollback
- Non-destructive rollback: leave columns in place; drop index if required.
```sql
DROP INDEX IF EXISTS idx_organizations_type_source;
```
- Full column removal requires table rebuild (out of scope; see [DATABASE_MIGRATION_PLAN.md](DATABASE_MIGRATION_PLAN.md)).

## Appendix B – Type and Validator Mapping

### Zod configuration schema
- Update [src/lib/db/schema.ts:28](src/lib/db/schema.ts:28) githubConfigSchema to include:
```ts
// Add directly under existing starredReposOrg/mirrorStrategy fields
starredReposStrategy: z.enum(["single-organization", "preserve-structure"]).default("single-organization"),
```
- Legacy normalization:
  - If loaded value is "single-org", normalize to "single-organization" in config loader (see env/config loader mapping below).

### TypeScript types
- Update GitHubConfig in [src/types/config.ts:41](src/types/config.ts:41):
```ts
export interface GitHubConfig {
  username: string;
  token: string;
  privateRepositories: boolean;
  mirrorStarred: boolean;
  starredDuplicateStrategy?: DuplicateNameStrategy;
  starredReposStrategy?: "single-organization" | "preserve-structure"; // NEW
}
```

### Config loaders and mappers
- Extend environment/config mapping to normalize values:
  - [src/lib/env-config-loader.ts](src/lib/env-config-loader.ts)
  - [src/lib/utils/config-mapper.ts](src/lib/utils/config-mapper.ts)
- Normalization rules:
  - If starredReposStrategy === "single-org" then treat as "single-organization".
  - If missing, set to "single-organization".

## Appendix C – Destination Routing Details

### Function to update
- [export const getGiteaRepoOwnerAsync](src/lib/gitea.ts:56)
- Insert starred strategy branch near starred check [src/lib/gitea.ts:75]:
  - If repository.isStarred and githubConfig.starredReposStrategy === "preserve-structure":
    - Compute githubOwner = repository.fullName.split("/")[0]
    - Check for override in DB via [export const getOrganizationConfig](src/lib/gitea.ts:19)
    - Return override destination if present; else return githubOwner
  - Else continue current path of returning starredReposOrg or "starred".

## Appendix D – Core Starred Processing Hooks

### Primary orchestrators
- [export async function processStarredRepositories](src/lib/starred-repos-handler.ts:21)
- [async function processStarredRepository](src/lib/starred-repos-handler.ts:145)

### Org creation utility
- [export async function getOrCreateGiteaOrgEnhanced](src/lib/gitea-enhanced.ts:69)
- Optional sequential creation:
- [export async function createOrganizationsSequentially](src/lib/gitea-enhanced.ts:462)

### Org override lookups
- [export const getOrganizationConfig](src/lib/gitea.ts:19)

## Appendix E – UI Implementation Notes

### Controls
- Radio group: [export { RadioGroup, RadioGroupItem }](src/components/ui/radio-group.tsx:43)
- Strategy placement:
  - [src/components/config/StarredReposStrategy.tsx:17](src/components/config/StarredReposStrategy.tsx:17)
  - [src/components/config/OrganizationConfiguration.tsx:57-84](src/components/config/OrganizationConfiguration.tsx:57)

### Badges/icons
- Badge: [src/components/ui/badge.tsx](src/components/ui/badge.tsx)
- Styles: [src/styles/global.css](src/styles/global.css)
- Starred organization visual distinction: [src/components/organizations/OrganizationsList.tsx:188-299](src/components/organizations/OrganizationsList.tsx:188)

## Acceptance Checklist (All Phases)

- Database
  - Columns organization_type, source_owner exist; index created; backfill done.
  - Config Zod/Types accept starredReposStrategy with default.

- UI
  - Radio control toggles between modes; org name input shown only for Single Organization.
  - State persists and round-trips via API.

- Logic
  - getGiteaRepoOwnerAsync returns owner per strategy, including overrides.
  - Starred processing creates/uses per-owner orgs in preserve-structure.

- API
  - Endpoints can filter/report starred-owner orgs.
  - No breaking changes to existing consumers.

- UI Integration
  - Starred-owner orgs rendered with amber + star decorations.

- Tests
  - Unit and integration coverage updated for both strategies.
  - Migration verified locally and in CI.

- Rollout
  - Default remains Single Organization; opt-in for Preserve Structure.
  - Safe rollback path via strategy switch; DB columns can remain safely.

This comprehensive implementation specification provides the complete technical details for the starred repository organization feature, with all file paths and line numbers accurately referenced from the actual implementation.
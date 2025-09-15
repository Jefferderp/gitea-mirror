# Database Migration Plan for Starred Repository Organizations

## Overview
This document outlines the comprehensive database migration strategy for implementing starred repository organization support while maintaining data integrity and backward compatibility.

## Migration Structure

### 1. Schema Migration (Drizzle)
**File**: `drizzle/0006_starred_strategy.sql`

#### Schema Changes
```sql
-- Starred Repository Organization Strategy Support
-- Migration: 0006_starred_strategy.sql

-- Add new columns to organizations table
ALTER TABLE organizations ADD COLUMN organization_type TEXT DEFAULT 'joined' NOT NULL CHECK (organization_type IN ('joined', 'starred-owner'));
ALTER TABLE organizations ADD COLUMN source_owner TEXT;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_organizations_type_source ON organizations(organization_type, source_owner);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(organization_type);

-- Update existing organizations to have 'joined' type
UPDATE organizations SET organization_type = 'joined' WHERE organization_type IS NULL;
```

#### Drizzle Schema Configuration Update
**File**: `src/lib/db/schema.ts:448-476`

```typescript
// Enhanced organization schema with starred repo support
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  configId: text("config_id")
    .notNull()
    .references(() => configs.id),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url").notNull(),
  membershipRole: text("membership_role").notNull().default("member"),
  isIncluded: integer("is_included", { mode: "boolean" })
    .notNull()
    .default(true),
  destinationOrg: text("destination_org"),
  
  // NEW: Organization type classification
  organizationType: text("organization_type")
    .notNull()
    .default("joined")
    .$defaultFn(() => "joined"),
  
  // NEW: Source owner for starred repo organizations
  sourceOwner: text("source_owner"),
  
  status: text("status").notNull().default("imported"),
  lastMirrored: integer("last_mirrored", { mode: "timestamp" }),
  errorMessage: text("error_message"),
  repositoryCount: integer("repository_count").notNull().default(0),
  publicRepositoryCount: integer("public_repository_count"),
  privateRepositoryCount: integer("private_repository_count"),
  forkRepositoryCount: integer("fork_repository_count"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => [
  index("idx_organizations_user_id").on(table.userId),
  index("idx_organizations_config_id").on(table.configId),
  index("idx_organizations_status").on(table.status),
  index("idx_organizations_is_included").on(table.isIncluded),
  // NEW: Composite index for efficient filtering by type and source owner
  index("idx_organizations_type_source").on(table.organizationType, table.sourceOwner),
]);
```

### 2. Configuration Schema Updates
**File**: `src/lib/db/schema.ts:16-33`

```typescript
export const githubConfigSchema = z.object({
  owner: z.string(),
  type: z.enum(["personal", "organization"]),
  token: z.string(),
  includeStarred: z.boolean().default(false),
  includeForks: z.boolean().default(true),
  skipForks: z.boolean().default(false),
  includeArchived: z.boolean().default(false),
  includePrivate: z.boolean().default(true),
  includePublic: z.boolean().default(true),
  includeOrganizations: z.array(z.string()).default([]),
  starredReposOrg: z.string().optional(),
  // NEW: Starred repository strategy configuration
  starredReposStrategy: z.enum(["single-organization", "preserve-structure"]).default("single-organization"),
  mirrorStrategy: z.enum(["preserve", "single-org", "flat-user", "mixed"]).default("preserve"),
  defaultOrg: z.string().optional(),
  skipStarredIssues: z.boolean().default(false),
  starredDuplicateStrategy: z.enum(["suffix", "prefix", "owner-org"]).default("suffix").optional(),
});
```

### 3. Migration Data Script
**File**: `scripts/migrate-starred-repo-organizations.ts`

#### Comprehensive Migration Logic
```typescript
/**
 * Migration script for starred repository organization support
 * 
 * Usage:
 *   bun run scripts/migrate-starred-repo-organizations.ts --user-id=<userId> --strategy=<strategy>
 *   bun run scripts/migrate-starred-repo-organizations.ts --all-users --dry-run
 */

import { db, organizations, repositories, configs } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

interface MigrationOptions {
  userId?: string;
  allUsers?: boolean;
  dryRun?: boolean;
  strategy?: "preserve-structure" | "single-org";
  verbose?: boolean;
}

interface MigrationResult {
  usersProcessed: number;
  organizationsCreated: number;
  repositoriesUpdated: number;
  errors: Array<{ userId: string; error: string }>;
  skipped: number;
}

/**
 * Main migration function
 */
export async function migrateStarredRepoOrganizations(
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const {
    userId,
    allUsers = false,
    dryRun = false,
    strategy,
    verbose = false
  } = options;

  console.log(`Starting starred repository organizations migration...`);
  console.log(`Options:`, { userId, allUsers, dryRun, strategy, verbose });

  const result: MigrationResult = {
    usersProcessed: 0,
    organizationsCreated: 0,
    repositoriesUpdated: 0,
    errors: [],
    skipped: 0,
  };

  try {
    // Get users to process
    const usersToProcess = await getUsersToProcess({ userId, allUsers });
    console.log(`Found ${usersToProcess.length} users to process`);

    for (const user of usersToProcess) {
      try {
        console.log(`\nProcessing user: ${user.id}`);
        
        const userResult = await migrateUserStarredRepos({
          userId: user.id,
          dryRun,
          strategy,
          verbose,
        });

        result.usersProcessed++;
        result.organizationsCreated += userResult.organizationsCreated;
        result.repositoriesUpdated += userResult.repositoriesUpdated;
        
        if (userResult.skipped) {
          result.skipped++;
        }

        if (verbose) {
          console.log(`User ${user.id} results:`, userResult);
        }

      } catch (userError) {
        const errorMessage = userError instanceof Error ? userError.message : String(userError);
        result.errors.push({ userId: user.id, error: errorMessage });
        console.error(`Failed to migrate user ${user.id}:`, errorMessage);
      }
    }

    console.log(`\nMigration completed. Results:`, result);
    return result;

  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}
```

### 4. Automatic Migration Integration
**File**: `src/lib/starred-repos-migration.ts`

#### Background Migration Service
```typescript
/**
 * Background migration service for starred repository organizations
 */

import { db, organizations, repositories, configs } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

interface AutoMigrationOptions {
  userId: string;
  configId: string;
  triggerReason: "config_change" | "manual" | "sync";
}

/**
 * Automatically migrate starred repos when strategy changes to preserve-structure
 */
export async function autoMigrateStarredRepos({
  userId,
  configId,
  triggerReason,
}: AutoMigrationOptions): Promise<{
  success: boolean;
  organizationsCreated: number;
  repositoriesUpdated: number;
  error?: string;
}> {
  try {
    console.log(`Auto-migrating starred repos for user ${userId} (trigger: ${triggerReason})`);

    // Get user configuration
    const config = await db
      .select()
      .from(configs)
      .where(eq(configs.id, configId))
      .limit(1);

    if (!config[0]) {
      throw new Error("Configuration not found");
    }

    // Check if strategy is set to preserve-structure
    if (config[0].githubConfig?.starredReposStrategy !== "preserve-structure") {
      console.log("Strategy is not preserve-structure, skipping migration");
      return { success: true, organizationsCreated: 0, repositoriesUpdated: 0 };
    }

    // Get starred repositories
    const starredRepos = await db
      .select()
      .from(repositories)
      .where(and(
        eq(repositories.userId, userId),
        eq(repositories.isStarred, true)
      ));

    if (starredRepos.length === 0) {
      console.log("No starred repositories found, skipping migration");
      return { success: true, organizationsCreated: 0, repositoriesUpdated: 0 };
    }

    // Group by GitHub owner
    const ownerGroups = groupRepositoriesByOwner(starredRepos);
    
    let organizationsCreated = 0;
    let repositoriesUpdated = 0;

    // Process each owner group
    for (const [owner, repos] of ownerGroups) {
      const orgResult = await createOrUpdateStarredOrganization({
        userId,
        configId,
        ownerName: owner,
        repositories: repos,
      });
      
      if (orgResult.created) {
        organizationsCreated++;
      }
      
      repositoriesUpdated += orgResult.repositoriesUpdated;
    }

    console.log(`Auto-migration completed: ${organizationsCreated} orgs created, ${repositoriesUpdated} repos updated`);

    return {
      success: true,
      organizationsCreated,
      repositoriesUpdated,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Auto-migration failed for user ${userId}:`, errorMessage);
    
    return {
      success: false,
      organizationsCreated: 0,
      repositoriesUpdated: 0,
      error: errorMessage,
    };
  }
}
```

### 5. Migration Safety and Validation
**File**: `src/lib/migration-validator.ts`

#### Pre-Migration Validation
```typescript
/**
 * Validation service for starred repository migrations
 */

interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  canProceed: boolean;
}

/**
 * Validate system state before running migration
 */
export async function validateMigrationPreconditions(
  userId: string
): Promise<ValidationResult> {
  const result: ValidationResult = {
    isValid: true,
    warnings: [],
    errors: [],
    canProceed: true,
  };

  try {
    // Check if user exists and has valid configuration
    const userConfig = await db
      .select()
      .from(configs)
      .where(eq(configs.userId, userId))
      .limit(1);

    if (!userConfig[0]) {
      result.errors.push("User configuration not found");
      result.isValid = false;
      result.canProceed = false;
      return result;
    }

    // Check for existing starred repos
    const starredRepos = await db
      .select()
      .from(repositories)
      .where(and(
        eq(repositories.userId, userId),
        eq(repositories.isStarred, true)
      ));

    if (starredRepos.length === 0) {
      result.warnings.push("No starred repositories found - migration not needed");
      result.canProceed = false;
      return result;
    }

    // Check for potential naming conflicts
    const ownerNames = new Set(starredRepos.map(repo => repo.fullName.split('/')[0]));
    
    for (const ownerName of ownerNames) {
      const existingOrg = await db
        .select()
        .from(organizations)
        .where(and(
          eq(organizations.userId, userId),
          eq(organizations.name, ownerName),
          eq(organizations.organizationType, "joined")
        ))
        .limit(1);

      if (existingOrg.length > 0) {
        result.warnings.push(
          `Potential naming conflict: joined organization '${ownerName}' already exists. ` +
          `Consider using destination overrides to avoid conflicts.`
        );
      }
    }

    // Check database constraints
    const hasRequiredIndexes = await validateDatabaseIndexes();
    if (!hasRequiredIndexes) {
      result.errors.push("Required database indexes are missing. Run database migration first.");
      result.isValid = false;
      result.canProceed = false;
    }

    // Check for active mirror jobs
    const { mirrorJobs } = await import("@/lib/db");
    const activeMirrorJobs = await db
      .select()
      .from(mirrorJobs)
      .where(and(
        eq(mirrorJobs.userId, userId),
        eq(mirrorJobs.inProgress, true)
      ));

    if (activeMirrorJobs.length > 0) {
      result.warnings.push(
        `${activeMirrorJobs.length} mirror jobs are currently running. ` +
        `Consider waiting for completion before migration.`
      );
    }

    result.canProceed = result.errors.length === 0;
    
  } catch (error) {
    result.errors.push(`Validation failed: ${error instanceof Error ? error.message : String(error)}`);
    result.isValid = false;
    result.canProceed = false;
  }

  return result;
}
```

### 6. Management Database Operations
**File**: `scripts/manage-db.ts`

#### Enhanced Database Management Commands
```typescript
// Add new commands for starred repo organization management

/**
 * Starred repository organization management commands
 */
async function handleStarredOrgCommand(command: string, args: string[]): Promise<void> {
  switch (command) {
    case "migrate":
      await handleStarredOrgMigrate(args);
      break;
    case "validate":
      await handleStarredOrgValidate(args);
      break;
    case "rollback":
      await handleStarredOrgRollback(args);
      break;
    case "status":
      await handleStarredOrgStatus(args);
      break;
    default:
      console.error(`Unknown starred org command: ${command}`);
      process.exit(1);
  }
}

async function handleStarredOrgStatus(args: string[]): Promise<void> {
  const userId = args.find(arg => arg.startsWith('--user-id='))?.split('=')[1];
  
  if (!userId) {
    console.error("Must specify --user-id=<id>");
    process.exit(1);
  }

  try {
    // Get starred repo organizations
    const starredOrgs = await db
      .select()
      .from(organizations)
      .where(and(
        eq(organizations.userId, userId),
        eq(organizations.organizationType, "starred-owner")
      ));

    // Get starred repositories
    const starredRepos = await db
      .select()
      .from(repositories)
      .where(and(
        eq(repositories.userId, userId),
        eq(repositories.isStarred, true)
      ));

    console.log(`\nStarred Repository Organizations Status for user: ${userId}`);
    console.log(`═══════════════════════════════════════════════════════════════`);
    console.log(`Organizations: ${starredOrgs.length}`);
    console.log(`Starred Repositories: ${starredRepos.length}`);
    
    if (starredOrgs.length > 0) {
      console.log(`\nOrganizations:`);
      starredOrgs.forEach(org => {
        console.log(`  • ${org.name} (${org.repositoryCount} repos) - ${org.status}`);
        if (org.destinationOrg) {
          console.log(`    └─ Destination override: ${org.destinationOrg}`);
        }
      });
    }
    
    // Check for unassigned starred repos
    const unassignedRepos = starredRepos.filter(repo => !repo.organization);
    if (unassignedRepos.length > 0) {
      console.log(`\nUnassigned Starred Repositories: ${unassignedRepos.length}`);
      unassignedRepos.forEach(repo => {
        console.log(`  • ${repo.fullName} - ${repo.status}`);
      });
    }

  } catch (error) {
    console.error("Failed to get starred org status:", error);
    process.exit(1);
  }
}
```

### 7. Drizzle Migration Metadata
**File**: `drizzle/meta/0006_snapshot.json`

```json
{
  "version": "5",
  "dialect": "sqlite",
  "id": "0006_starred_strategy",
  "prevId": "0005_polite_preak",
  "tables": {
    "organizations": {
      "name": "organizations",
      "columns": {
        "id": {
          "name": "id",
          "type": "text",
          "primaryKey": true,
          "notNull": true,
          "autoincrement": false
        },
        "organization_type": {
          "name": "organization_type",
          "type": "text",
          "primaryKey": false,
          "notNull": true,
          "autoincrement": false,
          "default": "'joined'"
        },
        "source_owner": {
          "name": "source_owner",
          "type": "text",
          "primaryKey": false,
          "notNull": false,
          "autoincrement": false
        }
      },
      "indexes": {
        "idx_organizations_type_source": {
          "name": "idx_organizations_type_source",
          "columns": ["organization_type", "source_owner"],
          "isUnique": false
        },
        "idx_organizations_type": {
          "name": "idx_organizations_type", 
          "columns": ["organization_type"],
          "isUnique": false
        }
      }
    }
  }
}
```

## Migration Execution Plan

### 1. Safe Migration Steps
1. **Schema Migration**: Run Drizzle migration to add new columns
2. **Data Validation**: Verify existing data integrity
3. **Backup**: Create database backup before major operations
4. **Gradual Rollout**: Start with single user testing
5. **Full Migration**: Migrate all users who opt into preserve-structure

### 2. Rollback Strategy
1. **Immediate Rollback**: Quick rollback for obvious issues
2. **Data Preservation**: Ensure no data loss during rollback
3. **Configuration Reset**: Reset user configurations to single-org
4. **Cleanup**: Remove unused starred repo organizations

### 3. Monitoring and Alerting
1. **Migration Progress**: Real-time progress tracking
2. **Error Tracking**: Comprehensive error logging and alerting
3. **Performance Monitoring**: Database and API performance during migration
4. **Success Metrics**: Track migration success rates and user adoption

### 4. Data Integrity Checks

#### Pre-Migration Validation
```sql
-- Verify no existing conflicts
SELECT COUNT(*) as conflict_count
FROM organizations 
WHERE organization_type = 'joined' 
  AND name IN (
    SELECT DISTINCT SUBSTR(full_name, 1, INSTR(full_name, '/') - 1)
    FROM repositories 
    WHERE is_starred = 1
  );

-- Check for proper index creation
SELECT name FROM sqlite_master 
WHERE type = 'index' 
  AND name IN ('idx_organizations_type_source', 'idx_organizations_type');
```

#### Post-Migration Validation
```sql
-- Verify organization type distribution
SELECT organization_type, COUNT(*) as count
FROM organizations 
GROUP BY organization_type;

-- Verify starred repo organization assignments
SELECT o.name, o.organization_type, COUNT(r.id) as repo_count
FROM organizations o
LEFT JOIN repositories r ON r.organization = o.name AND r.is_starred = 1
WHERE o.organization_type = 'starred-owner'
GROUP BY o.id
ORDER BY repo_count DESC;
```

### 5. Performance Optimization

#### Index Strategy
- **Composite Index**: `idx_organizations_type_source` for efficient filtering by type and source owner
- **Single Column Index**: `idx_organizations_type` for type-only queries
- **Query Optimization**: All organization queries now support type-based filtering

#### Batch Processing
- **Sequential Organization Creation**: Prevent race conditions during bulk operations
- **Repository Assignment Batching**: Efficient updates to repository organization fields
- **Memory Management**: Process large datasets in manageable chunks

This comprehensive migration plan ensures safe, reliable transition to starred repository organization support while maintaining system stability and data integrity.
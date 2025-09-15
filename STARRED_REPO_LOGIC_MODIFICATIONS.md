# Starred Repository Logic Modifications

## Overview
This document details the specific modifications implemented to support starred repository organization management with the preserve-structure strategy.

## Current Processing Flow Analysis

### Existing Flow (src/lib/starred-repos-handler.ts)
```
1. processStarredRepositories()
   ├── preCreateOrganizations() - Creates single "starred" org
   ├── processWithRetry() 
       └── processStarredRepository() - Mirrors to single org
```

### New Flow Design
```
1. processStarredRepositories()
   ├── determineStarredReposStrategy()
   ├── IF preserve-structure:
   │   ├── extractGitHubOwners()
   │   ├── createStarredRepoOrganizations()
   │   └── processWithPreserveStructure()
   └── IF single-organization:
       └── processWithSingleOrg() (existing logic)
```

## Final Implementation Details

### 1. Strategy Detection Function
**Location**: [`src/lib/starred-repos-handler.ts:96`](src/lib/starred-repos-handler.ts:96)

```typescript
const strategy = config.githubConfig?.starredReposStrategy || "single-organization";
```

### 2. GitHub Owner Extraction
**Location**: [`src/lib/starred-repos-handler.ts:99-106`](src/lib/starred-repos-handler.ts:99)

```typescript
if (strategy === "preserve-structure") {
  // For preserve-structure strategy, create organizations for each GitHub owner
  for (const repo of repositories) {
    if (repo.isStarred) {
      const githubOwner = repo.fullName.split("/")[0];
      orgNames.add(githubOwner);
      sourceOwners.set(githubOwner, githubOwner);
    }
  }
}
```

### 3. Enhanced Organization Creation
**Location**: [`src/lib/starred-repos-handler.ts:126-140`](src/lib/starred-repos-handler.ts:126)

```typescript
if (strategy === "preserve-structure") {
  await createOrganizationsSequentially({
    config,
    orgNames: Array.from(orgNames),
    organizationType: "starred-owner",
    sourceOwners,
  });
} else {
  await createOrganizationsSequentially({
    config,
    orgNames: Array.from(orgNames),
    organizationType: "joined",
  });
}
```

### 4. Modified Individual Repository Processing
**Location**: [`src/lib/starred-repos-handler.ts:156-166`](src/lib/starred-repos-handler.ts:156)

```typescript
// Determine the target organization based on strategy
const strategy = config.githubConfig?.starredReposStrategy || "single-organization";
let targetOrg: string;

if (strategy === "preserve-structure") {
  // For preserve-structure strategy, use GitHub owner as organization
  targetOrg = repository.fullName.split("/")[0];
} else {
  // For single-organization strategy, use the configured starred organization
  targetOrg = config.githubConfig?.starredReposOrg || "starred";
}
```

### 5. Enhanced Destination Routing
**Location**: [`src/lib/gitea.ts:75-99`](src/lib/gitea.ts:75)

```typescript
// Check if repository is starred - handle both strategies
if (repository.isStarred) {
  const strategy = config.githubConfig.starredReposStrategy || "single-organization";
  
  if (strategy === "preserve-structure") {
    // For preserve-structure strategy, use GitHub owner as organization name
    const githubOwner = repository.fullName.split("/")[0];
    
    // Check for organization-specific override
    const orgConfig = await getOrganizationConfig({
      orgName: githubOwner,
      userId: config.userId,
    });
    
    if (orgConfig?.destinationOrg) {
      console.log(`Using organization override for starred repo: ${githubOwner} -> ${orgConfig.destinationOrg}`);
      return orgConfig.destinationOrg;
    }
    
    return githubOwner;
  } else {
    // For single-organization strategy, use the configured starred organization
    return config.githubConfig.starredReposOrg || "starred";
  }
}
```

### 6. Organization Configuration Enhancement
**Location**: [`src/lib/gitea.ts:19-51`](src/lib/gitea.ts:19)

```typescript
/**
 * Enhanced helper function to get organization configuration including destination override
 * Now supports both joined and starred organization types
 */
export const getOrganizationConfig = async ({
  orgName,
  userId,
  organizationType = null, // NEW: Optional filter by organization type
}: {
  orgName: string;
  userId: string;
  organizationType?: "joined" | "starred-owner" | null;
}): Promise<Organization | null> => {
  try {
    const { db, organizations } = await import("./db");
    const { eq, and } = await import("drizzle-orm");
    
    // Build query conditions
    const conditions = [
      eq(organizations.name, orgName),
      eq(organizations.userId, userId)
    ];
    
    // Add organization type filter if specified
    if (organizationType) {
      conditions.push(eq(organizations.organizationType, organizationType));
    }

    const result = await db
      .select()
      .from(organizations)
      .where(and(...conditions))
      .limit(1);

    if (!result[0]) {
      return null;
    }

    // Validate and cast the membershipRole to ensure type safety
    const rawOrg = result[0];
    const membershipRole = membershipRoleEnum.parse(rawOrg.membershipRole);
    const status = repoStatusEnum.parse(rawOrg.status);

    return {
      ...rawOrg,
      membershipRole,
      status,
    } as Organization;
  } catch (error) {
    console.error(`Error fetching organization config for ${orgName}:`, error);
    return null;
  }
};
```

### 7. Enhanced Repository Processing with Strategy Support
**Location**: [`src/lib/starred-repos-handler.ts:145-261`](src/lib/starred-repos-handler.ts:145)

```typescript
/**
 * Process a single starred repository with enhanced error handling
 */
async function processStarredRepository({
  config,
  repository,
  octokit,
  strategyConfig,
}: {
  config: Config;
  repository: Repository;
  octokit: Octokit;
  strategyConfig: ReturnType<typeof getMirrorStrategyConfig>;
}): Promise<void> {
  // Determine the target organization based on strategy
  const strategy = config.githubConfig?.starredReposStrategy || "single-organization";
  let targetOrg: string;
  
  if (strategy === "preserve-structure") {
    // For preserve-structure strategy, use GitHub owner as organization
    targetOrg = repository.fullName.split("/")[0];
  } else {
    // For single-organization strategy, use the configured starred organization
    targetOrg = config.githubConfig?.starredReposOrg || "starred";
  }
  
  // Check if repository exists in Gitea
  const existingRepo = await getGiteaRepoInfo({
    config,
    owner: targetOrg,
    repoName: repository.name,
  });

  if (existingRepo) {
    if (existingRepo.mirror) {
      console.log(`Starred repository ${repository.name} already exists as a mirror`);
      
      // Update database status
      const { db, repositories: reposTable } = await import("./db");
      const { eq } = await import("drizzle-orm");
      const { repoStatusEnum } = await import("./db/schema");
      
      await db
        .update(reposTable)
        .set({
          status: repoStatusEnum.parse("mirrored"),
          updatedAt: new Date(),
          lastMirrored: new Date(),
          errorMessage: null,
          mirroredLocation: `${targetOrg}/${repository.name}`,
        })
        .where(eq(reposTable.id, repository.id!));
      
      return;
    } else {
      // Repository exists but is not a mirror
      console.warn(`Starred repository ${repository.name} exists but is not a mirror`);
      
      await handleExistingNonMirrorRepo({
        config,
        repository,
        repoInfo: existingRepo,
        strategy: strategyConfig.nonMirrorStrategy,
      });
      
      // If we deleted it, continue to create the mirror
      if (strategyConfig.nonMirrorStrategy !== "delete") {
        return; // Skip if we're not deleting
      }
    }
  }

  // Create the mirror using existing logic
  try {
    await mirrorGithubRepoToGitea({
      octokit,
      repository,
      config,
    });
  } catch (error) {
    // Enhanced error handling for specific scenarios
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      
      if (errorMessage.includes("already exists")) {
        // Handle race condition where repo was created by another process
        console.log(`Repository ${repository.name} was created by another process`);
        
        // Check if it's a mirror now
        const recheck = await getGiteaRepoInfo({
          config,
          owner: targetOrg,
          repoName: repository.name,
        });
        
        if (recheck && recheck.mirror) {
          // It's now a mirror, update database
          const { db, repositories: reposTable } = await import("./db");
          const { eq } = await import("drizzle-orm");
          const { repoStatusEnum } = await import("./db/schema");
          
          await db
            .update(reposTable)
            .set({
              status: repoStatusEnum.parse("mirrored"),
              updatedAt: new Date(),
              lastMirrored: new Date(),
              errorMessage: null,
              mirroredLocation: `${targetOrg}/${repository.name}`,
            })
            .where(eq(reposTable.id, repository.id!));
          
          return;
        }
      }
    }
    
    throw error;
  }
}
```

### 8. Enhanced Sync Functionality
**Location**: [`src/lib/starred-repos-handler.ts:266-335`](src/lib/starred-repos-handler.ts:266)

```typescript
/**
 * Sync all starred repositories
 */
export async function syncStarredRepositories({
  config,
  repositories,
}: {
  config: Config;
  repositories: Repository[];
}): Promise<void> {
  const strategyConfig = getMirrorStrategyConfig();
  
  console.log(`Syncing ${repositories.length} starred repositories`);

  await processWithRetry(
    repositories,
    async (repository) => {
      try {
        // Import syncGiteaRepo
        const { syncGiteaRepo } = await import("./gitea");
        
        await syncGiteaRepo({
          config,
          repository,
        });
        
        return repository;
      } catch (error) {
        if (error instanceof Error && error.message.includes("not a mirror")) {
          console.warn(`Repository ${repository.name} is not a mirror, handling...`);
          
          // Determine the target organization based on strategy
          const strategy = config.githubConfig?.starredReposStrategy || "single-organization";
          let targetOrg: string;
          
          if (strategy === "preserve-structure") {
            // For preserve-structure strategy, use GitHub owner as organization
            targetOrg = repository.fullName.split("/")[0];
          } else {
            // For single-organization strategy, use the configured starred organization
            targetOrg = config.githubConfig?.starredReposOrg || "starred";
          }
          
          const repoInfo = await getGiteaRepoInfo({
            config,
            owner: targetOrg,
            repoName: repository.name,
          });
          
          if (repoInfo) {
            await handleExistingNonMirrorRepo({
              config,
              repository,
              repoInfo,
              strategy: strategyConfig.nonMirrorStrategy,
            });
          }
        }
        
        throw error;
      }
    },
    {
      concurrencyLimit: strategyConfig.repoBatchSize,
      maxRetries: 1,
      retryDelay: 1000,
      onProgress: (completed, total) => {
        const percentComplete = Math.round((completed / total) * 100);
        console.log(`Sync progress: ${completed}/${total} (${percentComplete}%)`);
      },
    }
  );
}
```

## Integration Points

### 1. Mirror Strategy Detection
The existing [`getGiteaRepoOwnerAsync()`](src/lib/gitea.ts:56) function in [`src/lib/gitea.ts`](src/lib/gitea.ts) has been updated to detect the starred repository strategy and route accordingly.

### 2. Organization Management Integration
The starred repository organizations integrate seamlessly with the existing organization management system in [`src/components/organizations/`](src/components/organizations/).

### 3. Configuration Integration
The configuration system has been updated to support the new [`starredReposStrategy`](src/types/config.ts:41) field and provide appropriate UI controls in [`src/components/config/StarredReposStrategy.tsx`](src/components/config/StarredReposStrategy.tsx).

## Error Handling and Edge Cases

### 1. Migration Scenarios
- Handle users switching from single-org to preserve-structure
- Handle cleanup when switching back to single-org
- Manage conflicts when organization names already exist

### 2. Data Integrity
- Ensure organization records are properly linked to repositories
- Handle cases where GitHub owners change usernames
- Manage deletion of starred repositories

### 3. Performance Considerations
- Batch organization creation to avoid API rate limits
- Use efficient database queries for large numbers of starred repositories
- Implement proper caching for organization lookups

## Testing Requirements

### 1. Unit Tests
- Test strategy detection logic in [`src/lib/starred-repos-handler.test.ts`](src/lib/starred-repos-handler.test.ts)
- Test organization creation/update logic in [`src/lib/gitea-org-creation.test.ts`](src/lib/gitea-org-creation.test.ts)
- Test repository assignment logic in [`src/lib/gitea.test.ts`](src/lib/gitea.test.ts)
- Test error handling scenarios

### 2. Integration Tests
- Test full flow with both strategies in [`src/tests/integration/starred-repos.test.ts`](src/tests/integration/starred-repos.test.ts)
- Test migration between strategies
- Test UI integration with new organization records

### 3. Performance Tests
- Test with large numbers of starred repositories
- Test concurrent processing scenarios
- Test database query performance

## Summary of Logic Modifications

### Core Enhancements
1. **Strategy-Aware Processing**: All processing logic now handles both starred repo strategies
2. **Enhanced Organization Creation**: Automatic creation of starred-owner organizations
3. **Improved Destination Routing**: Smart routing based on strategy and overrides
4. **Seamless Integration**: Works with existing organization management system
5. **Robust Error Handling**: Comprehensive error recovery and retry logic

### Backward Compatibility
- All existing functionality continues to work unchanged
- Default to single-organization strategy for existing configurations
- Graceful handling of configuration migrations
- No breaking changes to existing APIs

### Performance Optimizations
- Efficient organization creation with batch processing
- Optimized database queries with proper indexing
- Minimal overhead for single-organization strategy

This comprehensive modification plan maintains backward compatibility while adding the new preserve-structure functionality as an opt-in feature, with all code references pointing to the actual implemented files and line numbers.
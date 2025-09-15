# Mirror Destination Logic Updates

## Overview
This document outlines the final implemented updates to the mirror destination logic to support starred repository organizations with the preserve-structure strategy.

## Current Mirror Destination Logic Analysis

### Key Functions in src/lib/gitea.ts

#### 1. `getGiteaRepoOwnerAsync()` (Lines 56-124)
- **Current**: Handles organization overrides for joined organizations
- **Updated**: Added support for starred repo organization overrides with strategy detection

#### 2. `getGiteaRepoOwner()` (Lines 126-188)
- **Current**: Handles mirror strategies but hardcoded starred repo logic
- **Updated**: Added preserve-structure strategy for starred repos

#### 3. `mirrorGithubRepoToGitea()` (Lines 274-629)
- **Current**: Uses `getGiteaRepoOwnerAsync()` to determine destination
- **Updated**: Works automatically with updated destination logic

## Final Implementation Details

### 1. Enhanced `getGiteaRepoOwnerAsync()` Function
**File**: [`src/lib/gitea.ts:56-124`](src/lib/gitea.ts:56)

```typescript
/**
 * Enhanced async version of getGiteaRepoOwner that supports organization overrides
 */
export const getGiteaRepoOwnerAsync = async ({
  config,
  repository,
}: {
  config: Partial<Config>;
  repository: Repository;
}): Promise<string> => {
  if (!config.githubConfig || !config.giteaConfig) {
    throw new Error("GitHub or Gitea config is required.");
  }

  if (!config.giteaConfig.defaultOwner) {
    throw new Error("Gitea username is required.");
  }

  if (!config.userId) {
    throw new Error("User ID is required for organization overrides.");
  }

  // IMPLEMENTED: Check if repository is starred with preserve-structure strategy
  if (repository.isStarred) {
    const strategy = config.githubConfig.starredReposStrategy || "single-organization";
    
    if (strategy === "preserve-structure") {
      const githubOwner = repository.fullName.split("/")[0];
      
      // Check for starred organization-specific override
      const starredOrgConfig = await getOrganizationConfig({
        orgName: githubOwner,
        userId: config.userId,
      });

      if (starredOrgConfig?.destinationOrg) {
        console.log(`Using starred org override: ${githubOwner} -> ${starredOrgConfig.destinationOrg}`);
        return starredOrgConfig.destinationOrg;
      }
      
      // No override, use GitHub owner as organization name
      return githubOwner;
    } else {
      // Use traditional single-org approach for starred repos
      return config.githubConfig.starredReposOrg || "starred";
    }
  }

  // Check for repository-specific override (second highest priority)
  if (repository.destinationOrg) {
    console.log(`Using repository override: ${repository.fullName} -> ${repository.destinationOrg}`);
    return repository.destinationOrg;
  }

  // Check for organization-specific override (for joined organizations)
  if (repository.organization) {
    const orgConfig = await getOrganizationConfig({
      orgName: repository.organization,
      userId: config.userId,
    });

    if (orgConfig?.destinationOrg) {
      console.log(`Using organization override: ${repository.organization} -> ${orgConfig.destinationOrg}`);
      return orgConfig.destinationOrg;
    }
  }

  // Fall back to existing strategy logic for non-starred repos
  return getGiteaRepoOwner({ config, repository });
};
```

### 2. Enhanced `getGiteaRepoOwner()` Function  
**File**: [`src/lib/gitea.ts:126-188`](src/lib/gitea.ts:126)

```typescript
export const getGiteaRepoOwner = ({
  config,
  repository,
}: {
  config: Partial<Config>;
  repository: Repository;
}): string => {
  if (!config.githubConfig || !config.giteaConfig) {
    throw new Error("GitHub or Gitea config is required.");
  }

  if (!config.giteaConfig.defaultOwner) {
    throw new Error("Gitea username is required.");
  }

  // IMPLEMENTED: Enhanced starred repository handling with strategy support
  if (repository.isStarred) {
    const strategy = config.githubConfig.starredReposStrategy || "single-organization";
    
    if (strategy === "preserve-structure") {
      // Extract GitHub owner and use as organization name
      const githubOwner = repository.fullName.split('/')[0];
      return githubOwner;
    } else {
      // Traditional single-org approach
      return config.githubConfig.starredReposOrg || "starred";
    }
  }

  // Get the mirror strategy - use preserveOrgStructure for backward compatibility
  const mirrorStrategy = config.githubConfig.mirrorStrategy || 
    (config.giteaConfig.preserveOrgStructure ? "preserve" : "flat-user");

  switch (mirrorStrategy) {
    case "preserve":
      // Keep GitHub structure - org repos go to same org, personal repos to user (or override)
      if (repository.organization) {
        return repository.organization;
      }
      // Use personal repos override if configured, otherwise use username
      return config.giteaConfig.defaultOwner;

    case "single-org":
      // All non-starred repos go to the destination organization
      if (config.giteaConfig.organization) {
        return config.giteaConfig.organization;
      }
      // Fallback to username if no organization specified
      return config.giteaConfig.defaultOwner;

    case "flat-user":
      // All non-starred repos go under the user account
      return config.giteaConfig.defaultOwner;

    case "mixed":
      // Mixed mode: personal repos to single org, organization repos preserve structure
      if (repository.organization) {
        // Organization repos preserve their structure
        return repository.organization;
      }
      // Personal repos go to configured organization (same as single-org)
      if (config.giteaConfig.organization) {
        return config.giteaConfig.organization;
      }
      // Fallback to username if no organization specified
      return config.giteaConfig.defaultOwner;

    default:
      // Default fallback
      return config.giteaConfig.defaultOwner;
  }
};
```

### 3. Organization Configuration Query Enhancement
**File**: [`src/lib/gitea.ts:19-51`](src/lib/gitea.ts:19)

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

### 4. Repository Processing Logic Updates
**File**: [`src/lib/gitea.ts:398-432`](src/lib/gitea.ts:398)

```typescript
// Handle organization creation if needed for single-org, preserve strategies, or starred repos
if (repoOwner !== config.giteaConfig.defaultOwner) {
  // Need to create the organization if it doesn't exist
  try {
    await getOrCreateGiteaOrg({
      orgName: repoOwner,
      config,
    });
  } catch (orgError) {
    console.error(`Failed to create/access organization ${repoOwner}: ${orgError instanceof Error ? orgError.message : String(orgError)}`);
    
    // IMPLEMENTED: Enhanced fallback logic for starred repos
    if (repository.isStarred && config.githubConfig?.starredReposStrategy === "preserve-structure") {
      console.warn(`[Starred Repos Fallback] Organization creation failed for ${repoOwner}. Attempting fallback to single-org mode.`);
      
      // Fallback to traditional starred repos organization
      const fallbackOrg = config.githubConfig?.starredReposOrg || "starred";
      console.log(`[Starred Repos Fallback] Using fallback organization: ${fallbackOrg}`);
      repoOwner = fallbackOrg;
      
      // Try to create/access the fallback organization
      await getOrCreateGiteaOrg({
        orgName: repoOwner,
        config,
      });
    } else {
      // For other repo types, use existing fallback logic
      // Check if we should fallback to user account
      if (orgError instanceof Error && 
          (orgError.message.includes('Permission denied') || 
           orgError.message.includes('Authentication failed') ||
           orgError.message.includes('does not have permission'))) {
        console.warn(`[Fallback] Organization creation/access failed. Attempting to mirror to user account instead.`);
        
        // Update the repository owner to use the user account
        repoOwner = config.giteaConfig.defaultOwner;
        
        // Log this fallback in the database
        await db
          .update(repositories)
          .set({
            errorMessage: `Organization creation failed, using user account. ${orgError.message}`,
            updatedAt: new Date(),
          })
          .where(eq(repositories.id, repository.id!));
      } else {
        // Re-throw if it's not a permission issue
        throw orgError;
      }
    }
  }
}
```

## Integration with Existing Components

### 1. Repository Destination Editor
**File**: [`src/components/repositories/InlineDestinationEditor.tsx:30-50`](src/components/repositories/InlineDestinationEditor.tsx:30)

```typescript
const getDefaultDestination = () => {
  // IMPLEMENTED: Enhanced starred repos handling with strategy support
  if (repository.isStarred && giteaConfig) {
    const starredStrategy = giteaConfig.starredReposStrategy || "single-organization";
    
    if (starredStrategy === "preserve-structure") {
      const githubOwner = repository.fullName.split('/')[0];
      
      // Check for starred organization override
      const starredOrg = organizations?.find(org => 
        org.organizationType === "starred-owner" && 
        org.sourceOwner === githubOwner
      );
      
      return starredOrg?.destinationOrg || githubOwner;
    } else {
      // Traditional single-org approach
      return giteaConfig.starredReposOrg || "starred";
    }
  }
  
  // ... existing logic for non-starred repos ...
};
```

### 2. Organization Strategy Visualization
**File**: [`src/components/config/OrganizationStrategy.tsx:341-343`](src/components/config/OrganizationStrategy.tsx:341)

```typescript
<p className="text-xs text-muted-foreground pl-5">
  Always go to the configured starred repos organization and cannot be overridden.
</p>
```

## Error Handling and Edge Cases

### 1. Organization Creation Failures
- **Fallback Strategy**: If organization creation fails for starred repos, fallback to single-org mode
- **Permission Issues**: Handle cases where user doesn't have permission to create organizations
- **Rate Limiting**: Handle Gitea API rate limits during bulk organization creation

### 2. Configuration Changes
- **Strategy Switching**: Handle users changing from preserve-structure to single-org and vice versa
- **Migration**: Ensure existing repositories are properly reassigned when strategy changes
- **Cleanup**: Clean up unused organization records when switching strategies

### 3. Data Consistency
- **Repository Assignment**: Ensure repositories are properly assigned to the correct organizations
- **Organization Metadata**: Keep organization repository counts accurate
- **Status Tracking**: Maintain proper status tracking during migrations

## Performance Considerations

### 1. Database Queries
- **Efficient Lookups**: Use indexed queries for organization lookups via [`idx_organizations_type_source`](src/lib/db/schema.ts:475)
- **Batch Operations**: Process organization creation and updates in batches
- **Caching**: Cache frequently accessed organization configurations

### 2. API Efficiency
- **Reduced Calls**: Minimize redundant organization creation attempts
- **Parallel Processing**: Process repositories in parallel while respecting rate limits
- **Error Recovery**: Implement robust error recovery without losing progress

## Testing Requirements

### 1. Unit Tests
- Test destination logic with both strategies in [`src/lib/gitea.test.ts`](src/lib/gitea.test.ts)
- Test organization override resolution in [`src/lib/gitea.test.ts`](src/lib/gitea.test.ts)
- Test error handling and fallback scenarios in [`src/lib/gitea.test.ts`](src/lib/gitea.test.ts)

### 2. Integration Tests
- Test end-to-end repository mirroring with preserve-structure in [`src/tests/integration/starred-repos.test.ts`](src/tests/integration/starred-repos.test.ts)
- Test strategy switching scenarios in [`src/tests/integration/config-migration.test.ts`](src/tests/integration/config-migration.test.ts)
- Test organization management integration in [`src/tests/integration/organizations.test.ts`](src/tests/integration/organizations.test.ts)

### 3. Performance Tests
- Test with large numbers of starred repositories in [`src/tests/performance/large-dataset.test.ts`](src/tests/performance/large-dataset.test.ts)
- Test organization creation performance in [`src/tests/performance/org-creation.test.ts`](src/tests/performance/org-creation.test.ts)
- Test database query performance with many organizations in [`src/tests/performance/db-queries.test.ts`](src/tests/performance/db-queries.test.ts)

## Summary of Backend Processing Updates

### Core Enhancements
1. **Strategy-Aware Routing**: All destination logic now handles both starred repo strategies
2. **Enhanced Organization Overrides**: Support for starred organization-specific destination overrides
3. **Improved Error Handling**: Comprehensive fallback strategies for organization creation failures
4. **Seamless Integration**: Works with existing organization management system
5. **Resilience**: Graceful degradation and fallback strategies

### Backward Compatibility
- All existing functionality continues to work unchanged
- Default to single-organization strategy for existing configurations
- Graceful handling of configuration migrations
- No breaking changes to existing APIs

### Performance Optimizations
- Efficient organization lookups with proper indexing
- Minimal overhead for single-organization strategy
- Optimized database queries for organization resolution

### Key Implementation Files
- **Primary Logic**: [`src/lib/gitea.ts:56-124`](src/lib/gitea.ts:56) - Enhanced destination routing
- **Organization Queries**: [`src/lib/gitea.ts:19-51`](src/lib/gitea.ts:19) - Enhanced config retrieval
- **Repository Processing**: [`src/lib/starred-repos-handler.ts:145-261`](src/lib/starred-repos-handler.ts:145) - Strategy-aware processing
- **UI Integration**: [`src/components/repositories/InlineDestinationEditor.tsx:30-50`](src/components/repositories/InlineDestinationEditor.tsx:30) - Enhanced destination display

These comprehensive updates to the mirror destination logic ensure that starred repositories can be properly managed with individual organization support while maintaining backward compatibility with the existing single-org approach.
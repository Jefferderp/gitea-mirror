# API Endpoint Extensions for Starred Repository Organizations

## Overview
This document outlines the final implemented extensions to API endpoints to support starred repository organizations while maintaining backward compatibility with existing organization management functionality.

## Current API Endpoints Analysis

### Existing Organization APIs
- **GET** `/api/github/organizations` - Fetch GitHub organizations and create/update records
- **PATCH** `/api/organizations/[id]` - Update organization destination overrides
- **PATCH** `/api/organizations/[id]/status` - Update organization status

### Required Extensions
The existing endpoints have been enhanced to work with starred repo organizations since they share the same database schema, with specific enhancements for:
1. **Filtering by organization type**
2. **Handling starred repo specific fields**
3. **Bulk operations for migration**
4. **Query optimization for mixed organization types**

## Final API Endpoint Implementations

### 1. Enhanced GitHub Organizations Endpoint
**File**: [`src/pages/api/github/organizations.ts`](src/pages/api/github/organizations.ts)

#### Current Functionality
- Fetches joined GitHub organizations
- Creates/updates organization records in database
- Returns organization list with repository counts

#### Final Implementation
```typescript
// Add query parameters for organization type filtering
interface OrganizationsApiRequest {
  userId: string;
  type?: "all" | "joined" | "starred-owner"; // NEW: Filter by organization type
  includeStarred?: boolean; // NEW: Whether to include starred repo organizations
}

interface OrganizationsApiResponse {
  success: boolean;
  organizations: Organization[];
  joinedCount: number; // NEW: Count of joined organizations
  starredCount: number; // NEW: Count of starred repo organizations
  error?: string;
}

// Enhanced endpoint handler
export const GET: APIRoute = async (context) => {
  try {
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const userId = user!.id;
    const url = new URL(context.request.url);
    
    // NEW: Parse query parameters
    const organizationType = url.searchParams.get('type') as 'all' | 'joined' | 'starred-owner' | null;
    const includeStarred = url.searchParams.get('includeStarred') === 'true';

    // Fetch joined organizations from GitHub (existing logic)
    const joinedOrganizations = await fetchAndProcessJoinedOrganizations(userId, config);

    // NEW: Fetch starred repo organizations from database
    let starredOrganizations: Organization[] = [];
    if (includeStarred || organizationType === 'all' || organizationType === 'starred-owner') {
      starredOrganizations = await fetchStarredRepoOrganizations(userId);
    }

    // Combine and filter organizations based on type
    let allOrganizations = [...joinedOrganizations];
    
    if (includeStarred || organizationType !== 'joined') {
      allOrganizations = [...allOrganizations, ...starredOrganizations];
    }

    // Filter by organization type if specified
    if (organizationType && organizationType !== 'all') {
      allOrganizations = allOrganizations.filter(org => 
        org.organizationType === organizationType
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        organizations: allOrganizations,
        joinedCount: joinedOrganizations.length,
        starredCount: starredOrganizations.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return createSecureErrorResponse(error, "Fetch organizations", 500);
  }
};

/**
 * NEW: Fetch starred repository organizations from database
 */
async function fetchStarredRepoOrganizations(userId: string): Promise<Organization[]> {
  const { db, organizations } = await import("@/lib/db");
  const { eq, and } = await import("drizzle-orm");
  
  const starredOrgs = await db
    .select()
    .from(organizations)
    .where(and(
      eq(organizations.userId, userId),
      eq(organizations.organizationType, "starred-owner")
    ));

  return starredOrgs.map(org => ({
    ...org,
    organizationType: "starred-owner" as const,
  }));
}
```

### 2. Organization Management Endpoint Extensions
**File**: [`src/pages/api/organizations/[id].ts`](src/pages/api/organizations/[id].ts)

#### Current Functionality
- Updates organization destination overrides
- Validates organization ownership

#### Final Implementation
```typescript
export const PATCH: APIRoute = async (context) => {
  try {
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const userId = user!.id;
    const orgId = context.params.id;
    
    if (!orgId) {
      return new Response(JSON.stringify({ error: "Organization ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await context.request.json();
    const { destinationOrg } = body;

    // Validate that the organization belongs to the user (works for both types)
    const [existingOrg] = await db
      .select()
      .from(organizations)
      .where(and(eq(organizations.id, orgId), eq(organizations.userId, userId)))
      .limit(1);

    if (!existingOrg) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // NEW: Additional validation for starred repo organizations
    if (existingOrg.organizationType === "starred-owner") {
      console.log(`Updating destination for starred repo organization: ${existingOrg.sourceOwner}`);
      
      // Update any repositories that belong to this starred organization
      await updateStarredRepoDestinations({
        userId,
        sourceOwner: existingOrg.sourceOwner!,
        newDestination: destinationOrg,
      });
    }

    // Update the organization's destination override
    await db
      .update(organizations)
      .set({
        destinationOrg: destinationOrg || null,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId));

    return new Response(
      JSON.stringify({
        success: true,
        message: `${existingOrg.organizationType === "starred-owner" ? "Starred repo " : ""}Organization destination updated successfully`,
        destinationOrg: destinationOrg || null,
        organizationType: existingOrg.organizationType, // NEW: Include org type in response
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return createSecureErrorResponse(error, "Update organization destination", 500);
  }
};

/**
 * NEW: Update repository destinations when starred org destination changes
 */
async function updateStarredRepoDestinations({
  userId,
  sourceOwner,
  newDestination,
}: {
  userId: string;
  sourceOwner: string;
  newDestination: string | null;
}): Promise<void> {
  const { db, repositories } = await import("@/lib/db");
  const { eq, and } = await import("drizzle-orm");

  // Update all starred repositories from this source owner
  await db
    .update(repositories)
    .set({
      destinationOrg: newDestination,
      updatedAt: new Date(),
    })
    .where(and(
      eq(repositories.userId, userId),
      eq(repositories.isStarred, true),
      eq(repositories.organization, sourceOwner)
    ));
}
```

### 3. Organization Status Endpoint Extensions
**File**: [`src/pages/api/organizations/[id]/status.ts`](src/pages/api/organizations/[id]/status.ts)

#### Current Functionality
- Updates organization status (imported, mirroring, mirrored, failed, ignored)
- Validates organization ownership

#### Final Implementation
```typescript
export async function PATCH({ params, request }: APIContext) {
  try {
    const { id } = params;
    const body = await request.json();
    const { status, userId } = body;

    if (!id || !userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Organization ID and User ID are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate the status
    const validStatuses = ["imported", "mirroring", "mirrored", "failed", "ignored"];
    if (!validStatuses.includes(status)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Update the organization status
    const [updatedOrg] = await db
      .update(organizations)
      .set({ 
        status,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(organizations.id, id),
          eq(organizations.userId, userId)
        )
      )
      .returning();

    if (!updatedOrg) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Organization not found or you don't have permission to update it",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // NEW: Handle starred repo organization status changes
    if (updatedOrg.organizationType === "starred-owner") {
      await handleStarredOrgStatusChange({
        organization: updatedOrg,
        newStatus: status,
        userId,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        organization: updatedOrg,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return createSecureErrorResponse(error);
  }
}

/**
 * NEW: Handle status changes for starred repo organizations
 */
async function handleStarredOrgStatusChange({
  organization,
  newStatus,
  userId,
}: {
  organization: any;
  newStatus: string;
  userId: string;
}): Promise<void> {
  const { db, repositories } = await import("@/lib/db");
  const { eq, and } = await import("drizzle-orm");

  if (newStatus === "ignored") {
    // Mark all starred repositories from this owner as ignored
    await db
      .update(repositories)
      .set({
        status: "ignored",
        updatedAt: new Date(),
      })
      .where(and(
        eq(repositories.userId, userId),
        eq(repositories.isStarred, true),
        eq(repositories.organization, organization.sourceOwner)
      ));
    
    console.log(`Marked all starred repos from ${organization.sourceOwner} as ignored`);
  } else if (newStatus === "imported") {
    // Re-enable starred repositories from this owner
    await db
      .update(repositories)
      .set({
        status: "imported",
        updatedAt: new Date(),
      })
      .where(and(
        eq(repositories.userId, userId),
        eq(repositories.isStarred, true),
        eq(repositories.organization, organization.sourceOwner),
        eq(repositories.status, "ignored")
      ));
    
    console.log(`Re-enabled starred repos from ${organization.sourceOwner}`);
  }
}
```

### 4. New Starred Repository Organizations API
**File**: [`src/pages/api/starred-repos/organizations.ts`](src/pages/api/starred-repos/organizations.ts)

#### Purpose
- Manage starred repository organizations specifically
- Provide bulk operations for starred repo organization management
- Support migration between strategies

#### Final Implementation
```typescript
import type { APIRoute } from "astro";
import { db, organizations, repositories, configs } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "@/lib/utils/auth-helpers";
import { createSecureErrorResponse } from "@/lib/utils";

/**
 * GET: Fetch all starred repository organizations
 */
export const GET: APIRoute = async (context) => {
  try {
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const userId = user!.id;

    const starredOrgs = await db
      .select()
      .from(organizations)
      .where(and(
        eq(organizations.userId, userId),
        eq(organizations.organizationType, "starred-owner")
      ));

    return new Response(
      JSON.stringify({
        success: true,
        organizations: starredOrgs,
        count: starredOrgs.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return createSecureErrorResponse(error, "Fetch starred repo organizations", 500);
  }
};

/**
 * POST: Create starred repository organizations from existing starred repos
 */
export const POST: APIRoute = async (context) => {
  try {
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const userId = user!.id;
    const body = await context.request.json();
    const { strategy } = body; // "migrate" or "create"

    if (strategy === "migrate") {
      // Migrate existing starred repos to organization-based approach
      const migratedCount = await migrateStarredReposToOrganizations(userId);
      
      return new Response(
        JSON.stringify({
          success: true,
          message: `Successfully migrated ${migratedCount} starred repository organizations`,
          migratedCount,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid strategy. Supported: 'migrate'",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  } catch (error) {
    return createSecureErrorResponse(error, "Manage starred repo organizations", 500);
  }
};

/**
 * DELETE: Clean up starred repository organizations (when switching back to single-org)
 */
export const DELETE: APIRoute = async (context) => {
  try {
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const userId = user!.id;

    // Remove all starred repo organizations
    const deletedOrgs = await db
      .delete(organizations)
      .where(and(
        eq(organizations.userId, userId),
        eq(organizations.organizationType, "starred-owner")
      ))
      .returning();

    // Reset repository organization assignments for starred repos
    await db
      .update(repositories)
      .set({
        organization: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(repositories.userId, userId),
        eq(repositories.isStarred, true)
      ));

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleaned up ${deletedOrgs.length} starred repository organizations`,
        deletedCount: deletedOrgs.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return createSecureErrorResponse(error, "Clean up starred repo organizations", 500);
  }
};

/**
 * Migrate existing starred repositories to organization-based approach
 */
async function migrateStarredReposToOrganizations(userId: string): Promise<number> {
  // Get user's configuration
  const userConfig = await db
    .select()
    .from(configs)
    .where(eq(configs.userId, userId))
    .limit(1);

  if (!userConfig[0]) {
    throw new Error("User configuration not found");
  }

  // Find all starred repositories
  const starredRepos = await db
    .select()
    .from(repositories)
    .where(and(
      eq(repositories.userId, userId),
      eq(repositories.isStarred, true)
    ));

  if (starredRepos.length === 0) {
    return 0;
  }

  // Group by GitHub owner
  const ownerGroups = new Map<string, typeof starredRepos>();
  starredRepos.forEach(repo => {
    const owner = repo.fullName.split('/')[0];
    if (!ownerGroups.has(owner)) {
      ownerGroups.set(owner, []);
    }
    ownerGroups.get(owner)!.push(repo);
  });

  let createdCount = 0;

  // Create organization records for each owner
  for (const [owner, repos] of ownerGroups) {
    try {
      const { randomUUID } = await import("crypto");
      
      await db.insert(organizations).values({
        id: randomUUID(),
        userId: userId,
        configId: userConfig[0].id,
        name: owner,
        organizationType: "starred-owner",
        sourceOwner: owner,
        avatarUrl: `https://github.com/${owner}.png`,
        membershipRole: "external",
        isIncluded: true,
        status: "imported",
        repositoryCount: repos.length,
        publicRepositoryCount: repos.filter(r => !r.isPrivate).length,
        privateRepositoryCount: repos.filter(r => r.isPrivate).length,
        forkRepositoryCount: repos.filter(r => r.isForked).length,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update repository organization field
      for (const repo of repos) {
        await db
          .update(repositories)
          .set({
            organization: owner,
            updatedAt: new Date(),
          })
          .where(eq(repositories.id, repo.id));
      }

      createdCount++;
    } catch (error) {
      console.error(`Failed to migrate starred organization ${owner}:`, error);
    }
  }

  return createdCount;
}
```

### 5. Bulk Operations API
**File**: [`src/pages/api/organizations/bulk.ts`](src/pages/api/organizations/bulk.ts) (NEW)

#### Purpose
- Bulk operations for organization management
- Support for mixed organization types
- Efficient batch processing

#### Implementation Structure
```typescript
import type { APIRoute } from "astro";
import { db, organizations } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "@/lib/utils/auth-helpers";

/**
 * POST: Bulk operations on organizations
 */
export const POST: APIRoute = async (context) => {
  try {
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const userId = user!.id;
    const body = await context.request.json();
    const { operation, organizationIds, organizationType } = body;

    if (!operation || !organizationIds || !Array.isArray(organizationIds)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Operation and organizationIds are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let result;
    switch (operation) {
      case "ignore":
        result = await bulkIgnoreOrganizations(userId, organizationIds, organizationType);
        break;
      case "include":
        result = await bulkIncludeOrganizations(userId, organizationIds, organizationType);
        break;
      case "mirror":
        result = await bulkMirrorOrganizations(userId, organizationIds, organizationType);
        break;
      default:
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid operation. Supported: 'ignore', 'include', 'mirror'",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
    }

    return new Response(
      JSON.stringify({
        success: true,
        result,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return createSecureErrorResponse(error, "Bulk organization operations", 500);
  }
};
```

## Enhanced Error Handling and Resilience
**File**: [`src/lib/api-error-handling.ts`](src/lib/api-error-handling.ts) (NEW)

### Comprehensive Error Handling
```typescript
/**
 * Enhanced error handling for API operations
 */
export class StarredRepoApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'StarredRepoApiError';
  }
}

export const ERROR_CODES = {
  INVALID_STRATEGY: 'INVALID_STRATEGY',
  ORGANIZATION_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
  MIGRATION_FAILED: 'MIGRATION_FAILED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
} as const;

/**
 * Create standardized error response for starred repo operations
 */
export function createStarredRepoErrorResponse(
  error: Error | StarredRepoApiError,
  operation: string,
  statusCode?: number
): Response {
  const isKnownError = error instanceof StarredRepoApiError;
  const code = isKnownError ? error.code : 'UNKNOWN_ERROR';
  const message = isKnownError ? error.message : `Failed to ${operation}`;
  const details = isKnownError ? error.details : undefined;

  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      code,
      details,
      timestamp: new Date().toISOString(),
    }),
    {
      status: statusCode || (isKnownError ? error.statusCode : 500),
      headers: { "Content-Type": "application/json" },
    }
  );
}
```

## Performance Optimization
**File**: [`src/lib/api-performance.ts`](src/lib/api-performance.ts) (NEW)

### Optimized Batch Processing
```typescript
/**
 * Performance-optimized batch processing for API operations
 */
export async function processBatchOrganizations({
  userId,
  organizationIds,
  operation,
  batchSize = 50,
}: {
  userId: string;
  organizationIds: string[];
  operation: string;
  batchSize?: number;
}): Promise<{
  processed: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}> {
  const results = {
    processed: 0,
    failed: 0,
    errors: [] as Array<{ id: string; error: string }>,
  };

  // Process in batches to avoid overwhelming the database
  for (let i = 0; i < organizationIds.length; i += batchSize) {
    const batch = organizationIds.slice(i, i + batchSize);
    
    const batchResults = await Promise.allSettled(
      batch.map(async (orgId) => {
        try {
          await processOrganizationOperation(userId, orgId, operation);
          return { success: true, id: orgId };
        } catch (error) {
          return { 
            success: false, 
            id: orgId, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      })
    );

    // Process batch results
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.success) {
        results.processed++;
      } else {
        results.failed++;
        const error = result.status === 'rejected' 
          ? result.reason 
          : result.value.error;
        results.errors.push({ 
          id: result.status === 'fulfilled' ? result.value.id : 'unknown', 
          error 
        });
      }
    });

    // Small delay between batches to prevent database overload
    if (i + batchSize < organizationIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}
```

## Integration Testing Points

### 1. Strategy Switching Tests
- Test switching from single-org to preserve-structure via [`POST /api/starred-repos/organizations`](src/pages/api/starred-repos/organizations.ts:44)
- Test switching from preserve-structure to single-org via [`DELETE /api/starred-repos/organizations`](src/pages/api/starred-repos/organizations.ts:88)
- Verify data integrity during transitions via [`PATCH /api/organizations/[id]`](src/pages/api/organizations/[id].ts:1)
- Test error recovery during strategy switches via error handling middleware

### 2. Performance Tests
- Test with large numbers of starred repositories (1000+) via [`src/tests/performance/large-dataset.test.ts`](src/tests/performance/large-dataset.test.ts)
- Test concurrent organization creation via [`src/tests/performance/org-creation.test.ts`](src/tests/performance/org-creation.test.ts)
- Test database query performance under load via [`src/tests/performance/db-queries.test.ts`](src/tests/performance/db-queries.test.ts)

### 3. Error Handling Tests
- Test Gitea organization creation failures via [`src/lib/gitea.ts:406-431`](src/lib/gitea.ts:406)
- Test GitHub API rate limit handling via [`src/lib/rate-limit-manager.ts`](src/lib/rate-limit-manager.ts)
- Test database connection failures via [`src/lib/db/index.ts`](src/lib/db/index.ts)
- Test partial failure recovery via [`src/lib/api-error-handling.ts`](src/lib/api-error-handling.ts)

### 4. Integration Tests
- Test full sync workflow with both strategies via [`src/tests/integration/starred-repos.test.ts`](src/tests/integration/starred-repos.test.ts)
- Test scheduled sync with starred repo organizations via [`src/tests/integration/scheduled-sync.test.ts`](src/tests/integration/scheduled-sync.test.ts)
- Test cleanup service with starred repo organizations via [`src/tests/integration/cleanup-service.test.ts`](src/tests/integration/cleanup-service.test.ts)
- Test manual mirror operations via [`src/tests/integration/manual-mirror.test.ts`](src/tests/integration/manual-mirror.test.ts)

## Summary of API Extensions

### Core Enhancements
1. **Strategy-Aware Endpoints**: All organization endpoints now handle both starred repo strategies
2. **Enhanced Filtering**: Support for filtering organizations by type (`joined`, `starred-owner`, `all`)
3. **Bulk Operations**: Efficient batch processing for organization management
4. **Migration Support**: Dedicated endpoints for strategy switching and data migration
5. **Error Recovery**: Comprehensive error handling with detailed error codes and messages

### Backward Compatibility
- All existing API endpoints continue to work unchanged
- Default behavior remains the same for existing clients
- New fields are optional in responses to maintain compatibility
- Graceful handling of missing or invalid parameters

### Performance Optimizations
- Efficient database queries with proper indexing via [`idx_organizations_type_source`](src/lib/db/schema.ts:475)
- Batch processing for bulk operations to minimize database load
- Optimized response serialization to reduce payload size
- Connection pooling and query optimization

### Key Implementation Files
- **Primary Endpoints**: [`src/pages/api/starred-repos/organizations.ts`](src/pages/api/starred-repos/organizations.ts) - New starred repo organization endpoints
- **Enhanced Organizations**: [`src/pages/api/github/organizations.ts`](src/pages/api/github/organizations.ts) - Enhanced filtering and counting
- **Organization Management**: [`src/pages/api/organizations/[id].ts`](src/pages/api/organizations/[id].ts) - Enhanced destination override handling
- **Status Management**: [`src/pages/api/organizations/[id]/status.ts`](src/pages/api/organizations/[id]/status.ts) - Enhanced status change handling
- **Error Handling**: [`src/lib/api-error-handling.ts`](src/lib/api-error-handling.ts) - Comprehensive error management
- **Performance**: [`src/lib/api-performance.ts`](src/lib/api-performance.ts) - Optimized batch processing

These comprehensive API extensions ensure that starred repository organization management integrates seamlessly with the existing API system while maintaining performance, reliability, and backward compatibility.
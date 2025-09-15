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
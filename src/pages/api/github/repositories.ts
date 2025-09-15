import type { APIRoute } from "astro";
import { db, repositories, configs } from "@/lib/db";
import { and, eq, sql } from "drizzle-orm";
import {
  repositoryVisibilityEnum,
  repoStatusEnum,
  type RepositoryApiResponse,
} from "@/types/Repository";
import { jsonResponse, createSecureErrorResponse } from "@/lib/utils";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const sourceOwner = url.searchParams.get("sourceOwner");
  const organizationType = url.searchParams.get("organizationType") as "joined" | "starred-owner" | null;

  if (!userId) {
    return jsonResponse({
      data: { success: false, error: "Missing userId" },
      status: 400,
    });
  }

  try {
    // Fetch the user's active configuration
    const [config] = await db
      .select()
      .from(configs)
      .where(and(eq(configs.userId, userId), eq(configs.isActive, true)));

    if (!config) {
      return jsonResponse({
        data: {
          success: false,
          error: "No active configuration found for this user",
        },
        status: 404,
      });
    }

    const githubConfig = config.githubConfig as {
      mirrorStarred: boolean;
      skipForks: boolean;
      privateRepositories: boolean;
    };

    // Build query conditions based on config
    const conditions = [eq(repositories.userId, userId)];

    // Filter by source owner (GitHub owner for starred repos)
    if (sourceOwner) {
      conditions.push(eq(repositories.organization, sourceOwner));
    }

    // Filter by organization type (requires joining with organizations table)
    if (organizationType) {
      const orgs = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(and(
          eq(organizations.userId, userId),
          eq(organizations.organizationType, organizationType)
        ));
      
      const orgNames = orgs.map(org => org.name);
      if (orgNames.length > 0) {
        conditions.push(sql`${repositories.organization} IN (${orgNames.join(',')})`);
      } else {
        // If no organizations of the specified type exist, return empty results
        conditions.push(sql`1=0`);
      }
    }

    // Note: We show ALL repositories in the list
    // The mirrorStarred and privateRepositories flags only control what gets mirrored,
    // not what's displayed in the repository list
    // Only skipForks is used for filtering the display since forked repos are often noise

    const rawRepositories = await db
      .select()
      .from(repositories)
      .where(and(...conditions))
      .orderBy(sql`name COLLATE NOCASE`);

    const response: RepositoryApiResponse = {
      success: true,
      message: "Repositories fetched successfully",
      repositories: rawRepositories.map((repo) => ({
        ...repo,
        organization: repo.organization ?? undefined,
        lastMirrored: repo.lastMirrored ?? undefined,
        errorMessage: repo.errorMessage ?? undefined,
        forkedFrom: repo.forkedFrom ?? undefined,
        status: repoStatusEnum.parse(repo.status),
        visibility: repositoryVisibilityEnum.parse(repo.visibility),
      })),
    };

    return jsonResponse({
      data: response,
      status: 200,
    });
  } catch (error) {
    return createSecureErrorResponse(error, "repositories fetch", 500);
  }
};

import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { organizations, repositories, configs } from "@/lib/db";
import { eq, sql, and, count } from "drizzle-orm";
import {
  membershipRoleEnum,
  type OrganizationsApiResponse,
} from "@/types/organizations";
import type { Organization } from "@/lib/db/schema";
import { repoStatusEnum } from "@/types/Repository";
import { jsonResponse, createSecureErrorResponse } from "@/lib/utils";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const organizationType = url.searchParams.get("organizationType") as "all" | "joined" | "starred-owner" | null;
  const sourceOwner = url.searchParams.get("sourceOwner");

  if (!userId) {
    return jsonResponse({
      data: {
        success: false,
        error: "Missing userId",
      },
      status: 400,
    });
  }

  try {
    // Fetch the user's active configuration to respect filtering settings
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

    // Build query conditions based on filters
    const conditions = [eq(organizations.userId, userId)];

    // Filter by organization type
    if (organizationType && organizationType !== "all") {
      conditions.push(eq(organizations.organizationType, organizationType));
    }

    // Filter by source owner (for starred-owner organizations)
    if (sourceOwner) {
      conditions.push(eq(organizations.sourceOwner, sourceOwner));
    }

    const rawOrgs = await db
      .select()
      .from(organizations)
      .where(and(...conditions))
      .orderBy(sql`name COLLATE NOCASE`);

    // Calculate repository breakdowns for each organization
    const orgsWithBreakdown = await Promise.all(
      rawOrgs.map(async (org) => {
        // Build base conditions for this organization (without private/fork filters)
        const baseConditions = [
          eq(repositories.userId, userId),
          eq(repositories.organization, org.name)
        ];

        if (!githubConfig.mirrorStarred) {
          baseConditions.push(eq(repositories.isStarred, false));
        }

        // Get actual total count (without user config filters)
        const [totalCount] = await db
          .select({ count: count() })
          .from(repositories)
          .where(and(...baseConditions));

        // Get public count (actual count, not filtered)
        const [publicCount] = await db
          .select({ count: count() })
          .from(repositories)
          .where(and(...baseConditions, eq(repositories.isPrivate, false)));

        // Get private count (always show actual count regardless of config)
        const [privateCount] = await db
          .select({ count: count() })
          .from(repositories)
          .where(
            and(
              ...baseConditions,
              eq(repositories.isPrivate, true)
            )
          );

        // Get fork count (always show actual count regardless of config)
        const [forkCount] = await db
          .select({ count: count() })
          .from(repositories)
          .where(
            and(
              ...baseConditions,
              eq(repositories.isForked, true)
            )
          );

        return {
          ...org,
          status: repoStatusEnum.parse(org.status),
          membershipRole: membershipRoleEnum.parse(org.membershipRole),
          lastMirrored: org.lastMirrored ?? undefined,
          errorMessage: org.errorMessage ?? undefined,
          repositoryCount: totalCount.count,
          publicRepositoryCount: publicCount.count,
          privateRepositoryCount: privateCount.count,
          forkRepositoryCount: forkCount.count,
        };
      })
    );

    // Calculate organization type counts
    const joinedCount = orgsWithBreakdown.filter(org => org.organizationType === 'joined').length;
    const starredOwnerCount = orgsWithBreakdown.filter(org => org.organizationType === 'starred-owner').length;

    const resPayload: OrganizationsApiResponse = {
      success: true,
      message: "Organizations fetched successfully",
      organizations: orgsWithBreakdown,
      joinedCount,
      starredOwnerCount,
    };

    return jsonResponse({ data: resPayload, status: 200 });
  } catch (error) {
    return createSecureErrorResponse(error, "organizations fetch", 500);
  }
};

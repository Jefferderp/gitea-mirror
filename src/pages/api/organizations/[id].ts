import type { APIRoute } from "astro";
import { db, organizations, repositories } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { createSecureErrorResponse } from "@/lib/utils";
import { requireAuth } from "@/lib/utils/auth-helpers";

export const PATCH: APIRoute = async (context) => {
  try {
    // Check authentication
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

    // Validate that the organization belongs to the user
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

    // Handle starred-owner organization destination updates
    if (existingOrg.organizationType === "starred-owner") {
      console.log(`Updating destination for starred-owner organization: ${existingOrg.sourceOwner}`);
      
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
        message: `${existingOrg.organizationType === "starred-owner" ? "Starred-owner " : ""}Organization destination updated successfully`,
        destinationOrg: destinationOrg || null,
        organizationType: existingOrg.organizationType, // Include org type in response
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
 * Update repository destinations when starred organization destination changes
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

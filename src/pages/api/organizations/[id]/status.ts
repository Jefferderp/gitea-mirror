import type { APIContext } from "astro";
import { db, organizations, repositories } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { createSecureErrorResponse } from "@/lib/utils";

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

    // Handle starred-owner organization status changes
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
 * Handle status changes for starred-owner organizations
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
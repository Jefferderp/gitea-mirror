import type { APIRoute } from "astro";
import { db, organizations } from "@/lib/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "@/lib/utils/auth-helpers";
import { createSecureErrorResponse } from "@/lib/utils";

interface BulkUpdateRequest {
  organizationIds: string[];
  operation: "update-status" | "update-destination" | "delete";
  data: {
    status?: string;
    destinationOrg?: string;
  };
}

export const PATCH: APIRoute = async (context) => {
  try {
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const userId = user!.id;
    const body = await context.request.json() as BulkUpdateRequest;
    const { organizationIds, operation, data } = body;

    if (!organizationIds || organizationIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Organization IDs are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate that all organizations belong to the user
    const userOrgs = await db
      .select()
      .from(organizations)
      .where(and(
        inArray(organizations.id, organizationIds),
        eq(organizations.userId, userId)
      ));

    if (userOrgs.length !== organizationIds.length) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Some organizations not found or access denied",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let updatedCount = 0;

    switch (operation) {
      case "update-status":
        if (!data.status) {
          return new Response(
            JSON.stringify({
              success: false,
              error: "Status is required for status update",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }

        const statusResult = await db
          .update(organizations)
          .set({
            status: data.status,
            updatedAt: new Date(),
          })
          .where(inArray(organizations.id, organizationIds))
          .returning();

        updatedCount = statusResult.length;
        break;

      case "update-destination":
        const destResult = await db
          .update(organizations)
          .set({
            destinationOrg: data.destinationOrg || null,
            updatedAt: new Date(),
          })
          .where(inArray(organizations.id, organizationIds))
          .returning();

        updatedCount = destResult.length;
        break;

      default:
        return new Response(
          JSON.stringify({
            success: false,
            error: "Invalid operation",
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
        message: `Bulk ${operation} completed successfully`,
        updatedCount,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return createSecureErrorResponse(error, "Bulk organization operation", 500);
  }
};
import type { APIRoute } from "astro";
import { db, repositories, mirrorJobs } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { createSecureErrorResponse } from "@/lib/utils";
import { requireAuth } from "@/lib/utils/auth-helpers";

export const PATCH: APIRoute = async (context) => {
  try {
    // Check authentication
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const userId = user!.id;

    const repoId = context.params.id;
    if (!repoId) {
      return new Response(JSON.stringify({ error: "Repository ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await context.request.json();
    const { destinationOrg } = body;

    // Validate that the repository belongs to the user
    const [existingRepo] = await db
      .select()
      .from(repositories)
      .where(and(eq(repositories.id, repoId), eq(repositories.userId, userId)))
      .limit(1);

    if (!existingRepo) {
      return new Response(JSON.stringify({ error: "Repository not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Update the repository's destination override
    await db
      .update(repositories)
      .set({
        destinationOrg: destinationOrg || null,
        updatedAt: new Date(),
      })
      .where(eq(repositories.id, repoId));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Repository destination updated successfully",
        destinationOrg: destinationOrg || null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return createSecureErrorResponse(error, "Update repository destination", 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  try {
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const userId = user!.id;
    const repoId = context.params.id;

    if (!repoId) {
      return new Response(JSON.stringify({ error: "Repository ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [existingRepo] = await db
      .select()
      .from(repositories)
      .where(and(eq(repositories.id, repoId), eq(repositories.userId, userId)))
      .limit(1);

    if (!existingRepo) {
      return new Response(
        JSON.stringify({ error: "Repository not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    await db
      .delete(repositories)
      .where(and(eq(repositories.id, repoId), eq(repositories.userId, userId)));

    await db
      .delete(mirrorJobs)
      .where(and(eq(mirrorJobs.repositoryId, repoId), eq(mirrorJobs.userId, userId)));

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return createSecureErrorResponse(error, "Delete repository", 500);
  }
};

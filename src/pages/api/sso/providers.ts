import type { APIContext } from "astro";
import { createSecureErrorResponse } from "@/lib/utils";
import { requireAuth } from "@/lib/utils/auth-helpers";
import { db, ssoProviders } from "@/lib/db";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { normalizeOidcProviderConfig, OidcConfigError, type RawOidcConfig } from "@/lib/sso/oidc-config";

// GET /api/sso/providers - List all SSO providers
export async function GET(context: APIContext) {
  try {
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const providers = await db.select().from(ssoProviders);

    // Parse JSON fields before sending
    const formattedProviders = providers.map(provider => ({
      ...provider,
      oidcConfig: provider.oidcConfig ? JSON.parse(provider.oidcConfig) : undefined,
      samlConfig: (provider as any).samlConfig ? JSON.parse((provider as any).samlConfig) : undefined,
    }));

    return new Response(JSON.stringify(formattedProviders), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return createSecureErrorResponse(error, "SSO providers API");
  }
}

// POST /api/sso/providers - Create a new SSO provider
export async function POST(context: APIContext) {
  try {
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const body = await context.request.json();
    const {
      issuer,
      domain,
      clientId,
      clientSecret,
      authorizationEndpoint,
      tokenEndpoint,
      jwksEndpoint,
      userInfoEndpoint,
      discoveryEndpoint,
      mapping,
      providerId,
      organizationId,
      scopes,
      pkce,
    } = body;

    // Validate required fields
    if (!issuer || !domain || !providerId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check if provider ID already exists
    const existing = await db
      .select()
      .from(ssoProviders)
      .where(eq(ssoProviders.providerId, providerId))
      .limit(1);

    if (existing.length > 0) {
      return new Response(
        JSON.stringify({ error: "Provider ID already exists" }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Validate issuer URL format but keep trailing slash if provided
    const trimmedIssuer = issuer.toString().trim();
    try {
      new URL(trimmedIssuer);
    } catch {
      return new Response(
        JSON.stringify({ error: `Invalid issuer URL format: ${issuer}` }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let normalized;
    try {
      normalized = await normalizeOidcProviderConfig(trimmedIssuer, {
        clientId,
        clientSecret,
        authorizationEndpoint,
        tokenEndpoint,
        jwksEndpoint,
        userInfoEndpoint,
        discoveryEndpoint,
        scopes,
        pkce,
        mapping,
      });
    } catch (error) {
      if (error instanceof OidcConfigError) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      throw error;
    }

    const storedOidcConfig = {
      ...normalized.oidcConfig,
      mapping: normalized.mapping,
    };

    // Insert new provider
    const [newProvider] = await db
      .insert(ssoProviders)
      .values({
        id: nanoid(),
        issuer: trimmedIssuer,
        domain,
        oidcConfig: JSON.stringify(storedOidcConfig),
        userId: user.id,
        providerId,
        organizationId,
      })
      .returning();

    // Parse JSON fields before sending
    const formattedProvider = {
      ...newProvider,
      oidcConfig: newProvider.oidcConfig ? JSON.parse(newProvider.oidcConfig) : undefined,
      samlConfig: (newProvider as any).samlConfig ? JSON.parse((newProvider as any).samlConfig) : undefined,
    };

    return new Response(JSON.stringify(formattedProvider), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return createSecureErrorResponse(error, "SSO providers API");
  }
}

// PUT /api/sso/providers - Update an existing SSO provider
export async function PUT(context: APIContext) {
  try {
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const url = new URL(context.request.url);
    const providerId = url.searchParams.get("id");

    if (!providerId) {
      return new Response(
        JSON.stringify({ error: "Provider ID is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const body = await context.request.json();
    const {
      issuer,
      domain,
      clientId,
      clientSecret,
      authorizationEndpoint,
      tokenEndpoint,
      jwksEndpoint,
      userInfoEndpoint,
      discoveryEndpoint,
      scopes,
      pkce,
      organizationId,
    } = body;

    // Get existing provider
    const [existingProvider] = await db
      .select()
      .from(ssoProviders)
      .where(eq(ssoProviders.id, providerId))
      .limit(1);

    if (!existingProvider) {
      return new Response(
        JSON.stringify({ error: "Provider not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Parse existing config
    const existingConfig = JSON.parse(existingProvider.oidcConfig);
    const effectiveIssuer = issuer?.toString().trim() || existingProvider.issuer;

    try {
      new URL(effectiveIssuer);
    } catch {
      return new Response(
        JSON.stringify({ error: `Invalid issuer URL format: ${effectiveIssuer}` }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const mergedConfig: RawOidcConfig = {
      clientId: clientId ?? existingConfig.clientId,
      clientSecret: clientSecret ?? existingConfig.clientSecret,
      authorizationEndpoint: authorizationEndpoint ?? existingConfig.authorizationEndpoint,
      tokenEndpoint: tokenEndpoint ?? existingConfig.tokenEndpoint,
      jwksEndpoint: jwksEndpoint ?? existingConfig.jwksEndpoint,
      userInfoEndpoint: userInfoEndpoint ?? existingConfig.userInfoEndpoint,
      discoveryEndpoint: discoveryEndpoint ?? existingConfig.discoveryEndpoint,
      scopes: scopes ?? existingConfig.scopes,
      pkce: pkce ?? existingConfig.pkce,
      mapping: existingConfig.mapping,
    };

    let normalized;
    try {
      normalized = await normalizeOidcProviderConfig(effectiveIssuer, mergedConfig);
    } catch (error) {
      if (error instanceof OidcConfigError) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
      throw error;
    }

    const storedOidcConfig = {
      ...normalized.oidcConfig,
      mapping: normalized.mapping,
    };

    const [updatedProvider] = await db
      .update(ssoProviders)
      .set({
        issuer: effectiveIssuer,
        domain: domain || existingProvider.domain,
        oidcConfig: JSON.stringify(storedOidcConfig),
        organizationId: organizationId !== undefined ? organizationId : existingProvider.organizationId,
        updatedAt: new Date(),
      })
      .where(eq(ssoProviders.id, providerId))
      .returning();

    // Parse JSON fields before sending
    const formattedProvider = {
      ...updatedProvider,
      oidcConfig: JSON.parse(updatedProvider.oidcConfig),
      samlConfig: (updatedProvider as any).samlConfig ? JSON.parse((updatedProvider as any).samlConfig) : undefined,
    };

    return new Response(JSON.stringify(formattedProvider), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return createSecureErrorResponse(error, "SSO providers API");
  }
}

// DELETE /api/sso/providers - Delete a provider by ID
export async function DELETE(context: APIContext) {
  try {
    const { user, response } = await requireAuth(context);
    if (response) return response;

    const url = new URL(context.request.url);
    const providerId = url.searchParams.get("id");

    if (!providerId) {
      return new Response(
        JSON.stringify({ error: "Provider ID is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const deleted = await db
      .delete(ssoProviders)
      .where(eq(ssoProviders.id, providerId))
      .returning();

    if (deleted.length === 0) {
      return new Response(JSON.stringify({ error: "Provider not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return createSecureErrorResponse(error, "SSO providers API");
  }
}

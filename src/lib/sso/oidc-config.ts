import { z } from "zod";

const DEFAULT_SCOPES = ["openid", "email", "profile"] as const;
const DISCOVERY_TIMEOUT_MS = 10000;

const discoverySchema = z.object({
  issuer: z.string().url().optional(),
  authorization_endpoint: z.string().url().optional(),
  token_endpoint: z.string().url().optional(),
  userinfo_endpoint: z.string().url().optional(),
  jwks_uri: z.string().url().optional(),
  scopes_supported: z.array(z.string()).optional(),
});

export class OidcConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OidcConfigError";
  }
}

export type RawOidcConfig = {
  clientId?: string;
  clientSecret?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksEndpoint?: string;
  userInfoEndpoint?: string;
  discoveryEndpoint?: string;
  scopes?: string[];
  pkce?: boolean;
  mapping?: ProviderMapping;
};

export type ProviderMapping = {
  id: string;
  email: string;
  emailVerified?: string;
  name?: string;
  image?: string;
  firstName?: string;
  lastName?: string;
};

export type NormalizedOidcConfig = {
  oidcConfig: {
    clientId?: string;
    clientSecret?: string;
    authorizationEndpoint: string;
    tokenEndpoint: string;
    jwksEndpoint?: string;
    userInfoEndpoint?: string;
    discoveryEndpoint: string;
    scopes: string[];
    pkce: boolean;
  };
  mapping: ProviderMapping;
};

type FetchFn = typeof fetch;

function cleanUrl(value: string | undefined, field: string): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).toString();
  } catch {
    throw new OidcConfigError(`Invalid ${field} URL: ${value}`);
  }
}

function sanitizeScopes(scopes: string[] | undefined, fallback: readonly string[]): string[] {
  const candidates = Array.isArray(scopes) ? scopes : [];
  const sanitized = candidates
    .map(scope => scope?.trim())
    .filter((scope): scope is string => Boolean(scope));

  if (sanitized.length === 0) {
    return [...fallback];
  }

  return Array.from(new Set(sanitized));
}

async function fetchDiscoveryDocument(url: string, fetchFn: FetchFn): Promise<z.infer<typeof discoverySchema>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);

  try {
    const response = await fetchFn(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new OidcConfigError(`OIDC discovery request failed (${response.status} ${response.statusText})`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new OidcConfigError("OIDC discovery response is not valid JSON");
    }

    const parsed = discoverySchema.parse(payload);
    if (!parsed.authorization_endpoint || !parsed.token_endpoint) {
      throw new OidcConfigError("OIDC discovery document is missing required endpoints");
    }
    return parsed;
  } catch (error) {
    if (error instanceof OidcConfigError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new OidcConfigError(`OIDC discovery timed out after ${DISCOVERY_TIMEOUT_MS / 1000}s`);
    }
    throw new OidcConfigError(`Failed to fetch OIDC discovery document: ${error instanceof Error ? error.message : "unknown error"}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function normalizeOidcProviderConfig(
  issuer: string,
  rawConfig: RawOidcConfig,
  fetchFn: FetchFn = fetch,
): Promise<NormalizedOidcConfig> {
  if (!issuer || typeof issuer !== "string") {
    throw new OidcConfigError("Issuer is required");
  }

  const trimmedIssuer = issuer.trim();

  try {
    // Validate issuer but keep caller-provided formatting so we don't break provider expectations
    new URL(trimmedIssuer);
  } catch {
    throw new OidcConfigError(`Invalid issuer URL: ${issuer}`);
  }

  const issuerForDiscovery = trimmedIssuer.replace(/\/$/, "");

  const discoveryEndpoint = cleanUrl(
    rawConfig.discoveryEndpoint,
    "discovery endpoint",
  ) ?? `${issuerForDiscovery}/.well-known/openid-configuration`;

  const authorizationEndpoint = cleanUrl(rawConfig.authorizationEndpoint, "authorization endpoint");
  const tokenEndpoint = cleanUrl(rawConfig.tokenEndpoint, "token endpoint");
  const jwksEndpoint = cleanUrl(rawConfig.jwksEndpoint, "JWKS endpoint");
  const userInfoEndpoint = cleanUrl(rawConfig.userInfoEndpoint, "userinfo endpoint");
  const providedScopes = Array.isArray(rawConfig.scopes) ? rawConfig.scopes : undefined;
  let scopes = sanitizeScopes(providedScopes, DEFAULT_SCOPES);

  const shouldFetchDiscovery =
    !authorizationEndpoint ||
    !tokenEndpoint ||
    !jwksEndpoint ||
    !userInfoEndpoint ||
    !providedScopes ||
    providedScopes.length === 0;

  let resolvedAuthorization = authorizationEndpoint;
  let resolvedToken = tokenEndpoint;
  let resolvedJwks = jwksEndpoint;
  let resolvedUserInfo = userInfoEndpoint;

  if (shouldFetchDiscovery) {
    const discovery = await fetchDiscoveryDocument(discoveryEndpoint, fetchFn);
    resolvedAuthorization = resolvedAuthorization ?? discovery.authorization_endpoint;
    resolvedToken = resolvedToken ?? discovery.token_endpoint;
    resolvedJwks = resolvedJwks ?? discovery.jwks_uri;
    resolvedUserInfo = resolvedUserInfo ?? discovery.userinfo_endpoint;
    if (!providedScopes || providedScopes.length === 0) {
      scopes = sanitizeScopes(discovery.scopes_supported, DEFAULT_SCOPES);
    }
  }

  if (!resolvedAuthorization || !resolvedToken) {
    throw new OidcConfigError("OIDC configuration must include authorization and token endpoints");
  }

  return {
    oidcConfig: {
      clientId: rawConfig.clientId,
      clientSecret: rawConfig.clientSecret,
      authorizationEndpoint: resolvedAuthorization,
      tokenEndpoint: resolvedToken,
      jwksEndpoint: resolvedJwks,
      userInfoEndpoint: resolvedUserInfo,
      discoveryEndpoint,
      scopes,
      pkce: rawConfig.pkce !== false,
    },
    mapping: rawConfig.mapping ?? {
      id: "sub",
      email: "email",
      emailVerified: "email_verified",
      name: "name",
      image: "picture",
    },
  };
}

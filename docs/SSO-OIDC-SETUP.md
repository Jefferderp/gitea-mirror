# SSO and OIDC Setup Guide

This guide explains how to configure Single Sign-On (SSO) and OpenID Connect (OIDC) provider functionality in Gitea Mirror.

## Overview

Gitea Mirror supports three authentication methods:

1. **Email & Password** - Traditional authentication (always enabled)
2. **SSO (Single Sign-On)** - Allow users to authenticate using external OIDC providers
3. **OIDC Provider** - Allow other applications to authenticate users through Gitea Mirror

## Configuration

All SSO and OIDC settings are managed through the web UI in the Configuration page under the "Authentication" tab.

## Setting up SSO (Single Sign-On)

SSO allows your users to sign in using external identity providers like Google, Okta, Azure AD, etc.

### Adding an SSO Provider

1. Navigate to Configuration → Authentication → SSO Providers
2. Click "Add Provider"
3. Fill in the provider details:

#### Required Fields

- **Issuer URL**: The OIDC issuer URL (e.g., `https://accounts.google.com`)
- **Domain**: The email domain for this provider (e.g., `example.com`)
- **Provider ID**: A unique identifier for this provider (e.g., `google-sso`)
- **Client ID**: The OAuth client ID from your provider
- **Client Secret**: The OAuth client secret from your provider

#### Auto-Discovery

If your provider supports OIDC discovery, you can:
1. Enter the Issuer URL
2. Click "Discover"
3. The system will automatically fetch the authorization and token endpoints

#### Manual Configuration

For providers without discovery support, manually enter:
- **Authorization Endpoint**: The OAuth authorization URL
- **Token Endpoint**: The OAuth token exchange URL
- **JWKS Endpoint**: The JSON Web Key Set URL (optional)
- **UserInfo Endpoint**: The user information endpoint (optional)

### Redirect URL

When configuring your SSO provider, use this redirect URL:
```
https://your-domain.com/api/auth/sso/callback/{provider-id}
```

Replace `{provider-id}` with your chosen Provider ID.

### Example: Google SSO Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new OAuth 2.0 Client ID
3. Add authorized redirect URI: `https://your-domain.com/api/auth/sso/callback/google-sso`
4. In Gitea Mirror:
   - Issuer URL: `https://accounts.google.com`
   - Domain: `your-company.com`
   - Provider ID: `google-sso`
   - Client ID: [Your Google Client ID]
   - Client Secret: [Your Google Client Secret]
   - Click "Discover" to auto-fill endpoints

### Example: Okta SSO Setup

1. In Okta Admin Console, create a new OIDC Web Application
2. Set redirect URI: `https://your-domain.com/api/auth/sso/callback/okta-sso`
3. In Gitea Mirror:
   - Issuer URL: `https://your-okta-domain.okta.com`
   - Domain: `your-company.com`
   - Provider ID: `okta-sso`
   - Client ID: [Your Okta Client ID]
   - Client Secret: [Your Okta Client Secret]
   - Click "Discover" to auto-fill endpoints

### Example: Authentik SSO Setup

Working Authentik deployments (see [#134](https://github.com/RayLabsHQ/gitea-mirror/issues/134)) follow these steps:

1. In Authentik, create a new **Application** and OIDC **Provider** (implicit flow works well for testing).
2. Start creating an SSO provider inside Gitea Mirror so you can copy the redirect URL shown (`https://your-domain.com/api/auth/sso/callback/authentik` if you pick `authentik` as your Provider ID).
3. Paste that redirect URL into the Authentik Provider configuration and finish creating the provider.
4. Copy the Authentik issuer URL, client ID, and client secret.
5. Back in Gitea Mirror:
   - Issuer URL: the exact value from Authentik (keep any trailing slash Authentik shows).
   - Provider ID: match the one you used in step 2.
   - Click **Discover** so Gitea Mirror stores the authorization, token, and JWKS endpoints (Authentik publishes them via discovery).
   - Domain: enter the email domain you expect to match (e.g. `example.com`).
6. Save the provider and test the login flow.

Notes:
- Make sure `BETTER_AUTH_URL` and (if you serve the UI from multiple origins) `BETTER_AUTH_TRUSTED_ORIGINS` point at the public URL users reach. A mismatch can surface as 500 errors after redirect.
- Authentik must report the user’s email as verified (default behavior) so Gitea Mirror can auto-link accounts.
- If you created an Authentik provider before v3.8.10 you should delete it and re-add it after upgrading; older versions saved incomplete endpoint data which leads to the `url.startsWith` error explained in the Troubleshooting section.

## Setting up OIDC Provider

The OIDC Provider feature allows other applications to use Gitea Mirror as their authentication provider.

### Creating OAuth Applications

1. Navigate to Configuration → Authentication → OAuth Applications
2. Click "Create Application"
3. Fill in the application details:
   - **Application Name**: Display name for the application
   - **Application Type**: Web, Mobile, or Desktop
   - **Redirect URLs**: One or more redirect URLs (one per line)

4. After creation, you'll receive:
   - **Client ID**: Share this with the application
   - **Client Secret**: Keep this secure and share only once

### OIDC Endpoints

Applications can use these standard OIDC endpoints:

- **Discovery**: `https://your-domain.com/.well-known/openid-configuration`
- **Authorization**: `https://your-domain.com/api/auth/oauth2/authorize`
- **Token**: `https://your-domain.com/api/auth/oauth2/token`
- **UserInfo**: `https://your-domain.com/api/auth/oauth2/userinfo`
- **JWKS**: `https://your-domain.com/api/auth/jwks`

### Supported Scopes

- `openid` - Required, provides user ID
- `profile` - User's name, username, and profile picture
- `email` - User's email address and verification status

### Example: Configuring Another Application

For an application to use Gitea Mirror as its OIDC provider:

```javascript
// Example configuration for another app
const oidcConfig = {
  issuer: 'https://gitea-mirror.example.com',
  clientId: 'client_xxxxxxxxxxxxx',
  clientSecret: 'secret_xxxxxxxxxxxxx',
  redirectUri: 'https://myapp.com/auth/callback',
  scope: 'openid profile email'
};
```

## User Experience

### Logging In with SSO

When SSO is configured:

1. Users see tabs for "Email" and "SSO" on the login page
2. In the SSO tab, they can:
   - Click a specific provider button (if configured)
   - Enter their work email to be redirected to the appropriate provider

### OAuth Consent Flow

When an application requests authentication:

1. Users are redirected to Gitea Mirror
2. If not logged in, they authenticate first
3. They see a consent screen showing:
   - Application name
   - Requested permissions
   - Option to approve or deny

## Security Considerations

1. **Client Secrets**: Store OAuth client secrets securely
2. **Redirect URLs**: Only add trusted redirect URLs for applications
3. **Scopes**: Applications only receive the data for approved scopes
4. **Token Security**: Access tokens expire and can be revoked

## Troubleshooting

### SSO Login Issues

1. **"Invalid origin" error**: Check that your Gitea Mirror URL matches the configured redirect URI
2. **"Provider not found" error**: Ensure the provider is properly configured and enabled
3. **Redirect loop**: Verify the redirect URI in both Gitea Mirror and the SSO provider match exactly
4. **`TypeError: undefined is not an object (evaluating 'url.startsWith')`**: This indicates the stored provider configuration is missing OIDC endpoints. Delete the provider from Gitea Mirror and re-register it using the **Discover** button so authorization/token URLs are saved (see [#73](https://github.com/RayLabsHQ/gitea-mirror/issues/73) and [#122](https://github.com/RayLabsHQ/gitea-mirror/issues/122) for examples).

### OIDC Provider Issues

1. **Application not found**: Ensure the client ID is correct
2. **Invalid redirect URI**: The redirect URI must match exactly what's configured
3. **Consent not working**: Check browser cookies are enabled

## Managing Access

### Revoking SSO Access

Currently, SSO sessions are managed through the identity provider. To revoke access:
1. Log out of Gitea Mirror
2. Revoke access in your identity provider's settings

### Disabling OAuth Applications

To disable an application:
1. Go to Configuration → Authentication → OAuth Applications
2. Find the application
3. Click the delete button

This immediately prevents the application from authenticating new users.

## Best Practices

1. **Use HTTPS**: Always use HTTPS in production for security
2. **Regular Audits**: Periodically review configured SSO providers and OAuth applications
3. **Principle of Least Privilege**: Only grant necessary scopes to applications
4. **Monitor Usage**: Keep track of which applications are accessing your OIDC provider
5. **Secure Storage**: Store client secrets in a secure location, never in code

## Migration Notes

If migrating from the previous JWT-based authentication:
- Existing users remain unaffected
- Users can continue using email/password authentication
- SSO can be added as an additional authentication method

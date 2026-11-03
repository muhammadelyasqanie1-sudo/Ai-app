# AFG AI Connections & Integrations

## Deployment prerequisites

1. Configure `DATABASE_URL` and run `npm run db:migrate`. Migration `0008_connections_integrations.sql` creates the integration registry, encrypted credential stores, MCP registry, per-user GitHub link records, FTP workspace metadata, and rate-limit tables.
2. Generate a 32-byte encryption key, for example:
   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   Set it as the server-only Render variable `AFG_INTEGRATION_ENCRYPTION_KEY`. It must be 32 bytes when decoded from base64 (or 64 hex characters). Never use a `VITE_` prefix. Back it up securely: losing it makes existing encrypted credentials unreadable.
3. For individual GitHub OAuth linking, create a GitHub OAuth App and set `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET`. Set the callback URL to `https://YOUR_APP_ORIGIN/api/integrations/github/callback`. `APP_ORIGIN` must be the canonical HTTPS origin.
4. No credentials are shipped in the repository or frontend build.

## Admin workflow

Open Admin → Connections. Save a credential, then run Test connection. Only a successful real provider check enables an integration. Disabling immediately changes the global integration state; Revoking deletes the encrypted platform credential. Admin endpoints require an administrator session and CSRF validation.

Supported health checks:
- GitHub platform credential: `GET /user` and a repository access request.
- Web Search: a real dummy query through Tavily, Brave Search, or SerpAPI.
- Telegram: `getMe` and `getWebhookInfo`.

Web Research reads the encrypted, verified Web Search credential and provider selection from the integration registry. The global toggle is enforced before the research handler. Per-user rate limits are stored in PostgreSQL in addition to the existing process/IP limit.

## Personal GitHub accounts

Users can link a separate GitHub account in Settings → GitHub. The OAuth callback stores the user token encrypted in `integration_user_credentials`; the token is never returned to the browser. Unlinking revokes the local link and deletes the encrypted token. The admin Connections list reports linked-user adoption separately from the platform-wide credential.

## Explicitly fail-closed capabilities

- FTP/SFTP: workspace metadata and credentials are stored, and a guarded public TCP reachability probe is available. Protocol authentication and remote directory listing are not implemented yet; therefore the connection test deliberately fails and the integration cannot become Active. Private, loopback, and link-local network targets are blocked.
- MCP: server definitions and environment values are stored (environment values encrypted), but process execution is intentionally blocked until a real isolated sandbox adapter is deployed. No command is run on the application host.
- FTP Server: disabled until a dedicated isolated file-transfer service is provisioned. The web application does not open an FTP daemon or expose its host filesystem.

These limitations are surfaced in the admin UI; no unsupported capability is represented as connected or running.

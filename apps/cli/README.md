# AFG AI CLI

This is the first Node.js companion CLI release. It is a real API client for the currently supported read-only Terminal API, not yet the full command matrix or a compiled single-file executable.

## Requirements

- Node.js 20+
- An AFG AI deployment with the Terminal migrations applied
- A scoped CLI token created from the AFG AI Terminal page

## Run from the repository root

```bash
npm run cli -- --help
npm run cli -- login --url https://your-afg-ai-host
npm run cli -- whoami
npm run cli -- models list
npm run cli -- conv list
npm run cli -- files list
npm run cli -- logout
```

Or run directly:

```bash
node apps/cli/src/index.mjs --help
```

During login, paste the token into the hidden interactive prompt. Never pass a token as a command-line argument. The CLI validates it through `GET /api/terminal/whoami` before saving it.

## Credential storage

Configuration is written to `~/.afg/config.toml`; directory permissions are set to 0700 and file permissions to 0600 where the operating system supports POSIX permissions. The token is plaintext in this protected file because an OS keyring adapter is not included yet. Protect your OS account and revoke a lost token from the AFG AI web UI.

`afg logout` removes only the local configuration. It does not revoke the server-side token.

## Supported commands

- `afg login --url URL`
- `afg logout`
- `afg whoami`
- `afg models list`
- `afg conv list`
- `afg files list`
- `afg help`, `afg --help`, `afg version`

The following are intentionally unavailable and return an honest unsupported-command message: chat, image generation, file upload/download, conversation mutation/export/search, model health/show, admin commands, offline pack management and shell execution. No arbitrary shell command is run on the application server.

## Exit codes

- 0 success
- 1 user input / unsupported command
- 2 authentication failure
- 3 network or server failure
- 4 permission denied / terminal execution disabled

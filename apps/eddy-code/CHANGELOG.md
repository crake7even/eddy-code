# eddy-code

## 0.6.5

### Patch Changes

- Improve Windows cc-connect onboarding and service handling. Eddy Code now uses a safer PM2 command path for cc-connect, preserves Telegram platform tokens while adding detected proxy settings, reports PM2/proxy diagnostics more clearly, and avoids terminal scrollback jumps during TUI full redraws.

## 0.6.4

### Patch Changes

- Improve cc-connect setup for Eddy Code. The stream-json compatibility layer now accepts `--append-system-prompt-file`, Windows setup uses a no-space wrapper command instead of deprecated `cli_path`, existing Weixin tokens are preserved during config repair, and setup guidance now explains QR authentication and PM2 status more clearly.

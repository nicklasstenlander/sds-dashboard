# Screen Remote Management Test Plan

## Local build checks

```bash
npm run build
python3 -m py_compile pi-agent/core_screen_agent.py
node --check sodss-signage/worker.js
```

## Worker API

Use a configured Worker with `ADMIN_SECRET` and either `CORE_AGENT_TOKEN` or `SCREEN_AGENT_TOKENS`.

1. Send heartbeat as the Pi agent and confirm `GET /api/screens` shows `online: true`.
2. Upload a screenshot to `POST /api/screens/:screenId/screenshot` and confirm R2 contains `screens/{screenId}/latest.jpg`.
3. Create a command from CORE UI or `POST /api/screens/:screenId/commands`.
4. Poll `GET /api/screens/:screenId/commands/next` as the agent and confirm the command changes to `running`.
5. Post command result and confirm latest command is `done` or `failed`.
6. Verify invalid Bearer tokens return `401`.
7. Verify an unknown command type returns `400`.

## CORE UI

1. Open `Skyltning > Skärmar`.
2. Confirm screens poll every few seconds and preview images use `lastScreenshotAt` cache busting.
3. Click `Ta ny skärmdump` and confirm the waiting state clears after a new screenshot upload.
4. Click Chromium reload/restart buttons and confirm a command appears.
5. Click reboot and confirm the modal appears before the command is created.
6. Confirm failed command errors are visible.

## Raspberry Pi agent

1. Start manually with `/etc/core-screen-agent.env` configured.
2. Confirm heartbeat appears in CORE within 60 seconds.
3. Confirm an automatic screenshot appears within 5 minutes.
4. Send each allowlisted command and watch `journalctl -u core-screen-agent.service -f`.
5. Confirm the agent never executes command text from the API, only its internal command mapping.

# CORE Screen Agent

Agent for Raspberry Pi OS with X11. It talks to CORE using outbound HTTPS only: heartbeat, screenshots, polling for allowlisted commands.

## 1. Install on Raspberry Pi

```bash
sudo apt update
sudo apt install -y scrot xdotool curl python3
mkdir -p /home/stenlander/core-screen-agent
```

Copy `core_screen_agent.py` to `/home/stenlander/core-screen-agent/core_screen_agent.py`.

## 2. Env file

Create `/etc/core-screen-agent.env`:

```bash
CORE_BASE_URL=https://sodss-signage.example.workers.dev
SCREEN_ID=sodss-skylt
CORE_AGENT_TOKEN=your-secret-token
KIOSK_URL=https://core.sollentunadansochscenskola.se/player.html
DISPLAY=:0
KIOSK_RESTART_SCRIPT=/home/stenlander/start-kiosk.sh
```

Do not commit real tokens. Configure the same token in the Cloudflare Worker as `CORE_AGENT_TOKEN`, or use `SCREEN_AGENT_TOKENS` for per-screen tokens:

```json
{"sodss-skylt":"your-secret-token"}
```

## 3. Dependencies

```bash
sudo apt update
sudo apt install -y scrot xdotool curl python3
```

`scrot` requires X11. If the Pi uses Wayland, switch the kiosk session to X11 or replace screenshot capture deliberately.

## 4. Start manually

```bash
cd /home/stenlander/core-screen-agent
python3 core_screen_agent.py
```

The agent logs to stdout and sends:

- heartbeat every 60 seconds
- screenshot every 5 minutes
- command poll every 30 seconds

## 5. Systemd service

Copy `core-screen-agent.service`:

```bash
sudo cp core-screen-agent.service /etc/systemd/system/core-screen-agent.service
sudo systemctl daemon-reload
sudo systemctl enable --now core-screen-agent.service
```

## 6. Logs

```bash
journalctl -u core-screen-agent.service -f
```

## 7. Test screenshot

```bash
DISPLAY=:0 scrot /tmp/test.jpg
ls -lh /tmp/test.jpg
```

To test upload through the agent, run it manually and watch the CORE Skyltning > Skärmar view.

## 8. Limited sudo for reboot

The agent does not edit sudoers automatically. Add this with `sudo visudo`:

```text
stenlander ALL=(ALL) NOPASSWD: /usr/sbin/reboot
```

Only reboot needs sudo. Browser reload/restart and screenshots run as the `stenlander` user.

## 9. Troubleshooting

- `DISPLAY=:0`: Confirm the kiosk browser runs in the same X11 display.
- `scrot` only works in X11: Wayland sessions need a different capture tool.
- Chromium not found after restart: verify `/home/stenlander/start-kiosk.sh` exists and is executable.
- `xdotool` missing: run `sudo apt install -y xdotool`.
- API-token nekas: verify `CORE_AGENT_TOKEN` or `SCREEN_AGENT_TOKENS` in the Worker and `/etc/core-screen-agent.env`.
- R2 upload fungerar inte: check Worker logs, bucket binding `BUCKET`, and that the screenshot endpoint returns `ok: true`.

## Commands

The API can only request these fixed command types:

- `screenshot_now`
- `reload_browser`
- `restart_browser`
- `reboot_pi`

The agent maps each type internally. It never executes shell text from the API.

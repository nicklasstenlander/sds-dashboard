#!/usr/bin/env python3
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

AGENT_VERSION = "1.0.0"
CONFIG_PATHS = ["/etc/core-screen-agent.env", ".env"]
ALLOWED_COMMANDS = {
    "screenshot_now",
    "reload_browser",
    "restart_browser",
    "reboot_pi",
}


def log(message):
    print(f"{datetime.now(timezone.utc).isoformat()} {message}", flush=True)


def load_env_file(path):
    env_path = Path(path)
    if not env_path.exists():
        return
    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_config():
    for path in CONFIG_PATHS:
        load_env_file(path)

    required = ["CORE_BASE_URL", "SCREEN_ID", "CORE_AGENT_TOKEN"]
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        raise RuntimeError(f"Saknar config: {', '.join(missing)}")

    return {
        "base_url": os.environ["CORE_BASE_URL"].rstrip("/"),
        "screen_id": os.environ["SCREEN_ID"],
        "token": os.environ["CORE_AGENT_TOKEN"],
        "kiosk_url": os.environ.get("KIOSK_URL", ""),
        "display": os.environ.get("DISPLAY", ":0"),
        "wayland_display": os.environ.get("WAYLAND_DISPLAY", "wayland-0"),
        "xdg_runtime_dir": os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}"),
        "restart_script": os.environ.get("KIOSK_RESTART_SCRIPT", "/home/stenlander/start-kiosk.sh"),
        # .png fast R2-nyckeln på serversidan alltid heter latest.jpg (hårdkodat i
        # worker.js och Signage.tsx) — Content-Type sätts separat vid uppladdning
        # och avgör hur webbläsaren tolkar filen, inte namnet. grim på den här
        # Pi-avbildningen är byggd utan libjpeg, så riktig jpeg är inte ett alternativ.
        "screenshot_path": f"/tmp/{os.environ['SCREEN_ID']}.png",
    }


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def request_json(config, method, path, payload=None):
    url = f"{config['base_url']}{path}"
    data = None
    headers = {
        "Authorization": f"Bearer {config['token']}",
        "Accept": "application/json",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as response:
        body = response.read().decode("utf-8")
        return json.loads(body) if body else {}


def run_command(args, env=None, check=True):
    log(f"Kör: {' '.join(args)}")
    return subprocess.run(args, env=env, check=check, capture_output=True, text=True)


def get_temperature():
    thermal = Path("/sys/class/thermal/thermal_zone0/temp")
    if thermal.exists():
        try:
            return f"{int(thermal.read_text().strip()) / 1000:.1f} C"
        except ValueError:
            pass
    try:
        result = subprocess.run(["vcgencmd", "measure_temp"], capture_output=True, text=True, timeout=5)
        return result.stdout.strip()
    except FileNotFoundError:
        return ""


def get_uptime():
    try:
        seconds = float(Path("/proc/uptime").read_text().split()[0])
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        return f"{hours}h {minutes}m"
    except Exception:
        return ""


def get_tailscale_ip():
    try:
        result = subprocess.run(["tailscale", "ip", "-4"], capture_output=True, text=True, timeout=5)
        return result.stdout.strip().splitlines()[0] if result.stdout.strip() else ""
    except Exception:
        return ""


def send_heartbeat(config):
    payload = {
        "hostname": socket.gethostname(),
        "localTime": datetime.now().isoformat(),
        "uptime": get_uptime(),
        "temperature": get_temperature(),
        "tailscaleIp": get_tailscale_ip(),
        "agentVersion": AGENT_VERSION,
    }
    request_json(config, "POST", f"/api/screens/{config['screen_id']}/heartbeat", payload)
    log("Heartbeat skickad")


def take_screenshot(config):
    # Kiosken kör Chromium nativt mot Wayland (--ozone-platform=wayland), inte
    # via Xwayland. scrot läser X11-rootfönstret, som därför alltid är svart
    # oavsett vad som faktiskt visas — grim läser compositor-outputen direkt.
    env = os.environ.copy()
    env["XDG_RUNTIME_DIR"] = config["xdg_runtime_dir"]
    env["WAYLAND_DISPLAY"] = config["wayland_display"]
    # Ingen -t jpeg: grim-paketet på kiosk-avbildningen är byggt utan libjpeg
    # ("jpeg support disabled"). PNG (grims default) fungerar alltid.
    run_command(["grim", config["screenshot_path"]], env=env)
    log(f"Skärmdump sparad: {config['screenshot_path']}")
    return config["screenshot_path"]


def upload_screenshot(config, path):
    url = f"{config['base_url']}/api/screens/{config['screen_id']}/screenshot"
    args = [
        "curl",
        "--fail",
        "--silent",
        "--show-error",
        "-H",
        f"Authorization: Bearer {config['token']}",
        "-F",
        f"screenshot=@{path};type=image/png",
        "-F",
        f"capturedAt={utc_now()}",
        "-F",
        f"hostname={socket.gethostname()}",
        url,
    ]
    result = run_command(args)
    log(f"Skärmdump uppladdad: {result.stdout.strip()}")


def screenshot_now(config):
    upload_screenshot(config, take_screenshot(config))


def reload_browser(config):
    env = os.environ.copy()
    env["DISPLAY"] = config["display"]
    run_command(["xdotool", "key", "F5"], env=env)


def restart_browser(config):
    subprocess.run(["pkill", "-f", "chromium"], check=False)
    time.sleep(2)
    script = Path(config["restart_script"])
    if not script.exists():
      raise RuntimeError(f"Startscript saknas: {script}")
    run_command([str(script)])


def reboot_pi(config):
    run_command(["sudo", "/usr/sbin/reboot"])


COMMAND_HANDLERS = {
    "screenshot_now": screenshot_now,
    "reload_browser": reload_browser,
    "restart_browser": restart_browser,
    "reboot_pi": reboot_pi,
}


def poll_command(config):
    response = request_json(config, "GET", f"/api/screens/{config['screen_id']}/commands/next")
    command_type = response.get("type")
    command_id = response.get("commandId")
    if not command_id or not command_type:
        return

    if command_type not in ALLOWED_COMMANDS:
        report_result(config, command_id, "failed", f"Otillåtet kommando: {command_type}")
        return

    log(f"Kommando mottaget: {command_type} ({command_id})")
    try:
        COMMAND_HANDLERS[command_type](config)
        report_result(config, command_id, "done")
        log(f"Kommando klart: {command_type}")
    except Exception as exc:
        log(f"Kommando misslyckades: {exc}")
        report_result(config, command_id, "failed", str(exc))


def report_result(config, command_id, status, error=""):
    payload = {"status": status}
    if error:
        payload["error"] = error[:500]
    request_json(
        config,
        "POST",
        f"/api/screens/{config['screen_id']}/commands/{command_id}/result",
        payload,
    )


def run_check(name, last_time, interval, now, action):
    if now - last_time < interval:
        return last_time
    # Tiden uppdateras oavsett utfall. Annars fortsätter ett fel att stega om
    # på varje loop-varv (var 5:e sekund) i stället för att vänta till nästa
    # intervall — det var det som körde fast agenten i en evig 403-storm mot
    # Workern och blockerade de andra kontrollerna (de körs bara om det här
    # inte kastar).
    try:
        action()
    except (urllib.error.URLError, urllib.error.HTTPError, subprocess.CalledProcessError, RuntimeError) as exc:
        log(f"Fel ({name}): {exc}")
    except Exception as exc:
        log(f"Oväntat fel ({name}): {exc}")
    return now


def main():
    config = load_config()
    log(f"CORE screen agent {AGENT_VERSION} startar för {config['screen_id']}")

    last_heartbeat = 0
    last_screenshot = 0
    last_command_poll = 0

    while True:
        now = time.monotonic()
        last_heartbeat = run_check("heartbeat", last_heartbeat, 60, now, lambda: send_heartbeat(config))
        last_screenshot = run_check("screenshot", last_screenshot, 300, now, lambda: screenshot_now(config))
        last_command_poll = run_check("command_poll", last_command_poll, 30, now, lambda: poll_command(config))

        time.sleep(5)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Avslutar")
        sys.exit(0)

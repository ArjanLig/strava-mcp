import json
import os
import stat
import tempfile
from pathlib import Path

CONFIG_DIR = Path.home() / ".strava-mcp"
CONFIG_FILE = CONFIG_DIR / "config.json"


def load_config() -> dict:
    """Load config from ~/.strava-mcp/config.json"""
    if not CONFIG_FILE.exists():
        return {}
    with open(CONFIG_FILE) as f:
        return json.load(f)


def save_config(config: dict):
    """Save config to ~/.strava-mcp/config.json (atomic write)"""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(dir=CONFIG_DIR)
    try:
        with os.fdopen(fd, "w") as tmp_file:
            json.dump(config, tmp_file, indent=2)
            tmp_file.write("\n")
        os.chmod(tmp_path, stat.S_IRUSR | stat.S_IWUSR)
        os.replace(tmp_path, CONFIG_FILE)
    except Exception:
        os.unlink(tmp_path)
        raise


def get_credentials() -> dict:
    """Get credentials from config file. Returns dict with keys or raises."""
    config = load_config()

    required = ["client_id", "client_secret", "access_token", "refresh_token"]
    missing = [k for k in required if not config.get(k)]

    if missing:
        raise ValueError(
            f"Missing credentials: {', '.join(missing)}\n"
            f"Run 'strava-mcp --auth' to set up authentication."
        )

    return config


def update_tokens(access_token: str, refresh_token: str):
    """Update tokens in config file (used after refresh)"""
    config = load_config()
    config["access_token"] = access_token
    config["refresh_token"] = refresh_token
    save_config(config)

import threading
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from stravalib.client import Client
from strava_mcp.config import load_config, save_config

# Shared state for the callback server
_auth_code = None
_auth_error = None
_server_ready = threading.Event()
_code_received = threading.Event()


class _CallbackHandler(BaseHTTPRequestHandler):
    """Local HTTP server that catches the Strava OAuth redirect."""

    def do_GET(self):
        global _auth_code, _auth_error

        params = parse_qs(urlparse(self.path).query)

        if "code" in params:
            _auth_code = params["code"][0]
            self._respond(
                "<html><body style='font-family:sans-serif;text-align:center;padding:60px'>"
                "<h1>Gelukt!</h1>"
                "<p>Je kunt dit venster sluiten en teruggaan naar de terminal.</p>"
                "</body></html>"
            )
        else:
            _auth_error = params.get("error", ["unknown"])[0]
            self._respond(
                "<html><body style='font-family:sans-serif;text-align:center;padding:60px'>"
                "<h1>Er ging iets mis</h1>"
                "<p>Probeer het opnieuw in de terminal.</p>"
                "</body></html>"
            )

        _code_received.set()

    def _respond(self, html):
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(html.encode())

    def log_message(self, format, *args):
        pass  # suppress request logs


def _run_callback_server():
    """Start local server and wait for the OAuth callback."""
    server = HTTPServer(("localhost", 8000), _CallbackHandler)
    server.timeout = 120
    _server_ready.set()

    while not _code_received.is_set():
        server.handle_request()

    server.server_close()


def run_auth_flow():
    """Interactive OAuth setup flow with automatic callback."""
    global _auth_code, _auth_error
    _auth_code = None
    _auth_error = None
    _code_received.clear()
    _server_ready.clear()

    config = load_config()

    if not config.get("client_id"):
        print("\n== Strava MCP Setup ==\n")
        print("Je hebt een Strava API app nodig.")
        print("Maak er een aan op: https://www.strava.com/settings/api\n")
        print("Vul daar in:")
        print('  Website: http://localhost')
        print('  Authorization Callback Domain: localhost\n')
        config["client_id"] = input("Client ID: ").strip()

    if not config.get("client_secret"):
        config["client_secret"] = input("Client Secret: ").strip()

    if not config["client_id"] or not config["client_secret"]:
        print("\nClient ID en Client Secret zijn vereist.")
        return

    save_config(config)

    # Start callback server in background
    server_thread = threading.Thread(target=_run_callback_server, daemon=True)
    server_thread.start()
    _server_ready.wait()

    # Open browser for authorization
    client = Client()
    authorize_url = client.authorization_url(
        client_id=config["client_id"],
        redirect_uri="http://localhost:8000/authorized",
        scope=["read", "activity:read_all"],
    )

    print("\nBrowser wordt geopend voor autorisatie...")
    print(f"Opent de browser niet? Ga naar:\n{authorize_url}\n")
    webbrowser.open(authorize_url)

    print("Wachten op autorisatie...")
    _code_received.wait(timeout=120)

    if _auth_error:
        print(f"\nAutorisatie mislukt: {_auth_error}")
        return

    if not _auth_code:
        print("\nGeen autorisatie ontvangen (timeout). Probeer opnieuw.")
        return

    # Exchange code for tokens
    token_response = client.exchange_code_for_token(
        client_id=config["client_id"],
        client_secret=config["client_secret"],
        code=_auth_code,
    )

    config["access_token"] = token_response["access_token"]
    config["refresh_token"] = token_response["refresh_token"]
    save_config(config)

    print("\nAutorisatie gelukt! Tokens opgeslagen in ~/.strava-mcp/config.json")
    print("Je kunt nu strava-training-mcp gebruiken met Claude Desktop.")

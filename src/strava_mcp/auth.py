import webbrowser
from urllib.parse import urlparse, parse_qs
from stravalib.client import Client
from strava_mcp.config import load_config, save_config


def run_auth_flow():
    """Interactive OAuth setup flow"""
    config = load_config()

    # Ask for client_id and client_secret if not present
    if not config.get("client_id"):
        print("\n== Strava MCP Setup ==\n")
        print("You need a Strava API application.")
        print("Create one at: https://www.strava.com/settings/api\n")
        config["client_id"] = input("Client ID: ").strip()

    if not config.get("client_secret"):
        config["client_secret"] = input("Client Secret: ").strip()

    if not config["client_id"] or not config["client_secret"]:
        print("\nClient ID and Client Secret are required.")
        return

    # Save client credentials immediately
    save_config(config)

    # Start OAuth flow
    client = Client()
    authorize_url = client.authorization_url(
        client_id=config["client_id"],
        redirect_uri="http://localhost:8000/authorized",
        scope=["read", "activity:read_all"],
    )

    print(f"\nOpening browser for authorization...")
    print(f"If it doesn't open, go to:\n{authorize_url}\n")
    webbrowser.open(authorize_url)

    print("After authorizing, you'll be redirected to a URL.")
    print("Copy the full URL from your browser and paste it here:\n")
    redirect_response = input("Redirect URL: ").strip()

    # Extract code from URL
    parsed = urlparse(redirect_response)
    params = parse_qs(parsed.query)
    if "code" not in params:
        print("\nNo authorization code found in the URL.")
        print("Make sure you paste the complete redirect URL.")
        return

    code = params["code"][0]

    # Exchange code for tokens
    token_response = client.exchange_code_for_token(
        client_id=config["client_id"],
        client_secret=config["client_secret"],
        code=code,
    )

    config["access_token"] = token_response["access_token"]
    config["refresh_token"] = token_response["refresh_token"]
    save_config(config)

    print("\nAuthentication successful! Tokens saved to ~/.strava-mcp/config.json")
    print("You can now use strava-mcp with Claude Desktop.")

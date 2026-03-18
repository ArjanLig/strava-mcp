#!/bin/bash
set -e

main() {

echo ""
echo "=================================="
echo "  Strava MCP Installer"
echo "=================================="
echo ""

# Step 1: Install uv if not present
if ! command -v uvx &> /dev/null; then
    echo ">> uvx niet gevonden, uv wordt geinstalleerd..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    echo ""
fi

# Step 2: Authenticate with Strava
STRAVA_CONFIG_DIR="$HOME/.strava-mcp"
STRAVA_CONFIG="$STRAVA_CONFIG_DIR/config.json"

if [ -f "$STRAVA_CONFIG" ] && python3 -c "
import json, sys
c = json.load(open('$STRAVA_CONFIG'))
sys.exit(0 if all(c.get(k) for k in ['client_id','client_secret','access_token','refresh_token']) else 1)
" 2>/dev/null; then
    echo ">> Strava is al gekoppeld."
else
    # Collect credentials in bash (works with curl | bash via /dev/tty)
    echo ">> Je hebt een Strava API app nodig."
    echo "   Maak er een aan op: https://www.strava.com/settings/api"
    echo ""
    echo "   Vul daar in:"
    echo "     Website: http://localhost"
    echo "     Authorization Callback Domain: localhost"
    echo ""

    read -p "   Client ID: " STRAVA_CLIENT_ID < /dev/tty
    read -p "   Client Secret: " STRAVA_CLIENT_SECRET < /dev/tty

    if [ -z "$STRAVA_CLIENT_ID" ] || [ -z "$STRAVA_CLIENT_SECRET" ]; then
        echo ""
        echo ">> Client ID en Client Secret zijn vereist. Afgebroken."
        echo "   Je kunt later opnieuw proberen met: uvx strava-training-mcp@latest --auth"
        return 1
    fi

    # Save credentials so the auth flow skips the prompts
    mkdir -p "$STRAVA_CONFIG_DIR"
    python3 -c "
import json, os, stat
config = {}
if os.path.exists('$STRAVA_CONFIG'):
    with open('$STRAVA_CONFIG') as f:
        config = json.load(f)
config['client_id'] = '$STRAVA_CLIENT_ID'
config['client_secret'] = '$STRAVA_CLIENT_SECRET'
with open('$STRAVA_CONFIG', 'w') as f:
    json.dump(config, f, indent=2)
os.chmod('$STRAVA_CONFIG', stat.S_IRUSR | stat.S_IWUSR)
"

    echo ""
    echo ">> Browser wordt geopend voor Strava autorisatie..."
    echo ""
    if ! uvx strava-training-mcp@latest --auth; then
        echo ""
        echo ">> Autorisatie niet voltooid. Je kunt dit later opnieuw doen met:"
        echo "   uvx strava-training-mcp@latest --auth"
    fi
fi

# Step 3: Configure Claude Desktop
echo ""
echo ">> Claude Desktop configureren..."

CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"
UVX_PATH=$(which uvx)

mkdir -p "$CONFIG_DIR"

if [ -f "$CONFIG_FILE" ]; then
    if grep -q '"strava"' "$CONFIG_FILE" 2>/dev/null; then
        echo "   Strava staat al in je Claude Desktop config."
    else
        python3 -c "
import json
with open('$CONFIG_FILE') as f:
    config = json.load(f)
config.setdefault('mcpServers', {})
config['mcpServers']['strava'] = {
    'command': '$UVX_PATH',
    'args': ['strava-training-mcp']
}
with open('$CONFIG_FILE', 'w') as f:
    json.dump(config, f, indent=2)
print('   Strava toegevoegd aan Claude Desktop config.')
"
    fi
else
    cat > "$CONFIG_FILE" << CONF
{
  "mcpServers": {
    "strava": {
      "command": "$UVX_PATH",
      "args": ["strava-training-mcp"]
    }
  }
}
CONF
    echo "   Claude Desktop config aangemaakt."
fi

echo ""
echo "=================================="
echo "  Installatie voltooid!"
echo "=================================="
echo ""
echo "Herstart Claude Desktop en vraag bijvoorbeeld:"
echo '  "Wat waren mijn laatste 5 ritten?"'
echo '  "Hoe ziet mijn trainingsbelasting eruit?"'
echo ""

}

main

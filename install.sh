#!/bin/bash
set -e

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

# Step 2: Run auth flow
echo ">> Strava koppeling starten..."
echo ""
uvx strava-training-mcp@latest --auth

# Step 3: Configure Claude Desktop
echo ""
echo ">> Claude Desktop configureren..."

CONFIG_DIR="$HOME/Library/Application Support/Claude"
CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

# Create config directory if needed
mkdir -p "$CONFIG_DIR"

if [ -f "$CONFIG_FILE" ]; then
    # Config exists — check if strava is already configured
    if grep -q '"strava"' "$CONFIG_FILE" 2>/dev/null; then
        echo "   Strava staat al in je Claude Desktop config."
    else
        # Add strava to existing mcpServers using python (available via uvx)
        python3 -c "
import json
with open('$CONFIG_FILE') as f:
    config = json.load(f)
config.setdefault('mcpServers', {})
config['mcpServers']['strava'] = {
    'command': 'uvx',
    'args': ['strava-training-mcp']
}
with open('$CONFIG_FILE', 'w') as f:
    json.dump(config, f, indent=2)
print('   Strava toegevoegd aan Claude Desktop config.')
"
    fi
else
    # Create new config
    cat > "$CONFIG_FILE" << 'CONF'
{
  "mcpServers": {
    "strava": {
      "command": "uvx",
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

#!/bin/bash
# scripts/setup-mcp.sh
# Setup script for Notion MCP Server

set -e

echo "==========================================="
echo "  Setting up Notion MCP Server"
echo "==========================================="

MCP_DIR="/opt/notion-mcp-server"

# Check if already cloned
if [ -d "$MCP_DIR" ]; then
  echo "[MCP] Directory exists, pulling latest..."
  cd "$MCP_DIR"
  git pull origin main
else
  echo "[MCP] Cloning notion-mcp-server..."
  git clone https://github.com/makenotion/notion-mcp-server.git "$MCP_DIR"
  cd "$MCP_DIR"
fi

# Install dependencies
echo "[MCP] Installing dependencies..."
npm install

# Build
echo "[MCP] Building..."
npm run build

# Verify build
if [ -f "$MCP_DIR/build/index.js" ]; then
  echo "[MCP] Build successful!"
  echo "[MCP] Server path: $MCP_DIR/build/index.js"
else
  echo "[MCP] ERROR: Build failed - index.js not found"
  exit 1
fi

echo ""
echo "==========================================="
echo "  MCP Server setup complete!"
echo "==========================================="
echo ""
echo "Next steps:"
echo "1. Copy .env.example to .env"
echo "2. Fill in your API keys"
echo "3. Run: docker compose up -d"

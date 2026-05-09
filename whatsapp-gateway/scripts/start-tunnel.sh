#!/bin/bash
# scripts/start-tunnel.sh
# Production startup: Docker Compose + Cloudflare Tunnel
#
# Modes:
#   ./scripts/start-tunnel.sh           → Quick Tunnel (gratis, tanpa domain, instan)
#   ./scripts/start-tunnel.sh named     → Named Tunnel (perlu domain + config)
#   ./scripts/start-tunnel.sh stop      → stop semua
#   ./scripts/start-tunnel.sh status    → cek status
#
# Quick Tunnel (default):
#   Langsung jalan, dapat URL random *.trycloudflare.com
#   Cocok buat testing dan development
#
# Named Tunnel:
#   1. brew install cloudflared
#   2. cloudflared tunnel login → pilih domain
#   3. cloudflared tunnel create wa-bot → catat Tunnel ID
#   4. Edit ~/.cloudflared/config.yml → isi Tunnel ID
#   5. cloudflared tunnel route dns wa-bot <subdomain>.domain.com

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Load .env
if [ -f .env ]; then
  set -a
  source <(grep -v '^#' .env | grep -v '^\s*$')
  set +a
fi

TUNNEL_NAME="${CLOUDFLARE_TUNNEL_NAME:-wa-bot}"
CONFIG_FILE="${CLOUDFLARED_CONFIG:-$HOME/.cloudflared/config.yml}"
ORCHESTRATOR_PORT="${ORCHESTRATOR_PORT:-3000}"
EVOLUTION_PORT="${EVOLUTION_PORT:-8080}"

# ─── Colors ─────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

print_header() {
  echo ""
  echo -e "${CYAN}==========================================="
  echo "  WA Notion Bot + Cloudflare Tunnel"
  echo -e "===========================================${NC}"
  echo ""
}

# ─── Stop ──────────────────────────────────────────────
stop_all() {
  echo -e "${YELLOW}[STOP] Stopping Cloudflare Tunnel...${NC}"
  pkill -f "cloudflared" 2>/dev/null && echo "  Tunnel stopped." || echo "  No tunnel running."

  echo -e "${YELLOW}[STOP] Stopping Docker containers...${NC}"
  docker compose down 2>/dev/null || true
  echo -e "${GREEN}  All services stopped.${NC}"
}

# ─── Status ────────────────────────────────────────────
show_status() {
  echo -e "${CYAN}[STATUS] Docker containers:${NC}"
  docker compose ps 2>/dev/null || echo "  No containers running."

  echo ""
  echo -e "${CYAN}[STATUS] Cloudflare Tunnel:${NC}"
  if pgrep -f "cloudflared" > /dev/null 2>&1; then
    echo -e "  ${GREEN}Tunnel is running${NC} (PID: $(pgrep -f 'cloudflared' | head -1))"
  else
    echo -e "  ${RED}Tunnel is NOT running${NC}"
  fi

  echo ""
  echo -e "${CYAN}[STATUS] Health check:${NC}"
  if curl -s http://localhost:${ORCHESTRATOR_PORT}/health > /dev/null 2>&1; then
    echo -e "  ${GREEN}Orchestrator: OK${NC} → http://localhost:${ORCHESTRATOR_PORT}/health"
  else
    echo -e "  ${RED}Orchestrator: DOWN${NC}"
  fi

  if curl -s http://localhost:${EVOLUTION_PORT}/ > /dev/null 2>&1; then
    echo -e "  ${GREEN}Evolution API: OK${NC} → http://localhost:${EVOLUTION_PORT}"
  else
    echo -e "  ${RED}Evolution API: DOWN${NC}"
  fi
}

# ─── Start Docker ──────────────────────────────────────
start_docker() {
  echo -e "${YELLOW}[1/3] Starting Docker containers...${NC}"
  docker compose up -d --build
  echo -e "${GREEN}  Docker containers started.${NC}"

  # Wait for orchestrator
  echo ""
  echo -e "${YELLOW}[2/3] Waiting for Orchestrator...${NC}"
  for i in $(seq 1 15); do
    if curl -s http://localhost:${ORCHESTRATOR_PORT}/health > /dev/null 2>&1; then
      echo -e "${GREEN}  Orchestrator is up!${NC}"
      break
    fi
    if [ "$i" -eq 15 ]; then
      echo -e "${RED}  Orchestrator failed to start. Check: docker compose logs orchestrator${NC}"
      exit 1
    fi
    sleep 2
  done

  # Wait for Evolution API
  echo ""
  echo -e "${YELLOW}[3/3] Waiting for Evolution API (may take ~2 min)...${NC}"
  for i in $(seq 1 30); do
    if curl -s http://localhost:${EVOLUTION_PORT}/ > /dev/null 2>&1; then
      echo -e "${GREEN}  Evolution API is up!${NC}"

      # Apply @lid patch
      echo "  Applying @lid patch..."
      docker exec wa-evolution-api sh -c "
        if ! grep -q '@lid' /evolution/dist/src/api/services/channels/whatsapp.baileys.service.js 2>/dev/null; then
          sed -i \"s/!isWA.jid.includes('@broadcast')/!isWA.jid.includes('@broadcast') \&\& !isWA.jid.includes('@lid')/g\" /evolution/dist/src/api/services/channels/whatsapp.baileys.service.js
          echo '    @lid patch applied!'
        else
          echo '    @lid patch already applied'
        fi
      " 2>/dev/null || echo "  Warning: Could not apply @lid patch"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo -e "${RED}  Evolution API still starting. Check: docker logs wa-evolution-api${NC}"
      echo "  Continuing anyway..."
    fi
    sleep 10
  done
}

# ─── Quick Tunnel (tanpa domain, gratis) ───────────────
start_quick() {
  print_header

  if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}Error: cloudflared not found!${NC}"
    echo "  Install: brew install cloudflared"
    exit 1
  fi

  start_docker

  echo ""
  echo -e "${YELLOW}Starting Quick Tunnel (no domain needed)...${NC}"
  echo ""

  # Kill existing cloudflared
  pkill -f "cloudflared" 2>/dev/null || true
  sleep 1

  # Start quick tunnel — capture URL from output
  cloudflared tunnel --url http://localhost:${ORCHESTRATOR_PORT} 2>&1 | tee /tmp/cloudflared-quick.log &
  TUNNEL_PID=$!

  # Wait for URL to appear in output
  echo -e "${YELLOW}Waiting for tunnel URL...${NC}"
  TUNNEL_URL=""
  for i in $(seq 1 30); do
    TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cloudflared-quick.log 2>/dev/null | head -1)
    if [ -n "$TUNNEL_URL" ]; then
      break
    fi
    sleep 1
  done

  # Done
  echo ""
  echo -e "${CYAN}===========================================${NC}"
  echo -e "${GREEN}  All services are running!${NC}"
  echo -e "${CYAN}===========================================${NC}"
  echo ""
  echo "  Local:"
  echo "    Orchestrator:  http://localhost:${ORCHESTRATOR_PORT}"
  echo "    Health:        http://localhost:${ORCHESTRATOR_PORT}/health"
  echo "    Evolution API: http://localhost:${EVOLUTION_PORT}"
  echo "    Manager UI:    http://localhost:${EVOLUTION_PORT}/manager"
  echo ""
  if [ -n "$TUNNEL_URL" ]; then
    echo -e "  ${GREEN}Public (Quick Tunnel):${NC}"
    echo "    Bot URL:       ${TUNNEL_URL}"
    echo "    Health:        ${TUNNEL_URL}/health"
    echo ""
    echo -e "  ${YELLOW}Webhook URL for Evolution API:${NC}"
    echo "    ${TUNNEL_URL}/webhook/wa-bot"
    echo ""
    echo -e "  ${YELLOW}NOTE: URL ini berubah setiap restart!${NC}"
    echo "  Untuk URL permanent, pakai: ./scripts/start-tunnel.sh named"
  else
    echo -e "  ${YELLOW}Tunnel URL belum muncul. Cek: cat /tmp/cloudflared-quick.log${NC}"
  fi
  echo ""
  echo "  Commands:"
  echo "    ./scripts/start-tunnel.sh stop     → stop semua"
  echo "    ./scripts/start-tunnel.sh status   → cek status"
  echo "    docker compose logs -f             → lihat logs"
}

# ─── Named Tunnel (perlu domain + config) ──────────────
start_named() {
  print_header

  if ! command -v cloudflared &> /dev/null; then
    echo -e "${RED}Error: cloudflared not found!${NC}"
    echo "  Install: brew install cloudflared"
    exit 1
  fi

  if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}Error: Cloudflare config not found at ${CONFIG_FILE}${NC}"
    echo ""
    echo "Setup named tunnel:"
    echo "  1. cloudflared tunnel login"
    echo "  2. cloudflared tunnel create ${TUNNEL_NAME}"
    echo "  3. Copy cloudflared-config.yml to ${CONFIG_FILE}"
    echo "  4. Edit Tunnel ID in config"
    echo "  5. cloudflared tunnel route dns ${TUNNEL_NAME} <subdomain>.domain.com"
    exit 1
  fi

  if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
    echo -e "${RED}Error: cert.pem not found. Run: cloudflared tunnel login${NC}"
    exit 1
  fi

  start_docker

  echo ""
  echo -e "${YELLOW}Starting Named Tunnel...${NC}"

  pkill -f "cloudflared tunnel" 2>/dev/null || true
  sleep 1

  cloudflared tunnel --config "$CONFIG_FILE" run "$TUNNEL_NAME" &
  TUNNEL_PID=$!
  echo -e "${GREEN}  Tunnel started (PID: ${TUNNEL_PID})${NC}"

  echo ""
  echo -e "${CYAN}===========================================${NC}"
  echo -e "${GREEN}  All services are running!${NC}"
  echo -e "${CYAN}===========================================${NC}"
  echo ""
  echo "  Commands:"
  echo "    ./scripts/start-tunnel.sh stop     → stop semua"
  echo "    ./scripts/start-tunnel.sh status   → cek status"
}

# ─── Main ──────────────────────────────────────────────
case "${1:-quick}" in
  quick|start)
    start_quick
    ;;
  named)
    start_named
    ;;
  stop)
    stop_all
    ;;
  status)
    show_status
    ;;
  *)
    echo "Usage: $0 {quick|named|stop|status}"
    echo ""
    echo "  quick  → Quick Tunnel (default, gratis, tanpa domain)"
    echo "  named  → Named Tunnel (perlu domain + config)"
    echo "  stop   → Stop semua service"
    echo "  status → Cek status service"
    ;;
esac

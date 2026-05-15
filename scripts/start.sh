#!/bin/bash
# scripts/start.sh
# Start WA Notion Bot — Docker only, no tunnel needed
# Webhook uses internal Docker network (Evolution API → Orchestrator)
#
# Usage:
#   ./scripts/start.sh           → start semua
#   ./scripts/start.sh stop      → stop semua
#   ./scripts/start.sh status    → cek status
#   ./scripts/start.sh logs      → lihat logs
#   ./scripts/start.sh rebuild   → rebuild orchestrator

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

ORCHESTRATOR_PORT="${ORCHESTRATOR_PORT:-3000}"
EVOLUTION_PORT="${EVOLUTION_PORT:-8080}"

# ─── Colors ─────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

# ─── Stop ──────────────────────────────────────────────
stop_all() {
  echo -e "${YELLOW}[STOP] Stopping Docker containers...${NC}"
  docker compose down 2>/dev/null || true
  echo -e "${GREEN}  All services stopped.${NC}"
}

# ─── Status ────────────────────────────────────────────
show_status() {
  echo -e "${CYAN}===========================================${NC}"
  echo -e "${CYAN}  WA Notion Bot — Status${NC}"
  echo -e "${CYAN}===========================================${NC}"
  echo ""
  echo -e "${CYAN}Docker containers:${NC}"
  docker compose ps 2>/dev/null || echo "  No containers running."
  echo ""

  echo -e "${CYAN}Health check:${NC}"
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

  echo ""
  echo -e "${CYAN}Webhook config:${NC}"
  local INSTANCE="${EVOLUTION_INSTANCE_NAME:-teste}"
  local WH=$(curl -s http://localhost:${EVOLUTION_PORT}/webhook/find/${INSTANCE} \
    -H "apikey: ${EVOLUTION_API_KEY}" 2>/dev/null || echo "")
  if [ -n "$WH" ]; then
    echo "  $WH" | python3 -m json.tool 2>/dev/null || echo "  $WH"
  else
    echo -e "  ${RED}Webhook not configured${NC}"
  fi
}

# ─── Start ─────────────────────────────────────────────
start_all() {
  echo ""
  echo -e "${CYAN}===========================================${NC}"
  echo -e "${CYAN}  WA Notion Bot — Starting...${NC}"
  echo -e "${CYAN}===========================================${NC}"
  echo ""

  # Step 1: Start Docker
  echo -e "${YELLOW}[1/3] Starting Docker containers...${NC}"
  docker compose up -d --build
  echo -e "${GREEN}  Docker containers started.${NC}"

  # Step 2: Wait for Orchestrator
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

  # Step 3: Wait for Evolution API + set webhook
  echo ""
  echo -e "${YELLOW}[3/3] Waiting for Evolution API...${NC}"
  for i in $(seq 1 30); do
    if curl -s http://localhost:${EVOLUTION_PORT}/ > /dev/null 2>&1; then
      echo -e "${GREEN}  Evolution API is up!${NC}"

      # Set webhook ke internal Docker network URL
      local INSTANCE="${EVOLUTION_INSTANCE_NAME:-teste}"
      echo "  Setting webhook (internal: http://wa-orchestrator:3000/webhook/${INSTANCE})..."
      curl -s -X POST "http://localhost:${EVOLUTION_PORT}/webhook/set/${INSTANCE}" \
        -H "Content-Type: application/json" \
        -H "apikey: ${EVOLUTION_API_KEY}" \
        -d "{
          \"enabled\": true,
          \"url\": \"http://wa-orchestrator:3000/webhook/${INSTANCE}\",
          \"webhookByEvents\": false,
          \"events\": [\"MESSAGES_UPSERT\",\"MESSAGES_UPDATE\",\"MESSAGES_DELETE\",\"SEND_MESSAGE\",\"CONNECTION_UPDATE\"]
        }" > /dev/null 2>&1
      echo -e "  ${GREEN}Webhook configured!${NC}"
      break
    fi
    if [ "$i" -eq 30 ]; then
      echo -e "${RED}  Evolution API still starting. Check: docker logs wa-evolution-api${NC}"
    fi
    sleep 5
  done

  # Done
  echo ""
  echo -e "${CYAN}===========================================${NC}"
  echo -e "${GREEN}  All services are running!${NC}"
  echo -e "${CYAN}===========================================${NC}"
  echo ""
  echo "  Orchestrator:  http://localhost:${ORCHESTRATOR_PORT}"
  echo "  Health:        http://localhost:${ORCHESTRATOR_PORT}/health"
  echo "  Evolution API: http://localhost:${EVOLUTION_PORT}"
  echo "  Manager UI:    http://localhost:${EVOLUTION_PORT}/manager"
  echo ""
  echo "  Webhook: internal (Docker network — no tunnel needed)"
  echo ""
  echo "  Commands:"
  echo "    ./scripts/start.sh stop     → stop semua"
  echo "    ./scripts/start.sh status   → cek status"
  echo "    ./scripts/start.sh logs     → lihat logs"
  echo "    ./scripts/start.sh rebuild  → rebuild orchestrator"
  echo ""
}

# ─── Main ──────────────────────────────────────────────
case "${1:-start}" in
  start)
    start_all
    ;;
  stop)
    stop_all
    ;;
  status)
    show_status
    ;;
  logs)
    docker compose logs -f orchestrator
    ;;
  rebuild)
    echo -e "${YELLOW}Rebuilding orchestrator...${NC}"
    docker compose up -d --build orchestrator
    echo -e "${GREEN}Done!${NC}"
    ;;
  *)
    echo "Usage: $0 {start|stop|status|logs|rebuild}"
    ;;
esac

#!/bin/bash
# Deploy script for whatsapp-gateway
# Usage: ./scripts/deploy.sh [message]
#
# Example:
#   ./scripts/deploy.sh              # just pull and rebuild
#   ./scripts/deploy.sh "fix: LID resolution"  # pull, rebuild, with log message

set -e

echo "=========================================="
echo "  WhatsApp Gateway - Deploy Script"
echo "=========================================="

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Optional commit message for deploy log
DEPLOY_MSG="${1:-manual deploy}"

echo ""
echo "[1/5] Pulling latest from main..."
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "  Already up to date ($LOCAL)"
else
  git pull origin main
  echo "  Updated: $LOCAL → $REMOTE"
fi

echo ""
echo "[2/5] Checking TypeScript..."
npx tsc --noEmit
echo "  TypeScript OK"

echo ""
echo "[3/5] Building orchestrator..."
docker compose build orchestrator

echo ""
echo "[4/5] Deploying..."
docker compose up -d orchestrator

echo ""
echo "[5/5] Waiting for health check..."
sleep 3

# Check if container is running
STATUS=$(docker compose ps orchestrator --format "{{.Status}}" 2>/dev/null)
if echo "$STATUS" | grep -q "Up"; then
  echo "  Container: $STATUS"
else
  echo "  WARNING: Container may not be running!"
  docker compose logs orchestrator --tail 20
  exit 1
fi

echo ""
echo "=========================================="
echo "  Deploy complete!"
echo "  Message: $DEPLOY_MSG"
echo "  Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  Commit: $(git rev-parse --short HEAD)"
echo "=========================================="

# Show last few logs
echo ""
echo "Recent logs:"
docker compose logs orchestrator --tail 5

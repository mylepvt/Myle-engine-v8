#!/bin/bash
# Myle vl2 — Local development launch via Docker Compose
# Production deployment: see render.yaml (Render Blueprint) & DEPLOYMENT_GUIDE.md
set -e

echo "=== Myle vl2 Local Dev ==="

if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is required. Install from https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo "ERROR: docker compose plugin required."
    exit 1
fi

MODE=${1:-dev}
echo "Mode: $MODE"

case "$MODE" in
    dev)
        echo "Starting development stack (postgres, redis, crm-api, backend, frontend)..."
        docker compose up --build
        ;;
    test)
        echo "Building and running backend tests..."
        docker compose build backend
        docker compose run --rm backend pytest tests/ -v "$@"
        ;;
    stop)
        echo "Stopping all services..."
        docker compose down
        ;;
    clean)
        echo "Stopping services and removing volumes (⚠ destroys DB data)..."
        docker compose down -v
        ;;
    *)
        echo "Usage: $0 {dev|test|stop|clean}"
        echo ""
        echo "  dev     Start full dev stack (default)"
        echo "  test    Run backend pytest suite"
        echo "  stop    Stop running services"
        echo "  clean   Stop services + delete data volumes"
        echo ""
        echo "  Frontend:       http://localhost:5174"
        echo "  API docs:       http://localhost:8000/docs"
        echo "  CRM API health: http://localhost:4000/health"
        exit 1
        ;;
esac

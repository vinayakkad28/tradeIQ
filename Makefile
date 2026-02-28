.PHONY: dev frontend gateway db reset tidy build check

# ── DEV (start DB + run services locally) ─────────────────
dev:
	@echo "Starting TradeIQ development environment..."
	@cp -n .env.example .env 2>/dev/null || true
	$(MAKE) db
	$(MAKE) -j2 gateway frontend

# ── INDIVIDUAL SERVICES ───────────────────────────────────
frontend:
	cd frontend && npm run dev

gateway:
	cd gateway && go run ./cmd/gateway/main.go

# ── DATABASE ──────────────────────────────────────────────
db:
	docker compose up postgres redis -d

db-stop:
	docker compose stop postgres redis

# ── BUILD ─────────────────────────────────────────────────
build:
	cd gateway && go build -o bin/gateway ./cmd/gateway/main.go
	cd frontend && npm run build

# ── DOCKER FULL STACK ────────────────────────────────────
up:
	docker compose up --build

down:
	docker compose down

# ── GO DEPS ───────────────────────────────────────────────
tidy:
	cd gateway && go mod tidy

# ── TYPE CHECK ───────────────────────────────────────────
check:
	cd gateway && go build ./...
	cd frontend && npx tsc --noEmit
	@echo "✓ All checks passed"

# ── RESET DB ─────────────────────────────────────────────
reset:
	docker compose down -v && docker compose up postgres redis -d

# ── ENV SETUP ────────────────────────────────────────────
env:
	@cp -n .env.example .env && echo "Created .env from .env.example — fill in your API keys" || echo ".env already exists"

# ── HELP ─────────────────────────────────────────────────
help:
	@echo ""
	@echo "TradeIQ Development Commands:"
	@echo "  make env       — Create .env from .env.example"
	@echo "  make db        — Start Postgres + Redis (Docker)"
	@echo "  make gateway   — Run Go API server (localhost:8080)"
	@echo "  make frontend  — Run Next.js dev server (localhost:3000)"
	@echo "  make dev       — Start everything (DB + gateway + frontend)"
	@echo "  make build     — Build gateway binary + Next.js"
	@echo "  make check     — Run Go build + TypeScript checks"
	@echo "  make up        — Full Docker Compose stack"
	@echo "  make reset     — Wipe DB volumes and restart"
	@echo ""
	@echo "Broker OAuth Setup:"
	@echo "  1. Edit .env with your broker API keys"
	@echo "  2. Set APP_BASE_URL and FRONTEND_URL"
	@echo "  3. Add redirect URI to your broker developer app:"
	@echo "     http://localhost:8080/api/v1/brokers/oauth/callback"
	@echo ""

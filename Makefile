.PHONY: dev frontend gateway db reset tidy build

# ── DEV (start DB + run services locally) ─────────────────
dev:
	@echo "Starting TradeIQ development environment..."
	$(MAKE) db &
	$(MAKE) gateway &
	$(MAKE) frontend

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

# ── RESET DB ─────────────────────────────────────────────
reset:
	docker compose down -v && docker compose up postgres redis -d

# ── HELP ─────────────────────────────────────────────────
help:
	@echo ""
	@echo "TradeIQ Development Commands:"
	@echo "  make db        — Start Postgres + Redis (Docker)"
	@echo "  make gateway   — Run Go API server (localhost:8080)"
	@echo "  make frontend  — Run Next.js dev server (localhost:3000)"
	@echo "  make build     — Build gateway binary + Next.js"
	@echo "  make up        — Full Docker Compose stack"
	@echo "  make reset     — Wipe DB volumes and restart"
	@echo ""

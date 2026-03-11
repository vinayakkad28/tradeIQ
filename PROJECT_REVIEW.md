# TradeIQ — Comprehensive Project Review

**Date:** March 11, 2026
**Reviewer Perspective:** Founder / CTO / CEO / Trader / Market Analyst / Research Analyst

---

## Executive Summary

TradeIQ is a **Post-Trade Behavioral Intelligence** platform for Indian retail traders. It analyzes trading behavior, identifies biases (revenge trading, overtrading, SL-moving), and provides actionable insights. The tech stack is solid (Next.js 16 + Go/Gin + PostgreSQL + Redis), the feature set is ambitious, and the domain understanding is strong. However, there are **critical security gaps, zero test coverage, poor mobile UX, and accessibility failures** that must be addressed before scaling.

**Overall Assessment:** Strong concept, good architecture foundation, but not production-ready for paying users without addressing the issues below.

---

## Table of Contents

1. [Architecture & Tech Stack](#1-architecture--tech-stack)
2. [Security — Critical Gaps](#2-security--critical-gaps)
3. [Backend & Data Layer Issues](#3-backend--data-layer-issues)
4. [UI/UX Review](#4-uiux-review)
5. [Mobile Responsiveness](#5-mobile-responsiveness)
6. [Accessibility (a11y)](#6-accessibility-a11y)
7. [Performance Concerns](#7-performance-concerns)
8. [Testing & Quality](#8-testing--quality)
9. [Product & Business Gaps](#9-product--business-gaps)
10. [Prioritized Action Plan](#10-prioritized-action-plan)

---

## 1. Architecture & Tech Stack

### What's Working Well
- **Clean separation**: Frontend (Next.js 16, React 19, TypeScript) / Backend (Go 1.25, Gin, GORM) / Infra (Docker Compose, PostgreSQL 15, Redis 7)
- **App Router** with proper layout nesting and route grouping
- **JWT auth flow** with short-lived access tokens (15m) + long-lived refresh tokens (30d)
- **Multi-broker OAuth** abstraction supporting 5 Indian brokers (Zerodha, Upstox, AngelOne, Fyers, Dhan)
- **Analytics engine** computing 50+ metrics with plan-tiered caching
- **Docker multi-stage builds** for both frontend and backend
- **Railway deployment config** with healthchecks

### Architecture Concerns

| Area | Issue | Severity |
|------|-------|----------|
| Redis configured but unused | Docker Compose provisions Redis but the Go backend never connects to it. Rate limiting, caching, and session management all use in-memory maps instead. | High |
| Monolith coupling | All 12 handler modules share the same binary. Analytics computation (1000+ lines) blocks the HTTP handler thread. | Medium |
| No message queue | Broker sync, report generation, and CSV ingestion all run synchronously in HTTP request handlers. Long-running operations should be async. | Medium |
| No structured logging | Uses `fmt.Println` and Gin's default logger. No JSON structured logging, no request IDs, no correlation for debugging. | Medium |
| No CI/CD pipeline | No `.github/workflows/`, no test automation, no lint checks, no deploy pipeline. | High |

---

## 2. Security — Critical Gaps

### CRITICAL (Must Fix Before Launch)

#### 2.1 Broker Credentials Stored in Plaintext
**File:** `gateway/models/models.go` — BrokerConnection model
```
AccessToken, RefreshToken, FeedToken stored as plain strings in PostgreSQL
```
**Risk:** Database breach exposes all users' broker credentials, enabling unauthorized trades.
**Fix:** Encrypt tokens at rest using AES-256-GCM with a key derived from a separate secrets manager.

#### 2.2 Hardcoded JWT Secret Fallback
**File:** `gateway/pkg/middleware/middleware.go` (lines 34-37)
```go
secret := os.Getenv("JWT_SECRET")
if secret == "" {
    secret = "tradeiq_dev_secret_change_in_production"
}
```
**Risk:** If `JWT_SECRET` env var is unset in production, anyone can forge valid JWTs.
**Fix:** Panic on startup if `JWT_SECRET` is not set. Enforce minimum 64-character length.

#### 2.3 Hardcoded Database Credentials
**File:** `gateway/pkg/database/db.go` (lines 24-26)
```go
getEnv("DB_PASSWORD", "tradeiq_dev")
```
**Risk:** Production database could run with default password if env not configured.
**Fix:** Require DB credentials via env vars with no defaults. Fail fast on startup.

#### 2.4 In-Memory Rate Limiter (Memory Leak)
**File:** `gateway/pkg/middleware/middleware.go` (lines 98-118)
```go
var rateLimitMap = map[string][]time.Time{}
```
**Risk:** This map grows unbounded — every unique IP adds entries that are never garbage collected. Under attack, this causes OOM.
**Fix:** Use Redis-based rate limiting (Redis is already provisioned but unused).

#### 2.5 No Security Headers
**Missing:** HSTS, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options
**Risk:** Clickjacking, MIME sniffing, missing transport security.
**Fix:** Add security header middleware in Gin.

### HIGH (Fix Within 2 Weeks)

| Issue | Details |
|-------|---------|
| **Tokens in localStorage** | XSS attack can steal all tokens. Migrate refresh tokens to HTTP-only secure cookies. |
| **No token blacklist** | Logout only deletes refresh token. Access tokens remain valid for 15 minutes. Use Redis-based blacklist. |
| **Broad CORS wildcard** | `*.vercel.app` allows any Vercel deployment. Restrict to your specific deployment URLs. |
| **WebSocket allows all origins** | `CheckOrigin` returns true for everything. Validate against allowed origins. |
| **No CSV file size limit** | Unbounded uploads can cause DoS. Enforce 10MB max. |
| **No plan expiry check** | PlanGate middleware checks tier but not expiry date. Expired paid plans still grant access. |
| **Zerodha API key in URL** | OAuth redirect URL contains plaintext API key, logged by proxies and browsers. |
| **Auth rate limit too high** | 20 req/min allows 20 password guesses per minute. Reduce to 5 req/min with exponential backoff. |

---

## 3. Backend & Data Layer Issues

### Error Handling
| File | Issue |
|------|-------|
| `auth/handler.go` (line 76-77) | No error check after `db.Create(&user)` — silent failure |
| `auth/handler.go` (line 85-90) | RefreshToken creation not error-checked |
| `trades/handler.go` (line 132) | Unknown trade direction silently defaults to "BUY" (data corruption) |
| `trades/handler.go` (line 45-51) | CSV parsing errors silently skip rows with no user feedback on which rows failed |
| `brokers/handler.go` (line 245) | `http.DefaultClient.Do()` has no timeout — can hang indefinitely |
| `analytics/handler.go` | No nil pointer checks for Trade.PnL, Trade.ExitTime |
| `market/handler.go` (line 107) | NSE retry loop can retry indefinitely |

### Database Performance
| Issue | Impact |
|-------|--------|
| Analytics loads ALL trades into memory | O(n) memory usage, crashes for high-volume traders |
| CSV ingestion: individual INSERT per row | Should use batch INSERT (GORM `CreateInBatches`) |
| No SELECT column limiting | Full model always fetched even when only 2 fields needed |
| Offset-based pagination | Degrades with dataset size. Switch to cursor-based. |
| No database connection pool config | Uses GORM defaults, may exhaust connections under load |
| `sslmode=disable` hardcoded | Database connections unencrypted in transit |

### Missing Backend Features
- No webhook/event system for notifications (notifications model exists but no trigger mechanism)
- No audit trail for sensitive operations (plan changes, broker connects/disconnects)
- No graceful shutdown handling
- No health check for Redis or external dependencies
- No API versioning strategy beyond `/api/v1`

---

## 4. UI/UX Review

### Design Language: Strengths
- **Bloomberg Terminal aesthetic** — Dark theme with monospace fonts (JetBrains Mono), amber accent. Feels professional and appropriate for traders.
- **Consistent card-based layout** — Terminal-style cards across all pages
- **Good information density** — KPI cards pack relevant metrics efficiently
- **Semantic color usage** — Green = profit, Red = loss, Amber = alerts

### UI/UX Problems

#### 4.1 Massive Code Duplication (No Component Library)
Only **1 shared component** exists (`InfoTooltip.tsx`). The following patterns are duplicated across 15+ pages:
- KPI metric cards (repeated in dashboard, performance, behavioral, risk)
- Data tables with terminal styling (journal, trades, performance, risk)
- Chart wrappers (Recharts setup duplicated in 6+ pages)
- Progress bars, badges, status indicators

**Impact:** Any design change requires editing 15+ files. Inconsistencies creep in over time.
**Fix:** Extract 8-10 reusable components: `<KPICard>`, `<DataTable>`, `<ChartWrapper>`, `<Badge>`, `<StatusIndicator>`, `<EmptyState>`, `<LoadingSpinner>`, `<ProgressBar>`

#### 4.2 Inconsistent Styling
- **40+ hardcoded `rgba()` values** in inline styles instead of CSS variables
- **No design tokens** — spacing, font sizes, and opacity values are magic numbers scattered throughout
- **Inconsistent spacing** — `gap: 0.75rem` in some places, `gap: 1rem` in others, no scale
- **Border colors** — CSS variables used in some components, hardcoded in others
- **No disabled state styling** — Buttons use HTML `disabled` but no visual treatment

#### 4.3 Loading & Error States
| State | Current | Should Be |
|-------|---------|-----------|
| Loading | Plain text ("Loading...") | Skeleton screens or spinner animation |
| Error | Generic messages ("Upload failed") | Specific, actionable error messages |
| Empty | Text-only ("No trades yet") | Icon + message + CTA button |
| Success | Text that auto-dismisses in 3s | Toast notification with dismiss button |

#### 4.4 Form Validation
- **Register/Login:** Only JS validation (`password.length < 8`), no HTML5 validation attributes
- **Settings form:** Zero validation — phone number accepts any input, no confirmation before save
- **Tax calculator:** Currency fields accept negative numbers, no decimal restrictions
- **No real-time validation** — Errors only shown after form submission

#### 4.5 Navigation UX
- No breadcrumbs or back navigation (relies entirely on sidebar)
- Free tier users can see locked features (3M, 6M, ALL range buttons) but they're just `cursor: not-allowed` — should use upgrade prompt modal
- OAuth callback uses `window.history.replaceState` which breaks the back button
- No loading indicator during page transitions

---

## 5. Mobile Responsiveness

### Rating: Not Mobile-Ready

**Zero media queries exist in the entire application.** Key issues:

| Component | Problem |
|-----------|---------|
| **Sidebar** | Fixed 220px width, no hamburger menu, no drawer mode. Takes 50%+ of phone screen. |
| **KPI grids** | Dashboard uses `gridTemplateColumns: 'repeat(7, 1fr)'` — 7 columns that never stack |
| **Risk page** | 5-column grid that never collapses |
| **Performance page** | 4-column grid with no breakpoints |
| **Heatmap** | Font size 0.72rem, unreadable on mobile |
| **Journal table** | 8 columns at 0.75rem font, needs horizontal scroll with no scroll indicator |
| **Settings** | Plan cards (3 columns) don't stack |
| **Date range pills** | 7 horizontal pills that overflow on small screens |

### Required Fix
```css
/* Minimum viable mobile support */
@media (max-width: 768px) {
  .sidebar { position: fixed; transform: translateX(-100%); z-index: 50; }
  .sidebar.open { transform: translateX(0); }
  [style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
  .data-table { font-size: 0.65rem; }
}
```

**Business Impact:** Indian retail traders predominantly use mobile phones. Without mobile support, 60-70% of your target market cannot use the product.

---

## 6. Accessibility (a11y)

### Rating: Fails WCAG 2.1 AA

#### Critical Failures
1. **No `<label>` associations** — Form inputs throughout the app lack `htmlFor` connections
2. **No ARIA roles** — Custom toggle switches, dropdowns, and status indicators have no semantic meaning for screen readers
3. **No keyboard navigation** — Toggle switches only respond to mouse clicks, custom dropdowns not tab-navigable
4. **No focus management** — No visible focus rings (outline removed without replacement), no focus trap in modals
5. **Color-only information** — WebSocket status (green/red circle only), sentiment badges, and heatmap cells convey meaning only through color

#### Text Contrast Failures
| Element | Color | Background | Ratio | WCAG AA |
|---------|-------|-----------|-------|---------|
| Secondary text | #8888aa | #0a0a0f | ~4.5:1 | Barely passes |
| Muted text | #4a4a6a | #0a0a0f | ~3:1 | **FAILS** (needs 4.5:1) |

#### Missing
- No `prefers-reduced-motion` support (pulse animation always plays)
- No `prefers-color-scheme` support (dark mode only, no light mode option)
- No skip-to-content link
- No `aria-live` regions for dynamic content updates

---

## 7. Performance Concerns

| Area | Issue | Impact |
|------|-------|--------|
| **Analytics computation** | Loads ALL trades into memory, computes 50+ metrics synchronously in HTTP handler | Slow response for users with 10K+ trades, blocks server thread |
| **No Redis usage** | Redis is provisioned but never connected. Caching uses database table instead. | Unnecessary DB load, slower cache reads |
| **Individual row INSERTs** | CSV import creates one DB record per row instead of batch insert | 1000-trade CSV = 1000 DB round trips |
| **No lazy loading** | All dashboard components load simultaneously | Slow initial page load |
| **No code splitting** | Next.js dynamic imports not utilized | Larger bundle size |
| **Full model fetches** | GORM queries always `SELECT *` instead of selecting needed columns | Wasteful bandwidth and memory |
| **NSE session management** | Single global HTTP session for all users, mutex-locked | Bottleneck under concurrent market data requests |

---

## 8. Testing & Quality

### Rating: Zero Coverage

- **No test files exist** — No `*_test.go` files in backend, no Jest/Vitest config in frontend
- **No CI/CD pipeline** — No GitHub Actions, no GitLab CI, no automated checks
- **No linting** — ESLint configured but no `.eslintrc`, no golangci-lint
- **No E2E tests** — No Playwright, Cypress, or similar
- **Type checking only** — `make check` runs TypeScript compiler and `go build`

### What's Needed (Priority Order)
1. **Backend unit tests** for auth, analytics computation, CSV parsing, and broker OAuth flows
2. **Frontend component tests** for forms, auth flow, and context providers
3. **Integration tests** for the full API → DB flow
4. **E2E tests** for critical paths: register → upload CSV → view insights
5. **CI pipeline** with lint, type check, test, build stages

---

## 9. Product & Business Gaps

### As a Founder/CEO
| Gap | Details |
|-----|---------|
| **No onboarding flow** | New users land on a dashboard with a "Getting Started" card but no guided tour. First-time UX is overwhelming with 12+ sidebar items. |
| **No analytics/telemetry** | No PostHog, Mixpanel, or GA4. You can't measure user engagement, feature adoption, or drop-off points. |
| **No payment integration** | Plan tiers (Free/Trader/Pro) exist but no Razorpay/Stripe integration. Users can't actually upgrade. |
| **No email system** | No password reset, no welcome emails, no weekly report delivery, no re-engagement. |
| **No social proof** | Landing page has no testimonials, user count, or trust indicators. |

### As a Trader/Market Analyst
| Gap | Details |
|-----|---------|
| **No P&L sharing** | Traders want to share daily/weekly P&L on social media. No share card generation. |
| **No trade replay** | Can't visualize how a trade played out with price charts. |
| **No watchlist integration** | No connection between market data page and personal trading patterns. |
| **No alerts for behavioral patterns** | System detects revenge trading but doesn't proactively alert during live trading. |
| **No community features** | Traders are social. No leaderboard, no anonymous comparison, no peer groups. |
| **Tax calculator is client-only** | All tax computation happens in the browser. Should persist and pre-fill from trade data. |

### As a Research Analyst
| Gap | Details |
|-----|---------|
| **No data export** | Can't export analytics, trade history, or reports to CSV/Excel/PDF beyond the weekly report page. |
| **No API documentation** | Settings page mentions "Developer API Keys" but no API docs exist. |
| **No historical benchmarking** | Can't compare personal performance against Nifty/Sensex returns. |
| **No correlation analysis** | No analysis of performance vs market conditions (VIX levels, trend days vs range days). |

---

## 10. Prioritized Action Plan

### P0 — Before Launch (Week 1-2)
1. Encrypt broker credentials at rest (AES-256-GCM)
2. Remove all hardcoded secret fallbacks — fail fast on missing env vars
3. Fix in-memory rate limiter (use Redis or bounded map with TTL cleanup)
4. Add security headers middleware (HSTS, CSP, X-Frame-Options)
5. Add CSV file size limit (10MB)
6. Fix silent error handling in auth and trades handlers
7. Add plan expiry validation to PlanGate middleware
8. Narrow CORS origins (remove `*.vercel.app` wildcard)

### P1 — Production Readiness (Week 3-4)
1. Connect and use Redis for caching and rate limiting
2. Add basic test suite (auth, analytics, CSV parsing — aim for 40% coverage)
3. Set up CI/CD pipeline (GitHub Actions: lint, test, build, deploy)
4. Add structured JSON logging with request IDs
5. Implement batch INSERT for CSV ingestion
6. Add mobile responsive breakpoints (min: sidebar drawer + single-column grids)
7. Migrate refresh tokens to HTTP-only secure cookies
8. Add token blacklist for logout

### P2 — Growth Ready (Month 2)
1. Extract reusable UI component library (8-10 components)
2. Add payment integration (Razorpay)
3. Add email system (transactional + weekly reports)
4. Add analytics/telemetry (PostHog or similar)
5. Implement guided onboarding flow for new users
6. Fix accessibility: labels, ARIA roles, keyboard navigation, contrast
7. Add loading skeletons and proper empty states
8. Implement async job processing for broker sync and report generation

### P3 — Competitive Edge (Month 3-4)
1. Add P&L sharing cards for social media
2. Build trade replay with price chart overlay
3. Add real-time behavioral alerts during trading sessions
4. Implement benchmark comparison (vs Nifty/Sensex)
5. Add comprehensive API documentation
6. Add E2E test suite
7. Performance optimization (cursor pagination, column selection, connection pooling)
8. Full WCAG 2.1 AA accessibility compliance

---

## Summary Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| **Architecture** | 7/10 | Clean separation, good tech choices, but Redis unused and no async processing |
| **Security** | 3/10 | Critical gaps: plaintext credentials, hardcoded secrets, no security headers |
| **Backend Quality** | 5/10 | Good models and routing, but poor error handling and zero tests |
| **Frontend Quality** | 6/10 | Good design aesthetic, but massive duplication and no component library |
| **UI/UX** | 5/10 | Strong information design, but poor loading/error/empty states and forms |
| **Mobile** | 1/10 | Zero media queries, completely unusable on phones |
| **Accessibility** | 2/10 | Fails WCAG AA, no keyboard navigation, no ARIA, contrast failures |
| **Performance** | 4/10 | Analytics loads all data into memory, no Redis caching, individual INSERTs |
| **Testing** | 0/10 | Zero test files, no CI/CD, no linting |
| **Product Completeness** | 6/10 | Core features work, but no payments, no email, no onboarding flow |
| **Overall** | 4/10 | Strong foundation, needs significant hardening before production |

---

*This review was conducted as a comprehensive audit from founder/CTO/trader perspectives. The platform has strong domain expertise and a solid technical foundation — the gaps identified are addressable and prioritized above to guide the roadmap.*

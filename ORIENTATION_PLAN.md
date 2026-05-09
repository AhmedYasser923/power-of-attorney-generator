# Orientation Folder — Execution Guide for Codex

Create a folder `orientation/` at the project root with one Markdown file per feature. Each file is a self-contained briefing that gives an LLM everything it needs to understand and modify that feature: purpose, endpoints, every file involved, data flow, external dependencies, database models, shared services, and key business logic/gotchas.

**How to write each file**: Read every file listed under "Files" for that feature. Don't copy-paste code — summarize what each file does and how they connect. Focus on what a developer needs to know to safely modify the feature. Call out non-obvious behavior, edge cases, and things that would surprise someone reading the code for the first time.

**Use this exact structure for every file:**

```markdown
# [Feature Name]

## Purpose
One paragraph explaining what this feature does from the user's perspective.

## API Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| ... | ... | ... | ... |

## Files
List every file involved in this feature with a one-line description of its role.

### Route
- `path/to/file.js` — what it does

### Controller
- `path/to/file.js` — what it does

### Services
- `path/to/file.js` — what it does

### Other (prompts, schemas, utils, models, views)
- `path/to/file.js` — what it does

## Data Flow
Step-by-step description of how a typical request flows through the system, from HTTP request to response. Name the actual functions and files at each step. For features with multiple endpoints, describe the primary/most complex flow.

## External Dependencies
List external APIs, services, or SDKs this feature calls, with what they're used for.

## Database Models
Which MongoDB models (from `backend/models/`) this feature reads or writes, and what fields matter.

## Shared With
List other features that share the same services or utilities. This helps someone understand blast radius — "if I change X, what else breaks?"

## Key Business Logic & Gotchas
Bullet list of non-obvious rules, edge cases, workarounds, or things that would surprise a reader. These are the things that cause bugs when someone modifies the feature without understanding them.
```

---

## Files to Create

### 1. `orientation/ticket-analyzer.md`

**Feature**: The AI-powered ticket/travel document analyzer. Users upload PDFs or images of flight tickets/boarding passes. Gemini extracts structured flight data, then the server runs deterministic post-processing (EC261 eligibility, PNR validation, claim value estimation, jurisdiction limits, time sanitization).

**Read these files to write the doc:**
- `backend/routes/ticketRoutes.js` — route definitions
- `backend/controllers/ticketController.js` — the main analyzeTicket handler plus thin wrappers for EOC/flight status
- `backend/controllers/aiController.js` — the autofill endpoint (extracts passenger data from pasted text)
- `backend/prompts/ticketAnalysisPrompt.js` — the full Gemini prompt
- `backend/schemas/ticketResponseSchema.js` — the Gemini structured output schema
- `backend/services/ec261Service.js` — deterministic EC261/UK261 eligibility evaluator + PNR validator
- `backend/services/flightStatusService.js` — Cirium API wrapper (shared with tools suite)
- `backend/services/eocService.js` — extraordinary circumstances lookup (shared with tools suite)
- `backend/utils/geminiClient.js` — shared Gemini SDK singleton
- `backend/utils/geminiQueue.js` — semaphore for concurrency control
- `backend/utils/pricing.js` — cost calculation
- `backend/utils/dataLoader.js` — jurisdiction + airline requirement data
- `backend/utils/logUsage.js` — usage logging
- `backend/models/EocRecord.js` — EOC data model
- `backend/models/UsageLog.js` — usage tracking model
- `backend/airports_data.json` — airport coordinates (for Haversine distance calculation)

**Key things to capture:**
- The full pipeline: upload → PDF text extraction or image preprocessing → Gemini call with structured schema → JSON parse → EC261 deterministic overwrite → PNR validation → time sanitization → distance/claim value calculation → jurisdiction limit lookup → response
- The retry logic (3 attempts with backoff)
- EC261 evaluation rules: Rule 1 (EU origin = all eligible), Rule 2 (non-EU origin + non-EU dest = ineligible), Rule 3 (non-EU origin + EU dest = per-leg based on operating carrier)
- PNR-aware grouping: legs are grouped by PNR for EC261 evaluation, but only split when there are no disruptions
- PNR cross-carrier validation: flags when multiple operating carriers share one PNR
- Time field sanitization: strips ISO datetimes, seconds, date contamination from time-only fields
- The inline EU country list bug that was fixed (now uses `isEUCountry()` from ec261Service)
- `yearDirective` — user can supply a fallback year for documents missing year info
- The autofill endpoint (`/api/autofill`) uses a lighter Gemini model for quick text extraction
- Shared services: `flightStatusService` and `eocService` are also used by the tools suite

---

### 2. `orientation/email-builder.md`

**Feature**: Smart email builder for flight compensation claim correspondence. Users select document request templates, add custom notes, and the system generates professional emails in any language. Supports AI-powered translation, section refinement, and reference documents for tone matching.

**Read these files to write the doc:**
- `backend/routes/toolsRoutes.js` — route definitions (the email-related endpoints)
- `backend/controllers/toolsController.js` — all email-related exports: `generateEmail`, `translateEmail`, `refineEmailSection`, template CRUD (`getEmailTemplates`, `createEmailTemplate`, `updateEmailTemplate`, `deleteEmailTemplate`), reference CRUD (`getEmailReferences`, `createEmailReference`, `deleteEmailReference`)
- `backend/utils/startup.js` — `seedEmailTemplates` and `migrateEmailTemplateSchema` (run at app boot)
- `backend/utils/geminiClient.js` — shared Gemini SDK singleton
- `backend/utils/geminiQueue.js` — semaphore
- `backend/utils/pricing.js` — cost calculation
- `backend/utils/logUsage.js` — usage logging
- `backend/models/EmailTemplate.js` — template schema
- `backend/models/EmailReference.js` — reference document schema
- `backend/models/SystemSetting.js` — tracks whether seeding/migration has run
- `backend/data/emailTemplates.json` — default template definitions

**Key things to capture:**
- Template type system: `document-request`, `special-case`, `rejection` — each type is handled differently in email composition
- `combineWithDocuments` flag on special-case templates controls whether they get wrapped with document request bullets or stand alone
- The `[link]` placeholder system — templates containing `[link]` get the upload URL substituted, and the outro paragraph changes based on whether link templates are present
- Custom notes are rewritten by Gemini to match professional tone before being added as bullets
- Reference documents (`EmailReference`, max 3, max 2000 words total) are injected into AI prompts for tone matching
- Translation is a separate Gemini call after English generation
- `logAiUsage` helper aggregates token counts across multiple Gemini results (generation + translation)
- `buildEmailTemplateState` creates an optimized lookup structure with `byKey` map and `linkTemplateKeys` set
- Startup: `seedEmailTemplates` bootstraps from JSON on first run; `migrateEmailTemplateSchema` migrates old `category` field to `type` field (one-time migration)
- Placeholder system: `{amount}`, `{name}` etc. in templates get filled from `placeholderValues`; amount auto-prepends € symbol

---

### 3. `orientation/poa-generator.md`

**Feature**: Generates Power of Attorney PDF documents for flight compensation claims. Three variants: Standard (ReFly), Lufthansa (multi-passenger, with logo), and Aer Lingus (custom fields). All three support AI-powered signature processing — extracting handwritten signatures from photos and cleaning them to black-on-white.

**Read these files to write the doc:**
- `backend/routes/poaRoutes.js` — route definitions
- `backend/controllers/reflyController.js` — standard POA generation
- `backend/controllers/lufthansaController.js` — Lufthansa POA (multi-passenger)
- `backend/controllers/aerlingusController.js` — Aer Lingus POA
- `backend/services/signatureService.js` — shared signature processing engine
- `backend/utils/pdfGenerator.js` — Playwright/Chromium PDF renderer
- `backend/utils/geminiClient.js` — shared Gemini SDK singleton
- `backend/utils/geminiQueue.js` — semaphore
- `backend/utils/pricing.js` — MODEL_PRICING for signature cost calculation
- `backend/utils/logUsage.js` — usage logging
- `backend/models/UsageLog.js` — usage tracking
- `backend/views/assignment-pdf.pug` (and all `assignment-*-pdf.pug` variants) — standard POA templates in ~20 languages
- `backend/views/lufthansa-poa.pug` — Lufthansa template
- `backend/views/aerlingus-poa.pug` — Aer Lingus template
- `backend/public/images/Lufthansa_Logo_2018.svg.png` — embedded in Lufthansa PDF
- `backend/public/images/star-alliance.png` — referenced in Lufthansa Pug template

**Key things to capture:**
- Signature processing has 3 Gemini model tiers (`gemini-easy`, `gemini-medium`, `gemini-hard`) + Cloudinary fallback + raw passthrough (`none`). The prompt asks Gemini to extract the handwriting on white background without redrawing strokes.
- After Gemini returns the image, it's post-processed with Sharp: grayscale → threshold(220) → PNG
- Cloudinary path: resize to 1000px → upload with `background_removal: 'cloudinary_ai'` → fetch processed image
- All three controllers flush HTTP headers before signature processing (`res.flushHeaders()`) to keep Cloud Run's load balancer alive during the long Gemini call
- Lufthansa controller handles up to 4 passengers, processes all signatures in parallel via `Promise.all`
- Lufthansa reads logo from filesystem via `fs.readFileSync` and converts to base64 data URL
- `capitalizeWords` helper in lufthansaController formats passenger names
- Standard POA supports ~20 languages via different Pug templates (selected by `lang` body param)
- PDF generation: `pdfGenerator.js` renders Pug template to HTML string, then uses Playwright to print to PDF buffer
- Cost is calculated per-signature, logged individually for multi-passenger Lufthansa POAs
- When no AI signature processing is used, a free usage log is still created (e.g., `poa_standard`, `poa_lufthansa`)

---

### 4. `orientation/admin-dashboard.md`

**Feature**: Admin panel for user management, usage analytics, cost tracking, and real-time SSE. Admins can approve/suspend users, view per-user and per-operation cost breakdowns, browse detailed logs with pagination, recalculate historical costs when pricing changes, and broadcast reload events to all connected clients.

**Read these files to write the doc:**
- `backend/routes/adminRoutes.js` — route definitions
- `backend/controllers/adminController.js` — all admin exports: `getUsers`, `approveUser`, `suspendUser`, `resumeUser`, `changeUserPassword`, `getUsageInsights`, `getAdminLogs`, `sseStream`, `reloadClients`, `recalculateCosts`
- `backend/middleware/auth.js` — `protect` and `restrictTo('admin')`
- `backend/utils/constants.js` — `OP_LABELS` map and `EGYPT_MS` timezone offset
- `backend/utils/pricing.js` — `MODEL_PRICING` (used by recalculateCosts)
- `backend/models/User.js` — user schema (status: pending/active/suspended, role: user/admin)
- `backend/models/UsageLog.js` — usage log schema (year/month partitioning, operation types)

**Key things to capture:**
- User lifecycle: signup → pending → admin approves → active. Admin can suspend/resume. Cannot suspend other admins.
- SSE stream: clients stored in `app.get('sseClients')` Set. Keepalive comment every 25s to prevent Cloud Run timeout. `reloadClients` broadcasts "reload" event to all connected clients.
- Usage insights uses MongoDB aggregation: per-user totals, per-operation breakdown, monthly trend (last 12 months). All scoped to year+month.
- Logs endpoint supports pagination (`page`, `limit`), optional day filter, returns total cost for the filtered period.
- `recalculateCosts` re-applies current `MODEL_PRICING` to all historical logs — used when Gemini pricing changes. Uses `bulkWrite` for efficiency.
- All timestamps use Egypt timezone (UTC+2, no DST) for year/month partitioning.
- `OP_LABELS` maps operation type codes to human-readable labels for the frontend.
- The SSE endpoint is under `protect` but NOT under `restrictTo('admin')` — all logged-in users can connect (used for version polling and reload notifications).

---

### 5. `orientation/auth-system.md`

**Feature**: JWT cookie-based authentication with sliding session renewal, role-based access control, and admin bootstrapping. Supports signup (creates pending user), login, logout, and session introspection.

**Read these files to write the doc:**
- `backend/routes/authRoutes.js` — route definitions (public + protected)
- `backend/controllers/authController.js` — `apiLogin`, `apiSignup`, `apiLogout`, `apiGetMe`, `logout`, `bootstrapAdmin`, `sendTokenCookie`, `TOKEN_RENEW_AFTER_DAYS`
- `backend/middleware/auth.js` — `protect`, `restrictTo`, `isLoggedIn`
- `backend/models/User.js` — user schema with password hashing, `correctPassword`, `changedPasswordAfter`
- `backend/app.js` — where `bootstrapAdmin` is called at startup

**Key things to capture:**
- JWT stored in httpOnly cookie named `jwt`. Token includes user ID and `iat`.
- Sliding session: `protect` middleware checks token age. If older than `TOKEN_RENEW_AFTER_DAYS` (7 days), it sends a fresh token cookie without requiring re-login.
- `protect` middleware handles API vs HTML routes differently: APIs get 401 JSON, HTML routes redirect to `/login`.
- `protect` reuses `req.user` if `isLoggedIn` already set it (avoids double DB query).
- `isLoggedIn` is a soft check — sets `req.user` if valid token exists, silently continues if not. Currently exported but not mounted as global middleware (protect handles everything).
- User status gates: `pending` → 403 "awaiting approval", `suspended` → 403 "suspended".
- `changedPasswordAfter(jwtTimestamp)` invalidates tokens issued before a password change.
- `bootstrapAdmin` runs once at startup: creates admin user from `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` env vars if no admin exists.
- Password hashing: bcrypt pre-save hook on User model, cost factor in the model itself.
- Signup creates users with `status: 'pending'` — they can't access anything until admin approves.

---

### 6. `orientation/tools-suite.md`

**Feature**: Collection of standalone lookup and search tools used by the claims team. Includes airport search, airline search, IATA/ICAO lookup, airline document requirement checker, Cirium flight status checker, EOC (extraordinary circumstances) lookup, and EOC sync from Google Sheets.

**Read these files to write the doc:**
- `backend/routes/toolsRoutes.js` — route definitions
- `backend/controllers/toolsController.js` — exports: `searchAirports`, `searchAirlines`, `lookupIATA`, `checkDocs`, `checkFlightStatus`, `checkEOC`, `syncEOC`
- `backend/services/flightStatusService.js` — Cirium API wrapper
- `backend/services/eocService.js` — EOC database query logic
- `backend/utils/dataLoader.js` — loads and caches `jurisdiction_data.json`, `airline_docs_data.json`, `airlines_data.json`. Exports `jurisdictionData`, `getJurisdictionLimit`, `getJurisdictionYears`, `getAirlineReqs`.
- `backend/utils/syncEoc.js` — Google Sheets → MongoDB sync for EOC records
- `backend/models/EocRecord.js` — EOC record schema (date, location, category, details)
- `backend/airports_data.json` — airport database (IATA, city, name, lat/lon)
- `backend/airlines_codes.json` — airline database (name, IATA, ICAO, country, active flag)

**Key things to capture:**
- Airport/airline search uses tiered matching: exact → startsWith → includes, capped at 8 results. Airport search matches on IATA, city, name.
- `lookupIATA` additionally separates active vs inactive airlines and prioritizes active matches.
- `checkDocs` normalizes airline names (NFD + strip diacritics) before matching against the airline codes database, then looks up document requirements via `getAirlineReqs`.
- Flight status: `flightStatusService.getFlightStatus` calls Cirium's FlightStats API. It does multi-level flight matching (origin+dest+date → dest+date → date only). Prioritizes disrupted statuses (Diverted > Cancelled > Landed > Active > Scheduled). Detects combined diversion+cancellation. Builds a rich `aiStats` object with banner colors, delay info, timezone offsets, operator name resolution from appendix data.
- EOC: `eocService.findEOCEvents` queries MongoDB with case-insensitive regex matching against IATA codes, country names, and "world wide". Runs two parallel queries: exact date match (non-ongoing) and date <= flight date (ongoing events).
- EOC sync: `syncEocFromSheet` fetches a public Google Sheet CSV, parses it, and upserts all records to MongoDB. Returns delta count.
- `dataLoader.js` caches all JSON at module load time — changes to the JSON files require a server restart.
- `jurisdictionLimitsForClient` is a precomputed flat map sent to the frontend for claim expiration UI.
- Shared services: `flightStatusService` and `eocService` are also called by the ticket analyzer (via `ticketRoutes`).

---

### 7. `orientation/user-dashboard.md`

**Feature**: User-facing dashboard showing their own usage statistics and operation logs.

**Read these files to write the doc:**
- `backend/routes/userRoutes.js` — route definitions
- `backend/controllers/userController.js` — `getMyUsage`, `getUserLogs`
- `backend/utils/constants.js` — `OP_LABELS`, `EGYPT_MS`
- `backend/models/UsageLog.js` — usage log schema

**Key things to capture:**
- `getMyUsage` aggregates the current user's usage for the current Egypt-timezone month: total cost, operation count, per-operation breakdown.
- `getUserLogs` returns paginated operation history for the current user.
- Both endpoints filter by `req.user._id` — users can only see their own data.
- Uses Egypt timezone (UTC+2) for month boundaries, same as admin dashboard.
- `OP_LABELS` maps operation codes to display names.

---

### 8. `orientation/infrastructure.md`

**Feature**: Shared infrastructure, configuration, and cross-cutting concerns that every feature depends on. This is not a user-facing feature — it's the plumbing.

**Read these files to write the doc:**
- `backend/app.js` — Express setup, middleware stack, static serving, SPA catch-all, server config, MongoDB connection, startup tasks
- `backend/utils/geminiClient.js` — singleton GoogleGenerativeAI instance
- `backend/utils/geminiQueue.js` — Semaphore class (max 5 concurrent), `isQuotaError` helper
- `backend/utils/appError.js` — custom error class with `statusCode` and `isOperational` flag
- `backend/utils/catchAsync.js` — async handler wrapper
- `backend/utils/logUsage.js` — fire-and-forget usage logging
- `backend/utils/pricing.js` — `MODEL_PRICING` map and `calculateCost` function
- `backend/utils/constants.js` — `OP_LABELS` and `EGYPT_MS`
- `backend/utils/pdfGenerator.js` — Pug → HTML → Playwright → PDF buffer
- `backend/utils/dataLoader.js` — JSON data caching
- `backend/utils/startup.js` — email template seeding and schema migration
- `backend/controllers/errorController.js` — global error handler (dev vs prod, API vs HTML)
- `backend/middleware/auth.js` — JWT auth middleware
- `backend/models/SystemSetting.js` — key-value store for system flags

**Key things to capture:**
- `app.js` starts the server BEFORE connecting to MongoDB (so Cloud Run health checks pass immediately)
- `server.timeout = 0` — all request timeouts disabled to allow long Gemini calls. This applies globally, not per-route.
- SPA catch-all uses `fs.existsSync(reactIndex)` on every non-API GET request (synchronous file check in hot path)
- Static file serving: `backend/public/` first, then `client/dist/` (without index)
- `trust proxy` is enabled for correct IP detection behind Cloud Run's load balancer
- Rate limiting only on `/login` (10 per 15 min per IP)
- Gemini queue: Semaphore(5) limits concurrent Gemini calls per Cloud Run instance. `isQuotaError` checks for 429/RESOURCE_EXHAUSTED.
- `catchAsync` wraps async route handlers to forward rejected promises to Express error handler via `next(err)`
- `appError.js`: `isOperational = true` means expected errors (user input, auth); non-operational = programming bugs (full stack trace in dev, generic message in prod)
- `pdfGenerator.js` launches a Playwright Chromium browser, renders Pug template to HTML, then prints to PDF with specific margins/format. Browser instance is reused across requests.
- DNS is hardcoded to Cloudflare (1.1.1.1) and Google (8.8.8.8) in `app.js` line 9 — overrides system DNS
- `unhandledRejection` handler logs but does NOT exit (unlike `uncaughtException` which does) — to avoid killing in-flight requests on Cloud Run
- `logUsage` is fire-and-forget: never throws, never blocks the main request. Uses Egypt timezone for year/month partitioning.
- `calculateCost` handles thinking tokens (billed at output rate)

---

## Verification

After creating all 8 files, verify:
1. Every backend source file (controllers, services, routes, utils, models, middleware, prompts, schemas) appears in at least one orientation doc
2. No file paths are wrong (check they actually exist)
3. Every API endpoint from `backend/routes/*.js` appears in at least one endpoint table

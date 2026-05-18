# Refly Claims Operations Platform

An internal operations platform that automates EC261 claims work: ticket analysis, document generation, passenger correspondence, and team analytics.

## What this is

EC261 claims work has a lot of repeated operational judgment: reading messy tickets and boarding passes, identifying passenger groups and PNRs, checking eligibility, preparing claim documents, writing passenger emails, and verifying flight disruption data. The old workflow depended on a bare-minimum desktop app plus manual checks across spreadsheets, airline rules, trackers, and compensation logic.

This platform replaces or augments those manual steps with a protected web workspace. It started as a Power of Attorney generator, then grew into a wider claims operations tool: ticket analysis, multilingual correspondence, barcode recovery, document checks, extraordinary-circumstances (EOC) screening, flight-status lookup, usage logging, and admin oversight.

It is an internal/personal tool, not commercial software. The point is practical operations automation: take the repetitive parts of claims work, encode the parts that must be deterministic, and use AI only where extraction, rewriting, or translation actually helps.

## Features

### POA Generator

Generates PDF Power of Attorney documents for standard Refly, Lufthansa, and Aer Lingus formats through protected `/api/poa/*` endpoints. The standard Refly flow uses language-specific Pug templates; the repository currently contains 20 standard assignment templates, while Lufthansa and Aer Lingus use dedicated airline-specific templates.

The Lufthansa flow supports up to four passengers and processes uploaded signatures in parallel. Signature handling supports raw passthrough, Cloudinary background removal, or Gemini image cleanup; Gemini signature calls are cost-logged, while no-AI generation is recorded as a free POA operation.

### Ticket Analyzer

Accepts uploaded tickets, boarding passes, PDFs, and images, then uses Gemini with a structured response schema to extract passengers, tickets, routes, PNRs, dates, flight numbers, and operating/marketing carrier details. Digital PDFs are text-extracted first with `pdf.js-extract`; scanned PDFs and images are sent as inline document/image data after image resizing/compression.

Gemini is not trusted for legal conclusions. The backend recalculates EC261/UK261 eligibility, PNR grouping, distance, claim value, jurisdiction expiry metadata, and claim-document requirements before returning results.

### Email Builder

Builds passenger correspondence from saved templates, placeholders, optional custom notes, and saved tone/style references. Template types separate document requests, special cases, and rejections; document-request bullets can be combined with special-case bullets and get an AI-drafted outro that reflects only the actions actually requested.

AI is used for custom-note rewriting, "click here" bullet merging, translation, and inline paragraph refinement. The React preview keeps English as the baseline, supports post-generation language switching with a translation cache, and lets users refine individual paragraphs without regenerating the whole email.

### Barcode Decoder

Decodes pasted or uploaded boarding-pass barcode images through a Node controller that writes a temp image and calls a Python child process. The Python script uses OpenCV preprocessing, region detection, rotations, perspective crops, and `zxing-cpp` to recover PDF417, Aztec, QR, DataMatrix, Code 128, and other barcode formats.

The script also validates and partially parses BCBP-style boarding pass strings for confidence scoring, but the UI focuses on exposing the raw decoded barcode string and recovery confidence. Successful attempts are logged as zero-cost `barcode_decode` operations.

### Admin Dashboard

Admin routes manage users, approve pending signups, suspend/resume accounts, change passwords, review usage analytics, inspect operation logs, broadcast reload events through admin-restricted SSE, and recalculate historical costs after pricing changes. Usage views are partitioned by Egypt-time month/day and include user totals, operation breakdowns, logs, and monthly trends.

The backend keeps raw usage records intact, while display endpoints group Email Builder operations for readability. The SSE stream sends keepalive comments to survive proxy/load-balancer idle timeouts.

### User Dashboard

Authenticated users can view their own monthly usage breakdown, daily operation count/cost, and paginated operation history. User dashboard queries are always filtered by `req.user._id`, so personal usage visibility does not expose other users' data.

### Tools Suite

The tools page includes airport search, airline search, IATA/ICAO lookup, airline document requirement checks, jurisdiction lookup, a standalone EC261 compensation calculator, Cirium flight-status lookup, EOC scanning, and external tracker URL builders. EOC records are stored in MongoDB and can be synced from a Google Sheet export.

Airline and airport lookups are backed by local JSON datasets. Tracker override data comes from `trackerSearchCodes` entries in `airlines_codes.json`, allowing specific airlines to use different codes for AirportInfo, FlightStats, or Flightera when their IATA code does not resolve reliably.

### Auth System

Authentication uses an httpOnly JWT cookie with protected routes, role checks, sliding renewal after seven days, and invalidation after password changes. Signup creates pending users who cannot access tools until an admin approves them.

The app also includes admin bootstrapping from environment variables, login/signup/API rate limits, CSRF origin checks for state-changing requests, Mongo query sanitization, and upload validation by content signature rather than filename alone.

## Architecture & design decisions

- **EC261 is recalculated on the server.** Gemini extracts facts, but legal eligibility is determined by deterministic backend logic — compensation decisions can't be left to model output.
- **The ticket prompt is intentionally rule-heavy.** It handles real ticket edge cases: codeshares, unknown stopovers, embedded PNRs, separate operating-carrier PNRs, partial dates, reroutes, missed connections, and multi-document duplicate evidence.
- **Claim-document enrichment is post-AI.** `dataLoader.js` owns airline document rules and context-aware airline matching, so adding document metadata does not require changing the Gemini schema.
- **Gemini calls are queued per instance.** A small in-process semaphore limits concurrent AI requests, retries ticket analysis with backoff, and converts quota errors into user-facing 503 responses.
- **Usage logging never blocks the main workflow.** `logUsage` is fire-and-forget; a failed analytics write should not break a generated PDF, analyzed ticket, or completed email.
- **Cost tracking includes thinking tokens.** `pricing.js` bills Gemini `thoughtsTokenCount` at output-token rate and supports historical recalculation when model pricing changes.
- **Long PDF/signature requests are Cloud Run-aware.** POA controllers flush response headers before signature processing, and server timeouts are extended for slow Gemini/image/PDF work.
- **Email Builder grouping is read-time only.** Raw `UsageLog.operationType` values stay unchanged for audit, while admin/user views collapse translation/refinement rows into one Email Builder category.
- **Month/day reporting is Egypt-time aware.** Usage logs store Egypt-local year/month partitions, and day filters convert Egypt dates back to UTC ranges for MongoDB queries.
- **Uploads are checked before processing.** Ticket and signature middleware validates magic bytes, image dimensions, and PDF page counts before Sharp, PDF extraction, or Gemini sees the file.

## Tech stack

| Area | Details |
| --- | --- |
| Backend | Node.js, Express 5.2, CommonJS, Mongoose 9.4, MongoDB |
| Frontend | React 19, React Router 7, Vite 7, modular page/component CSS |
| AI/ML | Google Gemini SDK, Gemini text/image models, structured JSON schemas, usage/cost accounting |
| Document/PDF | Pug templates, Playwright Chromium 1.58, `pdf.js-extract`, Sharp |
| Barcode | Python, OpenCV headless, NumPy, `zxing-cpp`, Node `child_process.execFile` |
| Integrations | Cirium FlightStats API, Cloudinary background removal, Google Sheets XLSX export |
| Infrastructure | Docker multi-stage build, Playwright base image, Cloud Run-oriented timeouts/versioning |
| Security/ops | httpOnly JWT cookies, bcrypt, Helmet, CORS allowlist, CSRF origin checks, rate limiting, upload validation |

## Project structure

```text
backend/                 Express app, API routes, models, services, views, and shared backend utilities.
backend/controllers/     Request handlers for auth, POA, tickets, tools, admin, user usage, barcode, and errors.
backend/services/        Shared business services for EC261 logic, EOC lookup, Cirium status, and signatures.
backend/routes/          Protected/public route modules mounted from the root router.
backend/models/          Mongoose models for users, usage logs, templates, references, EOC records, and settings.
backend/prompts/         Gemini prompt builders, currently focused on ticket analysis.
backend/schemas/         Gemini structured response schemas.
backend/utils/           Pricing, logging, data loading, PDF generation, Gemini queue/client, startup migration, and helpers.
backend/middleware/      Auth, CSRF, request IDs, rate limits, upload validation, and Mongo sanitization.
backend/views/           Pug templates used to render POA PDFs.
backend/scripts/         Python barcode decoder and runtime requirements.
client/                  React workspace with API clients, app shell, dashboards, and tool pages.
scripts/                 Data-build scripts for airports, airlines, and EOC records from spreadsheets/source data.
orientation/             Feature notes used to understand the implemented system.
plans/                   Historical implementation/security/refactor plans.
```

## Status & context

This is a personal/internal operations tool currently running as a demo and portfolio showcase. It was trialed for team use during development and remains live as a working demonstration of the approach.

## About the author

Built by Ahmed Yasser, a Claims Specialist who taught himself the MERN stack to automate claims workflows he was handling by hand. He builds tools to make the work he does every day faster and less error-prone: noticing the repetitive parts, encoding the rules, and shipping the result.

LinkedIn: <https://www.linkedin.com/in/ahmed-yasser-408635309/>

**A note on how this was built.** I built this platform in close collaboration with AI coding assistants — primarily Claude (Anthropic) as a design and reasoning partner, and Codex (OpenAI) for in-editor code generation. I owned the architecture, the domain logic, the prompt engineering, and every decision about what the system should and shouldn't do — the EC261 rules, the multi-carrier PNR edge cases, the choice to keep legal eligibility deterministic, and the operational priorities are mine. The AI tools accelerated implementation. I think this is roughly how a lot of engineering work will be done going forward, and I'd rather be transparent about it than pretend otherwise.

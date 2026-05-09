# Backend Refactor Plan — Execution Guide for Codex

This is a step-by-step refactoring plan for `backend/`. **Every step must preserve existing behavior.** Do not rename API paths, request/response shapes, model fields, or frontend-facing JSON keys. Run `node backend/app.js` after each phase to smoke-test startup.

---

## PHASE 0 — Cleanup (do first)

### 0a. Delete dead exports

- `backend/controllers/toolsController.js` — delete `exports.proxyPage` (lines 286–332) and the `PROXY_ALLOWED_HOSTS` constant (line 286). It is never routed.
- `backend/controllers/adminController.js` — delete `exports.getMonthDetail` (lines 112–125). It is never routed.
- `backend/controllers/ticketController.js` — delete `exports.renderAnalyzer` (lines 391–393). It is never routed.
- `backend/controllers/reflyController.js` — delete `exports.showForm` (lines 73–75). It is never routed.

### 0b. Delete root `public/` directory

The directory `public/` at the project root is a stale copy of `backend/public/`. The JS files inside (`admin-dashboard.js`, `poa-form.js`, `ticket-analyzer.js`, `tools.js`, `user-dashboard.js`) are from the old pre-React server-rendered UI and are never loaded. The images are duplicates of `backend/public/images/`. Delete the entire root `public/` folder.

### 0c. Clean `backend/public/`

Only 2 files in `backend/public/` are actually used:
- `images/Lufthansa_Logo_2018.svg.png` — read by `lufthansaController.js:21` via `fs.readFileSync`
- `images/star-alliance.png` — referenced in `views/lufthansa-poa.pug:284`

The following are dead and can be deleted:
- `css/style.css`
- `images/aer-lingus.png`
- `images/image-removebg-preview.png`
- `images/refly-logo.png` (React app imports its own copy from `client/src/assets/`)
- `images/Screenshot_1.png`

After deletion, remove the empty `css/` directory.

### 0d. Fix duplicate EC261 country list

In `backend/controllers/ticketController.js`, there is a full `EC261_EU_COUNTRIES` Set (line 147) AND a shorter inline `eu` array at line ~767 used for claim value calculation. The inline array is missing overseas territories. Replace the inline array with a reference to `EC261_EU_COUNTRIES`, using its `.has()` method.

The inline code around line 767-769 looks like:
```js
const eu = ['austria','belgium',...];
const isIntra = eu.includes((leg.originCountry||'').toLowerCase().trim()) && eu.includes((leg.destinationCountry||'').toLowerCase().trim());
```
Change to:
```js
const isIntra = isEUCountry(leg.originCountry) && isEUCountry(leg.destinationCountry);
```
`isEUCountry` is already defined at line 160 in the same file.

### 0e. Standardize cost calculation

In `backend/controllers/toolsController.js`, the `logAiUsage` function (line 681) manually computes cost and ignores thinking tokens. Replace its cost calculation with `calculateCost` from `../utils/pricing.js`.

Before:
```js
const { MODEL_PRICING } = require('../utils/pricing');
const rates = MODEL_PRICING['gemini-2.5-flash'];
const costUSD = (iTok / 1_000_000) * rates.input + ((oTok + tTok) / 1_000_000) * rates.output;
```

After: import `calculateCost` at the top and use it:
```js
const { calculateCost } = require('../utils/pricing');
// ... inside logAiUsage:
const costUSD = calculateCost('gemini-2.5-flash', {
  promptTokenCount: iTok,
  candidatesTokenCount: oTok,
  thoughtsTokenCount: tTok,
}).costUSD;
```

### 0f. Fix Egypt timezone constant duplication

In `backend/utils/logUsage.js` line 22, replace the hardcoded `2 * 60 * 60 * 1000` with:
```js
const { EGYPT_MS } = require('./constants');
```
This constant already exists in `utils/constants.js:14`.

---

## PHASE 1 — Extract shared infrastructure

### 1a. Create `backend/utils/geminiClient.js`

Currently `new GoogleGenerativeAI(process.env.GEMINI_API_KEY)` is instantiated 6 times across:
- `controllers/toolsController.js`
- `controllers/ticketController.js`
- `controllers/reflyController.js`
- `controllers/lufthansaController.js`
- `controllers/aerlingusController.js`
- `controllers/aiController.js`

Create a singleton:

```js
'use strict';
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
module.exports = genAI;
```

Then in each controller, replace:
```js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
```
with:
```js
const genAI = require('../utils/geminiClient');
```

Keep `const { SchemaType } = require('@google/generative-ai');` in ticketController.js since it needs the SchemaType import.

### 1b. Create `backend/utils/startup.js`

Move `seedEmailTemplates` and `migrateEmailTemplateSchema` out of `toolsController.js` into a new file `utils/startup.js`. These are database migration concerns, not controller behavior.

```js
'use strict';
// ... move the functions and their helpers (buildDefaultEmailTemplateDocs, etc.) here
// Exports: seedEmailTemplates, migrateEmailTemplateSchema
```

Then in `app.js` (lines 98-100), change:
```js
const toolsController = require('./controllers/toolsController');
await toolsController.seedEmailTemplates();
await toolsController.migrateEmailTemplateSchema();
```
to:
```js
const startup = require('./utils/startup');
await startup.seedEmailTemplates();
await startup.migrateEmailTemplateSchema();
```

The functions that need to move from toolsController.js:
- `buildDefaultEmailTemplateDocs` (lines 25–53)
- `buildEmailTemplateState` (lines 59–86) — BUT this is also used by `generateEmail`. Keep it in toolsController OR extract to a shared module. Safest: keep `buildEmailTemplateState`, `getEmailTemplateState`, `getEmailTemplateList` in toolsController, move only the two startup functions + `buildDefaultEmailTemplateDocs`.
- `seedEmailTemplates` (lines 102–137)
- `migrateEmailTemplateSchema` (lines 139–171)
- Constants: `EMAIL_TEMPLATES_INIT_KEY`, `EMAIL_TEMPLATES_MIGRATED_KEY`

These functions depend on: `EmailTemplate` model, `SystemSetting` model, `../data/emailTemplates.json`.

---

## PHASE 2 — Split routes

Create these route files. `routes/index.js` should only mount them and apply shared middleware.

### 2a. Create `backend/routes/authRoutes.js`

```js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Public
router.get('/logout', authController.logout);
router.post('/api/auth/login', authController.apiLogin);
router.post('/api/auth/signup', authController.apiSignup);

// Protected
router.get('/api/auth/me', protect, authController.apiGetMe);
router.post('/api/auth/logout', protect, authController.apiLogout);

module.exports = router;
```

### 2b. Create `backend/routes/userRoutes.js`

```js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/api/me/usage', userController.getMyUsage);
router.get('/api/me/logs', userController.getUserLogs);

module.exports = router;
```

### 2c. Create `backend/routes/adminRoutes.js`

```js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/auth');

router.use(protect);

// SSE (all logged-in users)
router.get('/api/sse/events', adminController.sseStream);

// Admin-only
router.get('/admin/users',                restrictTo('admin'), adminController.getUsers);
router.patch('/admin/users/:id/approve',  restrictTo('admin'), adminController.approveUser);
router.patch('/admin/users/:id/suspend',  restrictTo('admin'), adminController.suspendUser);
router.patch('/admin/users/:id/resume',   restrictTo('admin'), adminController.resumeUser);
router.patch('/admin/users/:id/password', restrictTo('admin'), adminController.changeUserPassword);
router.get('/admin/usage',                restrictTo('admin'), adminController.getUsageInsights);
router.get('/admin/logs',                 restrictTo('admin'), adminController.getAdminLogs);
router.post('/admin/reload-clients',      restrictTo('admin'), adminController.reloadClients);
router.post('/admin/recalculate-costs',   restrictTo('admin'), adminController.recalculateCosts);

module.exports = router;
```

### 2d. Create `backend/routes/toolsRoutes.js`

```js
const express = require('express');
const router = express.Router();
const toolsController = require('../controllers/toolsController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/api/tools/flight-status',   toolsController.checkFlightStatus);
router.get('/api/tools/check-eoc',       toolsController.checkEOC);
router.get('/api/tools/search-airports', toolsController.searchAirports);
router.get('/api/tools/check-docs',      toolsController.checkDocs);
router.get('/api/tools/search-airlines', toolsController.searchAirlines);
router.get('/api/tools/lookup-iata',     toolsController.lookupIATA);
router.post('/api/tools/generate-email',          toolsController.generateEmail);
router.post('/api/tools/translate-email',         toolsController.translateEmail);
router.post('/api/tools/refine-email-section',    toolsController.refineEmailSection);
router.get('/api/tools/email-templates',           toolsController.getEmailTemplates);
router.post('/api/tools/email-templates',          toolsController.createEmailTemplate);
router.put('/api/tools/email-templates',           toolsController.updateEmailTemplate);
router.delete('/api/tools/email-templates/:key',   toolsController.deleteEmailTemplate);
router.get('/api/tools/email-references',          toolsController.getEmailReferences);
router.post('/api/tools/email-references',         toolsController.createEmailReference);
router.delete('/api/tools/email-references/:id',   toolsController.deleteEmailReference);
router.post('/api/tools/sync-eoc',                 toolsController.syncEOC);

module.exports = router;
```

### 2e. Create `backend/routes/poaRoutes.js`

```js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const reflyController = require('../controllers/reflyController');
const lufthansaController = require('../controllers/lufthansaController');
const aerlingusController = require('../controllers/aerlingusController');
const { protect } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.post('/api/poa/generate-standard',  upload.any(), reflyController.generateStandardPDF);
router.post('/api/poa/generate-lufthansa', upload.any(), lufthansaController.generateLufthansaPDF);
router.post('/api/poa/generate-aerlingus', upload.any(), aerlingusController.generateAerLingusPDF);

module.exports = router;
```

### 2f. Create `backend/routes/ticketRoutes.js`

```js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const aiController = require('../controllers/aiController');
const { protect } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

router.use(protect);

router.get('/api/flight-status',  ticketController.checkFlightStatus);
router.get('/api/check-eoc',      ticketController.checkEOC);
router.post('/api/autofill',      aiController.extractData);
router.post('/api/analyze-ticket', upload.any(), ticketController.analyzeTicket);

module.exports = router;
```

### 2g. Rewrite `backend/routes/index.js`

```js
const express = require('express');
const router = express.Router();

// Lightweight version check — clients poll this to detect deploys
router.get('/api/version', (req, res) => {
  res.json({ version: req.app.get('appVersion') });
});

router.use('/', require('./authRoutes'));
router.use('/', require('./userRoutes'));
router.use('/', require('./adminRoutes'));
router.use('/', require('./toolsRoutes'));
router.use('/', require('./poaRoutes'));
router.use('/', require('./ticketRoutes'));

module.exports = router;
```

**CRITICAL**: All URL paths must remain identical. The `protect` middleware that was previously applied as `router.use(protect)` globally is now applied per-route-file. The public auth routes (login, signup, GET /logout) must NOT have protect applied.

---

## PHASE 3 — Extract signature service

### 3a. Create `backend/services/signatureService.js`

Extract the duplicated `processSignature` function and its dependencies from all 3 POA controllers. The function is byte-for-byte identical across `reflyController.js`, `lufthansaController.js`, and `aerlingusController.js`.

```js
'use strict';
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');
const genAI = require('../utils/geminiClient');
const { geminiQueue } = require('../utils/geminiQueue');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const SIG_MODELS = {
  'gemini-easy':   'gemini-2.5-flash-image',
  'gemini-medium': 'gemini-3.1-flash-image-preview',
  'gemini-hard':   'gemini-3-pro-image-preview',
};

async function processSignature(file, processingMethod) {
  // ... exact same function body from reflyController.js lines 31-71
}

module.exports = { processSignature, SIG_MODELS };
```

Then in each POA controller:
- Remove `processSignature` function
- Remove `SIG_MODELS` constant
- Remove `const genAI = ...`, `cloudinary.config(...)`, `const sharp = require('sharp')`
- Remove `const { geminiQueue } = require(...)` (only if no other usage in the file)
- Add: `const { processSignature } = require('../services/signatureService');`

Keep everything else in each controller unchanged — they still parse their own form data, build their own PDF data, and handle their own logging.

---

## PHASE 4 — Extract flight status and EOC services

### 4a. Create `backend/services/flightStatusService.js`

The flight status logic is duplicated between `toolsController.checkFlightStatus` (lines 410–591, verbose version) and `ticketController.checkFlightStatus` (lines 894–941, compressed version). They produce the same response shape.

Extract the verbose version from toolsController into the service. Both controllers then call it.

```js
'use strict';
// Move the full checkFlightStatus logic here.
// Export a function: async function getFlightStatus({ flightNumber, date, origin, destination })
// Returns the { aiStats, rawResponse } object (or { error } on failure).
// The controllers become thin wrappers: call getFlightStatus, then res.json() the result.
```

### 4b. Create `backend/services/eocService.js`

`checkEOC` is copy-pasted identically in both `toolsController` (lines 338–375) and `ticketController` (lines 852–889).

```js
'use strict';
const EocRecord = require('../models/EocRecord');

async function findEOCEvents({ date, originIata, destIata, originCountry, destCountry }) {
  // ... exact logic from toolsController.checkEOC
  // Return { eocFound, events }
}

module.exports = { findEOCEvents };
```

Both controllers then become:
```js
exports.checkEOC = async (req, res, next) => {
  try {
    const result = await eocService.findEOCEvents(req.query);
    res.json(result);
  } catch (error) { next(error); }
};
```

---

## PHASE 5 — Extract ticket analysis prompt and schema

### 5a. Create `backend/prompts/ticketAnalysisPrompt.js`

Move the ~130-line prompt string from `ticketController.analyzeTicket` (the `rawPrompt` variable, lines 417–613) into its own file.

```js
'use strict';
function buildTicketAnalysisPrompt(yearDirective) {
  return `You are an expert aviation data extractor...${yearDirective}...`;
}
module.exports = { buildTicketAnalysisPrompt };
```

### 5b. Create `backend/schemas/ticketResponseSchema.js`

Move `TICKET_RESPONSE_SCHEMA` (lines 28–140 of ticketController.js) into its own file.

```js
'use strict';
const { SchemaType } = require('@google/generative-ai');
const TICKET_RESPONSE_SCHEMA = { ... };
module.exports = TICKET_RESPONSE_SCHEMA;
```

### 5c. Create `backend/services/ec261Service.js`

Move from `ticketController.js`:
- `EC261_EU_COUNTRIES` Set (line 147)
- `isEUCountry` function (line 160)
- `isValidPnr` function (line 167)
- `DISRUPTION_STATUSES` array (line 173)
- `hasDisruptionStatus` function (line 178)
- `evaluateLegsEC261` function (lines 184–243)
- `evaluateEC261Deterministic` function (lines 249–332)
- `validateAndCorrectPNRs` function (lines 338–386)

Export: `{ isEUCountry, evaluateEC261Deterministic, validateAndCorrectPNRs }`

ticketController imports them and calls them the same way.

---

## PHASE 6 — What NOT to do

- Do NOT rename any API endpoints
- Do NOT change request/response JSON shapes
- Do NOT rename database model fields or collection names
- Do NOT merge the 3 POA controllers into one — they have different form-parsing logic
- Do NOT add new npm dependencies
- Do NOT add tests in this PR (separate follow-up)
- Do NOT modify frontend/client code
- Do NOT touch `backend/models/`, `backend/views/`, or `backend/middleware/auth.js`
- Do NOT restructure the `backend/utils/` directory beyond what is specified above

---

## Verification checklist

After each phase:
1. `node backend/app.js` starts without errors
2. MongoDB connects and startup tasks run
3. No `require()` errors (missing modules, circular dependencies)

After all phases:
1. All API endpoints return the same responses as before
2. PDF generation works (standard, Lufthansa, Aer Lingus)
3. Ticket analysis works
4. Email generation works
5. Admin dashboard works

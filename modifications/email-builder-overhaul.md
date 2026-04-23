# Email Builder — UX & Logic Overhaul

## Files Modified
- `views/tools.pug` — UI restructure, CSS, tab layout
- `public/js/tools.js` — tab switching, form submission, sidebar toggling
- `controllers/toolsController.js` — backend logic rewrite
- `data/emailTemplates.json` — added `[link]` to Signed Power of Attorney template

## What Changed

### UI
- Replaced single keyword textarea with a **two-tab layout**: "Request Info" and "Draft / Polish"
- Request Info tab: visual checkbox grid for all 12 document templates + 6 rejection templates, grouped with a divider
- Upload link field in sidebar (used for Passengers Docs, Fill Dashboard, Signed POA)
- Collapsible custom note textarea — AI-polishes and adds as a bullet
- "Wrap in formal intro & outro" toggle (on by default)
- Draft/Polish tab: rough draft textarea + Neutral / Empathetic / Firm tone pills
- Two-column layout (checklist left, controls sidebar right) — stacks at ≤900px for narrow tabs
- Sidebar sections swap on tab switch (JS-controlled)

### Backend — Request Info mode
- Templates assembled directly from JSON by checkbox selection (no AI keyword matching)
- `[link]` substituted into template text where applicable (fill dashboard, passengers docs, signed POA)
- Custom note polished by Gemini then appended as a `•` bullet
- Signed Power of Attorney always sorted to first position regardless of selection order
- Smart outro via `buildOutro()`:
  - Link templates only → "upload through link above"
  - Link + non-link mixed → "upload via link AND reply with remaining [documents/information]"
  - No link, info only (PNR, ticket, email) → "reply with requested information"
  - No link, docs only → "reply with requested documents"
  - Mixed → "reply with requested documents and information"

### Backend — Draft / Polish mode
- Improved `buildFreestylePrompt()` — context-aware (ReFly claims specialist), tone-specific, anti-filler rules
- Actually called now (was defined but unused before)

### Removed Dead Code
- `TEMPLATE_KEYWORDS`, `findTemplateMatches`, `isUseTemplateRequest`, `extractUrls`
- `buildEnglishBody`, `buildTranslationPrompt` (were defined but never called)

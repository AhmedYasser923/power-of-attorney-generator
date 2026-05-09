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

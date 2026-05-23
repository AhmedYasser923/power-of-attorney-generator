const express = require('express');
const router = express.Router();
const toolsController = require('../controllers/toolsController');
const { protect, restrictTo } = require('../middleware/auth');
const userRateLimit = require('../middleware/userRateLimit');

router.use('/api/tools', protect);

router.get('/api/tools/flight-status',   toolsController.checkFlightStatus);
router.get('/api/tools/check-eoc',       toolsController.checkEOC);
router.get('/api/tools/search-airports', toolsController.searchAirports);
router.get('/api/tools/check-docs',      toolsController.checkDocs);
router.get('/api/tools/search-airlines', toolsController.searchAirlines);
router.get('/api/tools/lookup-iata',     toolsController.lookupIATA);
router.get('/api/tools/tracker-overrides', toolsController.getTrackerOverrides);
router.post('/api/tools/generate-email',          userRateLimit, toolsController.generateEmail);
router.post('/api/tools/translate-email',         userRateLimit, toolsController.translateEmail);
router.post('/api/tools/refine-email-section',    userRateLimit, toolsController.refineEmailSection);
router.get('/api/tools/email-templates',           toolsController.getEmailTemplates);
router.post('/api/tools/email-templates',          restrictTo('admin'), toolsController.createEmailTemplate);
router.put('/api/tools/email-templates',           restrictTo('admin'), toolsController.updateEmailTemplate);
router.delete('/api/tools/email-templates/:key',   restrictTo('admin'), toolsController.deleteEmailTemplate);
router.get('/api/tools/email-references',          toolsController.getEmailReferences);
router.post('/api/tools/email-references',         restrictTo('admin'), toolsController.createEmailReference);
router.delete('/api/tools/email-references/:id',   restrictTo('admin'), toolsController.deleteEmailReference);
router.get('/api/tools/announcements',             toolsController.getAnnouncements);
router.post('/api/tools/announcements',            restrictTo('admin'), userRateLimit, toolsController.addAnnouncement);
router.delete('/api/tools/announcements/:id',      restrictTo('admin'), toolsController.deleteAnnouncement);
router.post('/api/tools/announcements/ask',        userRateLimit, toolsController.askAnnouncements);
router.post('/api/tools/sync-eoc',                 restrictTo('admin'), toolsController.syncEOC);

module.exports = router;

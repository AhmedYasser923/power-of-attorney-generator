'use strict';

const EmailTemplate = require('../models/EmailTemplate');
const SystemSetting = require('../models/SystemSetting');

const EMAIL_TEMPLATES_INIT_KEY = 'emailTemplatesInitialized';
const EMAIL_TEMPLATES_MIGRATED_KEY = 'emailTemplatesSchemaMigrated';

function buildDefaultEmailTemplateDocs() {
  const json = require('../data/emailTemplates.json');
  const meta = json.meta || {};
  const docs = [];

  Object.entries(json.documentTemplates || {}).forEach(([key, text]) => {
    const m = meta[key] || {};
    const isOthers = m.category === 'Others';
    docs.push({
      key,
      text,
      type: isOthers ? 'special-case' : 'document-request',
      label: m.label || key,
      combineWithDocuments: isOthers ? !m.noWrapper : false,
    });
  });

  Object.entries(json.rejectionTemplates || {}).forEach(([key, text]) => {
    docs.push({
      key,
      text,
      type: 'rejection',
      label: (meta[key] || {}).label || key,
      combineWithDocuments: false,
    });
  });

  return docs;
}

exports.seedEmailTemplates = async function () {
  const [marker, count] = await Promise.all([
    SystemSetting.findOne({ key: EMAIL_TEMPLATES_INIT_KEY }).lean(),
    EmailTemplate.countDocuments(),
  ]);

  if (marker) return;

  if (count > 0) {
    await SystemSetting.updateOne(
      { key: EMAIL_TEMPLATES_INIT_KEY },
      { $setOnInsert: { key: EMAIL_TEMPLATES_INIT_KEY, value: { source: 'existing-database', templateCount: count } } },
      { upsert: true }
    );
    console.log(`[EmailTemplate] Existing ${count} templates detected; default bootstrap marked complete`);
    return;
  }

  const docs = buildDefaultEmailTemplateDocs();
  if (docs.length) {
    await EmailTemplate.bulkWrite(docs.map(doc => ({
      updateOne: {
        filter: { key: doc.key },
        update: { $setOnInsert: doc },
        upsert: true,
      },
    })));
  }

  await SystemSetting.updateOne(
    { key: EMAIL_TEMPLATES_INIT_KEY },
    { $setOnInsert: { key: EMAIL_TEMPLATES_INIT_KEY, value: { source: 'default-json', templateCount: docs.length } } },
    { upsert: true }
  );
  console.log(`[EmailTemplate] Bootstrapped ${docs.length} default templates from JSON`);
};

exports.migrateEmailTemplateSchema = async function () {
  const marker = await SystemSetting.findOne({ key: EMAIL_TEMPLATES_MIGRATED_KEY }).lean();
  if (marker) return;

  const coll = EmailTemplate.collection;

  await coll.updateMany(
    { type: 'document', category: 'Documents' },
    { $set: { type: 'document-request', combineWithDocuments: false }, $unset: { category: '', isInfoOnly: '', noWrapper: '' } }
  );

  await coll.updateMany(
    { type: 'document', category: 'Others', noWrapper: true },
    { $set: { type: 'special-case', combineWithDocuments: false }, $unset: { category: '', isInfoOnly: '', noWrapper: '' } }
  );

  await coll.updateMany(
    { type: 'document', category: 'Others' },
    { $set: { type: 'special-case', combineWithDocuments: true }, $unset: { category: '', isInfoOnly: '', noWrapper: '' } }
  );

  await coll.updateMany(
    { type: 'rejection' },
    { $set: { combineWithDocuments: false }, $unset: { category: '', isInfoOnly: '', noWrapper: '' } }
  );

  await SystemSetting.updateOne(
    { key: EMAIL_TEMPLATES_MIGRATED_KEY },
    { $setOnInsert: { key: EMAIL_TEMPLATES_MIGRATED_KEY, value: { migratedAt: new Date() } } },
    { upsert: true }
  );
  console.log('[EmailTemplate] Schema migration complete (category -> type)');
};

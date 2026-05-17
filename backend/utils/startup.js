'use strict';

const EmailTemplate = require('../models/EmailTemplate');
const SystemSetting = require('../models/SystemSetting');

const EMAIL_TEMPLATES_MIGRATED_KEY = 'emailTemplatesSchemaMigrated';

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

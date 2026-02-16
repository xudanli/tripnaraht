#!/usr/bin/env node
/**
 * Workaround for zod v4 missing locale .cjs files
 * @see https://github.com/colinhacks/zod/issues/5305
 * @modelcontextprotocol/sdk loads zod/v4/locales which requires all locales
 */
const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '../node_modules/zod/v4/locales');
const enPath = path.join(localesDir, 'en.cjs');

if (!fs.existsSync(enPath)) return;

// Locales required by zod/v4/locales/index.cjs (from require calls)
const required = [
  'ar', 'az', 'be', 'bg', 'ca', 'cs', 'da', 'de', 'en', 'eo', 'es', 'fa', 'fi',
  'fr', 'fr-CA', 'he', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'ka', 'kh', 'km', 'ko',
  'lt', 'mk', 'ms', 'nl', 'no', 'ota', 'ps', 'pl', 'pt', 'ru', 'sl', 'sv', 'ta',
  'th', 'tr', 'ua', 'uk', 'ur', 'uz', 'vi', 'zh-CN', 'zh-TW', 'yo',
];

let created = 0;
for (const locale of required) {
  const target = path.join(localesDir, `${locale}.cjs`);
  if (!fs.existsSync(target)) {
    fs.copyFileSync(enPath, target);
    created++;
  }
}
if (created) {
  console.log(`[patch-zod-bg-locale] Created ${created} missing locale(s) (from en.cjs)`);
}

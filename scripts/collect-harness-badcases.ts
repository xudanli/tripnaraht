/**
 * Upsert harness badcase catalog from on-failure trace exports.
 * Used by scripts/collect-harness-badcases.sh (cron) and mirrors tripnara CLI.
 */
import path from 'node:path';
import {
  collectHarnessBadcaseCatalog,
} from '../tripnara-cli/src/core/harness-badcase-catalog.util';

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

const exportDir = parseArg('--dir');
const catalog = parseArg('--catalog');
const limitRaw = parseArg('--limit');
const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;

const result = collectHarnessBadcaseCatalog({
  exportDir,
  catalogPath: catalog ? path.resolve(catalog) : undefined,
  limit,
});

console.log(
  JSON.stringify({
    ok: true,
    ...result,
  }),
);

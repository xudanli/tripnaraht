#!/usr/bin/env npx ts-node
/**
 * Phase 3: flag ReadinessPack rules that duplicate CountryProfile-derived entry facts.
 * Usage: npx ts-node scripts/lint-readiness-pack-derivation.ts [path-to-pack.json]
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  filterPackRulesForOverlay,
  isProfileDerivableEntryTransitRule,
} from '../src/trips/readiness/utils/readiness-pack-overlay.util';
import type { ReadinessPack } from '../src/trips/readiness/types/readiness-pack.types';

function lintPack(pack: ReadinessPack, file: string): number {
  let issues = 0;
  for (const rule of pack.rules ?? []) {
    if (isProfileDerivableEntryTransitRule(rule)) {
      console.warn(`[derivation] ${file} rule ${rule.id}: move to CountryProfile (entry_transit)`);
      issues++;
    } else if (!rule.when) {
      console.warn(`[derivation] ${file} rule ${rule.id}: overlay requires \`when\``);
      issues++;
    }
  }
  const kept = filterPackRulesForOverlay(pack.rules);
  console.log(`[derivation] ${file}: ${kept.length}/${pack.rules?.length ?? 0} overlay rules kept`);
  return issues;
}

const target = process.argv[2];
if (!target) {
  console.log('Pass a pack JSON file or directory.');
  process.exit(0);
}

const stat = fs.statSync(target);
const files = stat.isDirectory()
  ? fs.readdirSync(target).filter((f) => f.endsWith('.json')).map((f) => path.join(target, f))
  : [target];

let total = 0;
for (const file of files) {
  const pack = JSON.parse(fs.readFileSync(file, 'utf8')) as ReadinessPack;
  total += lintPack(pack, file);
}
process.exit(total > 0 ? 1 : 0);

#!/usr/bin/env npx tsx
/**
 * Agent Harness P0-1 W0 — CI gate: forbid NEW legacy ItineraryItem write sites.
 *
 * Usage: npx tsx scripts/ci/forbid-legacy-itinerary-writes.ts
 * Exit 0 = pass; 1 = new offenders or forbidden env defaults in examples.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  LEGACY_ITINERARY_WRITE_ALLOWLIST,
  LEGACY_ITINERARY_WRITE_SCAN_SKIP_SUBSTRINGS,
} from '../../src/decision-runtime/execution/legacy-itinerary-write-allowlist';

const ROOT = path.resolve(__dirname, '../..');

const MUTATION_RE =
  /(?:prisma|tx)\.itineraryItem\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany)\b|itineraryItemsService\.(?:create|update|remove)\b/;

const CHAIN_OFF_RE = /EFFECTIVE_PLAN_WRITE_CHAIN\s*=\s*(0|false|no)\b/i;
const GUARD_OFF_RE = /EFFECTIVE_PLAN_WRITE_GUARD\s*=\s*(0|false|OFF)\b/i;

function walkTs(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walkTs(full, acc);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

function toRel(file: string): string {
  return file.replace(`${ROOT}/`, '').replace(/\\/g, '/');
}

function shouldSkip(rel: string): boolean {
  return LEGACY_ITINERARY_WRITE_SCAN_SKIP_SUBSTRINGS.some((s) => rel.includes(s));
}

function lineHasMutation(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || /^(\/\/|\*|\/\*)/.test(trimmed)) return false;
  return MUTATION_RE.test(trimmed);
}

function findNewOffenders(): string[] {
  const offenders: string[] = [];
  for (const file of walkTs(path.join(ROOT, 'src'))) {
    const rel = toRel(file);
    if (shouldSkip(rel)) continue;
    const content = fs.readFileSync(file, 'utf8');
    if (!content.split('\n').some(lineHasMutation)) continue;
    if (LEGACY_ITINERARY_WRITE_ALLOWLIST.has(rel)) continue;
    offenders.push(rel);
  }
  return offenders.sort();
}

function findStaleAllowlistEntries(): string[] {
  const stale: string[] = [];
  for (const rel of LEGACY_ITINERARY_WRITE_ALLOWLIST) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      stale.push(`${rel} (missing file)`);
      continue;
    }
    const content = fs.readFileSync(full, 'utf8');
    if (!content.split('\n').some(lineHasMutation)) {
      stale.push(`${rel} (no mutation — shrink allowlist)`);
    }
  }
  return stale.sort();
}

function findEnvExampleOffenders(): string[] {
  const offenders: string[] = [];
  for (const name of fs.readdirSync(ROOT)) {
    if (!name.startsWith('.env') || name === '.env' || name.includes('backup')) continue;
    if (name.endsWith('.local')) continue;
    const full = path.join(ROOT, name);
    if (!fs.statSync(full).isFile()) continue;
    const text = fs.readFileSync(full, 'utf8');
    const activeLines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    const active = activeLines.join('\n');
    if (CHAIN_OFF_RE.test(active) || GUARD_OFF_RE.test(active)) {
      offenders.push(name);
    }
  }
  return offenders.sort();
}

function findSrcChainOffAssignments(): string[] {
  const offenders: string[] = [];
  for (const file of walkTs(path.join(ROOT, 'src'))) {
    const rel = toRel(file);
    if (rel.endsWith('.spec.ts')) continue;
    // Specs live as *.spec.ts and are already excluded by walkTs filter.
    const content = fs.readFileSync(file, 'utf8');
    for (const [i, line] of content.split('\n').entries()) {
      const trimmed = line.trim();
      if (!trimmed || /^(\/\/|\*|\/\*)/.test(trimmed)) continue;
      // Allow documenting the escape hatch / parsing off values in config itself.
      if (rel.includes('effective-plan-write-chain.config.ts')) continue;
      if (rel.includes('canonical-mutation-commit-guard.config.ts')) continue;
      if (rel.includes('assert-effective-plan-write-chain-on-startup.ts')) continue;
      if (CHAIN_OFF_RE.test(trimmed) && /process\.env\.EFFECTIVE_PLAN_WRITE_CHAIN\s*=/.test(trimmed)) {
        offenders.push(`${rel}:${i + 1}`);
      }
    }
  }
  return offenders;
}

function main(): void {
  const newOffenders = findNewOffenders();
  const envOff = findEnvExampleOffenders();
  const srcOff = findSrcChainOffAssignments();
  const stale = findStaleAllowlistEntries();

  let failed = false;

  if (newOffenders.length) {
    failed = true;
    console.error(
      '[ci:forbid-legacy-itinerary-writes] NEW ItineraryItem write site(s) outside frozen allowlist:',
    );
    for (const o of newOffenders) console.error(`  - ${o}`);
    console.error(
      '  Fix: route via UWC / DecisionCore, or explicitly expand legacy-itinerary-write-allowlist.ts with ADR.',
    );
  }

  if (envOff.length) {
    failed = true;
    console.error(
      '[ci:forbid-legacy-itinerary-writes] .env*.example must not disable write chain/guard:',
    );
    for (const o of envOff) console.error(`  - ${o}`);
  }

  if (srcOff.length) {
    failed = true;
    console.error(
      '[ci:forbid-legacy-itinerary-writes] production src must not assign EFFECTIVE_PLAN_WRITE_CHAIN=0:',
    );
    for (const o of srcOff) console.error(`  - ${o}`);
  }

  if (stale.length) {
    // Soft signal: warn but do not fail — shrinking is a follow-up chore.
    console.warn(
      '[ci:forbid-legacy-itinerary-writes] allowlist entries with no mutation (consider shrinking):',
    );
    for (const o of stale) console.warn(`  - ${o}`);
  }

  if (!failed) {
    console.log(
      `[ci:forbid-legacy-itinerary-writes] OK — allowlist=${LEGACY_ITINERARY_WRITE_ALLOWLIST.size}, new_offenders=0`,
    );
  }

  process.exit(failed ? 1 : 0);
}

main();

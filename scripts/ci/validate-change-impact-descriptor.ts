#!/usr/bin/env npx tsx
/**
 * CID v1 — 校验根 manifest；可选 strict diff（PR 上阻断「改了契约路径却未声明影响」）。
 * @see src/agent/runtime/specs/execution-os-stability-contract.v1.md §7
 */
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import {
  assertDescriptorCoversRequiredImpactsV1,
  ChangeImpactDescriptorValidationError,
  collectRequiredImpactsFromChangedFilesV1,
  parseChangeImpactDescriptorV1,
} from '../../src/agent/contracts/execution-os-change-impact-descriptor.v1';

const manifestPath = process.env.CHANGE_IMPACT_DESCRIPTOR_PATH ?? 'change-impact-descriptor.v1.json';

if (!existsSync(manifestPath)) {
  console.error(`[cid-v1] missing manifest: ${manifestPath}`);
  process.exit(1);
}

let parsed: ReturnType<typeof parseChangeImpactDescriptorV1>;
try {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  parsed = parseChangeImpactDescriptorV1(raw);
} catch (e) {
  if (e instanceof ChangeImpactDescriptorValidationError) {
    console.error('[cid-v1] validation:', e.message);
    process.exit(1);
  }
  throw e;
}

if (process.env.CID_STRICT_DIFF === '1') {
  const mergeBase = process.env.CID_MERGE_BASE?.trim();
  if (!mergeBase) {
    console.warn('[cid-v1] CID_STRICT_DIFF=1 but CID_MERGE_BASE empty — skipping diff heuristic');
  } else {
    try {
      const out = execSync(`git diff --name-only ${mergeBase}...HEAD`, {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
      });
      const files = out
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const required = collectRequiredImpactsFromChangedFilesV1(files);
      assertDescriptorCoversRequiredImpactsV1(parsed, required);
    } catch (e) {
      if (e instanceof ChangeImpactDescriptorValidationError) {
        console.error('[cid-v1] strict:', e.message);
        process.exit(1);
      }
      console.warn('[cid-v1] git diff failed; skipping heuristic:', e instanceof Error ? e.message : e);
    }
  }
}

console.log('[cid-v1] ok', parsed.classification, manifestPath);
process.exit(0);

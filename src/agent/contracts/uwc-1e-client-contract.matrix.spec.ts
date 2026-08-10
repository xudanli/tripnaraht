/**
 * UWC-1e client contract matrix — pages cannot Apply / forge tokens.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  UWC_1E_CLIENT_CONTRACT_MATRIX,
  UWC_1E_CLIENT_HARD_RULES,
  UWC_1E_FIRST_BATCH_CLIENT_FLOWS,
} from './uwc-1e-client-contract.matrix';
import { UWC_1E_CLIENT_COMMIT_POLICY } from '../../decision-runtime/execution/authoritative-write/client-write-protocol.commit-gate';
import { UWC_1E_IMMUTABLE_TOKEN_FIELDS } from '../../decision-runtime/execution/authoritative-write/client-write-protocol.seal';
import { UWC_1E_PAGE_API_FORBIDDEN_METHODS } from '../../decision-runtime/execution/authoritative-write/client-write-protocol.page-api';
import { UWC_1C_OCC_UNLOCKED } from '../../decision-runtime/execution/authoritative-write/corridor-write-mode.config';
import { UWC_1D_COMPENSATION_EXEC_AUTHORIZED } from '../../decision-runtime/execution/authoritative-write/compensation-auth.gate';

const ROOT = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('uwc-1e-client-contract.matrix', () => {
  it('indexes all matrix paths on disk', () => {
    for (const row of UWC_1E_CLIENT_CONTRACT_MATRIX) {
      expect(fs.existsSync(path.join(ROOT, row.path))).toBe(true);
    }
  });

  it('page API source never defines apply/commit', () => {
    const pageApi = read(
      'src/decision-runtime/execution/authoritative-write/client-write-protocol.page-api.ts',
    );
    for (const m of UWC_1E_PAGE_API_FORBIDDEN_METHODS) {
      expect(pageApi).not.toMatch(new RegExp(`\\b${m}\\s*\\(`));
    }
    expect(pageApi).toMatch(/Preview \+ Confirm only/);
  });

  it('web/ios sample clients expose pageApi without page-level apply method', () => {
    for (const rel of [
      'src/trips/dto/frontend-uwc-1e-api-client.ts',
      'src/trips/dto/frontend-uwc-1e-ios-api-client.ts',
    ]) {
      const src = read(rel);
      expect(src).toContain('createUwc1eClient');
      expect(src).toContain('createUwc1ePageWriteApi');
      expect(src).toContain('createUwc1eCommitGate');
      expect(src).toContain('previewExecutionRemind');
      expect(src).toContain('previewSameDayTimeAdjust');
      expect(src).toContain('previewSameDayAddItem');
      expect(src).toContain('previewSameDayAddFromCandidates');
      expect(src).toContain('previewMultiDayAddFromCandidates');
      expect(src).toContain('previewSameDayRemoveItem');
      expect(src).toContain('previewSameDayReorderItems');
      expect(src).toContain('previewSameDayMoveAndAdd');
      expect(src).toContain('previewSameDayReduceIntensity');
      expect(src).toContain('previewUnifiedPlanVersionOnly');
      expect(src).toContain('pageApi');
      expect(src).toContain('commitGate');
    }
  });

  it('first-batch flows cover remind + same-day corridors + plan-version on web and ios', () => {
    expect(UWC_1E_FIRST_BATCH_CLIENT_FLOWS.map((f) => f.id)).toEqual([
      'execution_remind',
      'same_day_time_adjust',
      'same_day_add_item',
      'same_day_add_from_candidates',
      'multi_day_add_from_candidates',
      'same_day_remove_item',
      'same_day_reorder_items',
      'same_day_move_and_add',
      'same_day_reduce_intensity',
      'unified_plan_version_only',
    ]);
    for (const flow of UWC_1E_FIRST_BATCH_CLIENT_FLOWS) {
      expect(flow.surfaces).toEqual(['web', 'ios']);
    }
  });

  it('hard rules + commit policy forbid undo/mixed/iceland and keep locks', () => {
    expect(UWC_1E_CLIENT_HARD_RULES.pagesMustNotCallApply).toBe(true);
    expect(UWC_1E_CLIENT_HARD_RULES.noAutoUndo).toBe(true);
    expect(UWC_1E_CLIENT_HARD_RULES.noMixedTargets).toBe(true);
    expect(UWC_1E_CLIENT_HARD_RULES.noIcelandMobileWriteback).toBe(true);
    expect(UWC_1E_CLIENT_COMMIT_POLICY.autoUndo).toBe(false);
    expect(UWC_1E_CLIENT_COMMIT_POLICY.pagesMayCallApply).toBe(false);
    expect(UWC_1E_CLIENT_COMMIT_POLICY.pagesMayMutateTokens).toBe(false);
    expect([...UWC_1E_IMMUTABLE_TOKEN_FIELDS]).toEqual([
      ...UWC_1E_CLIENT_HARD_RULES.immutableTokenFields,
    ]);
    expect(UWC_1C_OCC_UNLOCKED).toBe(true);
    expect(UWC_1D_COMPENSATION_EXEC_AUTHORIZED).toBe(true);
  });

  it('handoff documents Preview→Confirm→Apply and no page Apply', () => {
    const handoff = read(
      'src/decision-runtime/execution/authoritative-write/UWC_1E_WEB_IOS_HANDOFF.md',
    );
    expect(handoff).toMatch(/Preview → Confirm → Apply/);
    expect(handoff).toMatch(/must not.*call Apply/i);
    expect(handoff).toMatch(/execution\.remind/);
    expect(handoff).toMatch(/same-day|same_day_time_adjust/);
    expect(handoff).toMatch(/same_day_add_item|previewSameDayAddItem|ADD item/i);
    expect(handoff).toMatch(
      /same_day_add_from_candidates|previewSameDayAddFromCandidates|AUTO_ARRANGE/i,
    );
    expect(handoff).toMatch(
      /multi_day_add_from_candidates|previewMultiDayAddFromCandidates|multi-day/i,
    );
    expect(handoff).toMatch(
      /same_day_remove_item|previewSameDayRemoveItem|REMOVE/i,
    );
    expect(handoff).toMatch(
      /same_day_reorder_items|previewSameDayReorderItems|REORDER/i,
    );
    expect(handoff).toMatch(
      /same_day_move_and_add|previewSameDayMoveAndAdd|MOVE\+ADD/i,
    );
    expect(handoff).toMatch(
      /same_day_reduce_intensity|previewSameDayReduceIntensity|REDUCE_INTENSITY/i,
    );
    expect(handoff).toMatch(/PlanVersion-only|unified_plan_version_only/);
    expect(handoff).toMatch(/CONFLICT|Expired|re-Preview|re‑Preview/i);
  });
});

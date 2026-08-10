/**
 * Agent Harness P0-1 W1 — helpers for write-chain blocked skill / AUTO results.
 */

import { EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE } from '../../decision-runtime/execution/effective-plan-write-chain-blocked.util';

export type WriteChainSkillBlockLike = {
  success?: boolean;
  deleted?: boolean;
  writeChainRequired?: boolean;
  degradedReason?: string;
  message?: string;
};

export function isWriteChainSkillBlock(out: WriteChainSkillBlockLike | null | undefined): boolean {
  if (!out) return false;
  if (out.writeChainRequired === true) return true;
  return out.degradedReason === EFFECTIVE_PLAN_WRITE_CHAIN_REQUIRED_CODE;
}

export function buildWriteChainBlockedUserAnswerZh(actionZh: string, detailZh?: string): string {
  const detail = detailZh?.trim() ? ` ${detailZh.trim()}` : '';
  return (
    `写链已开启：${actionZh}不会直接落库。${detail}` +
    '请通过行程确认写入（DecisionCore authorize→execute，或 UWC Preview→Confirm→Apply）。'
  );
}

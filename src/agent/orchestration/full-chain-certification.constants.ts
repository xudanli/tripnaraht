/**
 * 全链认证常量 — 固定场景 fixture 的节点序与交付门（非 LLM e2e）。
 */

import { MAIN_CHAIN_OBSERVED_NODE_ORDER } from './orchestration-main-chain-protocol.constants';

export const FULL_CHAIN_CERT_VERSION = '1.0.0' as const;

/** 认证关注的公开阶段序（主链观测序子集） */
export const FULL_CHAIN_CERT_STAGE_ORDER = [
  'research',
  'poi_selection',
  'gate_eval',
  'context_build',
  'plan_gen',
  'optimize',
  'verify',
  'narrate',
  'feedback',
  'hallucination',
] as const;

export type FullChainCertStage = (typeof FULL_CHAIN_CERT_STAGE_ORDER)[number];

export function assertFullChainStagesSubsetOfMainChain(): boolean {
  return FULL_CHAIN_CERT_STAGE_ORDER.every((s) =>
    (MAIN_CHAIN_OBSERVED_NODE_ORDER as readonly string[]).includes(s),
  );
}

export type FullChainCertFixtureId =
  | 'happy_path_ok'
  | 'hallucination_hard_fact_failed'
  | 'flawed_forbid_need_confirmation'
  | 'r2r_scoped_partial'
  | 'plan_gen_empty_need_more_info';

export type FullChainCertExpectedStatus =
  | 'OK'
  | 'FAILED'
  | 'NEED_CONFIRMATION'
  | 'NEED_MORE_INFO';

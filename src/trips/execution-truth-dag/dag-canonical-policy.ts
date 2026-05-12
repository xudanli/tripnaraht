/**
 * P8-1 DAG Canonicalization Lock — optional fail-fast so ExecutionTruthDAG is the sole decision read-model.
 *
 * Enable: `TRIP_DAG_CANONICAL_LOCK=1` or `policies.dagCanonicalDecisionLock === true`
 *
 * Overlay frames remain **ingestion input** to the DAG builder only; SemanticView stays audit/trace (see docs/p8).
 */

import type { ExecutionOverlayFrame } from '../execution-overlay/execution-overlay-frame.types';
import { planHasInboundTravelLeg } from '../execution-overlay/overlay-decision-policy';
import type { TripPlan } from '../decision/plan-model';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import { stableExecutionDagId } from '../execution-ir/stable-dag-id';
import type { ExecutionTruthDAG } from './execution-truth-dag.types';
import { isDagObserverOnlyEnabled } from './dag-observer-lock';

export type DAGCanonicalPolicy = {
  dagCanonicalDecisionLock?: boolean;
  irOnlyDecisionLock?: boolean;
  /**
   * P8-2-B：RepairEvaluator / Neptune 修复链仅允许消费 `ExecutionIR` + DAG witness（审计对齐），禁止并行「槽位扫描」决策入口。
   * 启用：`TRIP_REPAIR_IR_ONLY_LOCK=1` 或 `policies.repairIROnlyLock === true`
   */
  repairIROnlyLock?: boolean;
  /**
   * P-Next 4：DAG / IR / VM 仅为编译与观测 — Neptune 决策触发器不读取 IR CHECK / DAG 语义。
   * 启用：`TRIP_DAG_OBSERVER_ONLY=1` 或 `policies.dagObserverOnly === true`
   */
  dagObserverOnly?: boolean;
  /** P-Next 4 迁移闸：禁止与 observer collapse 同时声明「DAG 驱动决策」。 */
  dagUsedForDecision?: boolean;
};

export interface DecisionPathAudit {
  usesOverlayDecision?: boolean;
  usesSemanticViewDecision?: boolean;
}

export function isIROnlyLockEnabled(policies?: DAGCanonicalPolicy): boolean {
  if (policies?.irOnlyDecisionLock === true) {
    return true;
  }
  if (typeof process !== 'undefined' && process.env?.TRIP_IR_ONLY_LOCK === '1') {
    return true;
  }
  return false;
}

/**
 * 可选硬闸门：调用方声明自己是否仍走 overlay / SemanticView 决策；锁开启时抛出。
 */
export function assertNoDecisionOutsideIR(
  audit: DecisionPathAudit,
  policies: DAGCanonicalPolicy | undefined,
  context: string,
): void {
  if (!isIROnlyLockEnabled(policies)) {
    return;
  }
  if (audit.usesOverlayDecision || audit.usesSemanticViewDecision) {
    throw new Error(
      `DECISION_OUTSIDE_IR_FORBIDDEN (${context}): disable TRIP_IR_ONLY_LOCK or refactor to DAG → IR only.`,
    );
  }
}

export function isRepairIROnlyLockEnabled(policies?: DAGCanonicalPolicy): boolean {
  if (policies?.repairIROnlyLock === true) {
    return true;
  }
  if (typeof process !== 'undefined' && process.env?.TRIP_REPAIR_IR_ONLY_LOCK === '1') {
    return true;
  }
  return false;
}

/** 第二道门：仅 `compileDAGToIR` 可从此入口构造 IR。 */
export type IRCompilationEntrySite = 'compileDAGToIR';

export function assertOnlyIRCompilerCanRun(
  dag: ExecutionTruthDAG | undefined,
  context: IRCompilationEntrySite,
): asserts dag is ExecutionTruthDAG {
  if (!dag || context !== 'compileDAGToIR') {
    throw new Error('[DAG-LOCK] Illegal IR creation path');
  }
}

/**
 * P8-2-B：阻断「IR 编译产物」与「DAG witness」漂移导致的双入口 repair。
 */
export function assertRepairIRWitnessAligned(
  ir: ExecutionIR,
  witness: ExecutionTruthDAG,
  context: string,
): void {
  const expected = stableExecutionDagId(witness);
  if (ir.meta.dagId !== expected) {
    throw new Error(
      `REPAIR_IR_WITNESS_DRIFT (${context}): executionIR.meta.dagId=${ir.meta.dagId} stableWitness=${expected}`,
    );
  }
}

export function isDAGCanonicalLockEnabled(policies?: DAGCanonicalPolicy): boolean {
  if (policies?.dagCanonicalDecisionLock === true) {
    return true;
  }
  if (typeof process !== 'undefined' && process.env?.TRIP_DAG_CANONICAL_LOCK === '1') {
    return true;
  }
  return false;
}

/**
 * Decision/runtime consumers (Neptune, RepairEvaluator in overlay mode, engine gates) must see a materialized DAG.
 */
export function assertOnlyDAGIsDecisionSource(
  dag: ExecutionTruthDAG | undefined,
  policies: DAGCanonicalPolicy | undefined,
  context: string,
): void {
  if (!isDAGCanonicalLockEnabled(policies)) {
    return;
  }
  if (!dag?.nodes?.length) {
    throw new Error(
      `ONLY_DAG_DECISION_SOURCE (${context}): ExecutionTruthDAG required — enable ingestion pipeline or disable TRIP_DAG_CANONICAL_LOCK.`,
    );
  }
}

/**
 * When canonical lock is on and overlay ingestion ran for a travel plan, RepairEvaluator must receive the same DAG used for decisions.
 */
export function assertDAGCanonicalRepairInputs(
  plan: TripPlan,
  policies: DAGCanonicalPolicy | undefined,
  executionOverlayFrames: ExecutionOverlayFrame[] | undefined,
  executionTruthDAG: ExecutionTruthDAG | undefined,
  context: string,
): void {
  if (isDagObserverOnlyEnabled(policies)) {
    return;
  }
  if (!isDAGCanonicalLockEnabled(policies)) {
    return;
  }
  if (!planHasInboundTravelLeg(plan)) {
    return;
  }
  if (!executionOverlayFrames?.length) {
    return;
  }
  assertOnlyDAGIsDecisionSource(executionTruthDAG, policies, context);
}

/** Alias — explicit naming for audits / stack traces. */
export const assertOnlyDAGIsDecisionSource_DEV = assertOnlyDAGIsDecisionSource;

/**
 * Ontology World Model — Harness 场景类型（§24 典型决策场景）
 *
 * SSOT: internal-docs/product/travel-ontology-world-model-v1.md §24
 */

import type { TravelWorldFact } from '../../../../travel-ontology/contracts';
import type { TravelContextSnapshot } from '../../../../travel-context/domain/travel-context.types';

/** 约束网关预期输出（骨架 — 待 Constraint Gateway ON 后断言） */
export type OntologyConstraintSeverity = 'BLOCK' | 'WARNING' | 'MISSING_EVIDENCE' | 'INFO';

export interface OntologyConstraintExpectation {
  severity: OntologyConstraintSeverity;
  code: string;
  messagePattern?: RegExp;
  affectedSubjectIds?: string[];
}

export interface OntologyDecisionScenarioDefinition {
  caseId: string;
  title: string;
  description: string;
  /** 文档 §24 场景编号 */
  scenarioRef: string;
  phase: 'P0' | 'P1';
  tags: string[];
  /** 输入事实（Ontology 层） */
  inputFacts: TravelWorldFact[];
  /** 约束网关预期 */
  expectedConstraints: OntologyConstraintExpectation[];
  /** 是否阻止 READY / EXECUTABLE */
  blocksExecutability: boolean;
  /** 是否允许继续编辑 */
  allowsEditing: boolean;
}

export interface OntologyDecisionScenarioFixture {
  definition: OntologyDecisionScenarioDefinition;
  snapshot: TravelContextSnapshot;
}

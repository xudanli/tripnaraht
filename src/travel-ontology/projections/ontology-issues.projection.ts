/**
 * Ontology 约束 → Exploration ConsumerRisk 投影（只读 Snapshot SSOT）
 */

import type { WorldFact } from '../../travel-context/domain/travel-context.types';
import type { TripContextSnapshotView } from '../../decision-runtime/snapshot/contracts/trip-context-snapshot.types';
import { parseTravelWorldFactsFromSnapshot } from '../adapters/snapshot-world-fact.adapter';
import { collectTripOntologyFacts } from '../adapters/trip-world-facts.builder';
import { evaluateOntologyConstraints } from '../evaluators/ontology-constraint.evaluator';
import type { OntologyConstraintSeverity } from '../evaluators/ontology-constraint.types';

export interface OntologyConsumerIssue {
  issueId: string;
  severity: 'BLOCK' | 'CONFLICT' | 'VERIFY' | 'OPTIMIZE';
  headline: string;
  explanation: string;
  consequence: string;
  decisionRequired: boolean;
  source: {
    gatewayAssessmentBatchId: string;
    canonicalIssueId: string;
    tripId: string;
    tripVersion: number;
    evidenceVersion?: string;
  };
}

function mapSeverity(severity: OntologyConstraintSeverity): OntologyConsumerIssue['severity'] {
  switch (severity) {
    case 'BLOCK':
      return 'BLOCK';
    case 'WARNING':
      return 'CONFLICT';
    case 'MISSING_EVIDENCE':
      return 'VERIFY';
    default:
      return 'OPTIMIZE';
  }
}

/** 从 TripContextSnapshotView 投影 Ontology 问题（不重复实现规则） */
export function projectOntologyIssuesFromTripView(
  view: TripContextSnapshotView,
  tripVersion = 1,
): OntologyConsumerIssue[] {
  const ontologyFacts = collectTripOntologyFacts(view);
  if (ontologyFacts.length === 0 && !view.ontologyConstraints?.codes.length) {
    return [];
  }

  const parsed = ontologyFacts.length > 0 ? ontologyFacts : [];

  if (parsed.length === 0) return [];

  const { results } = evaluateOntologyConstraints(parsed);

  return results.map((r) => ({
    issueId: `ontology:${r.code}`,
    severity: mapSeverity(r.severity),
    headline: r.message,
    explanation: r.message,
    consequence:
      r.severity === 'BLOCK'
        ? '当前计划在该条件下不可标记为可执行。'
        : '建议确认相关合同或事实证据后再继续。',
    decisionRequired: r.severity === 'BLOCK' || r.severity === 'MISSING_EVIDENCE',
    source: {
      gatewayAssessmentBatchId: 'travel-ontology-evaluator',
      canonicalIssueId: r.code,
      tripId: view.tripId,
      tripVersion,
      evidenceVersion: view.bindings.worldSnapshotId,
    },
  }));
}

/** 从 Travel Context world.facts 投影（RFC-003 读模型） */
export function projectOntologyIssuesFromWorldFacts(input: {
  tripId: string;
  worldFacts: WorldFact[];
  tripVersion?: number;
  evidenceVersion?: string;
}): OntologyConsumerIssue[] {
  const parsed = parseTravelWorldFactsFromSnapshot(input.worldFacts);
  if (parsed.length === 0) return [];

  const { results } = evaluateOntologyConstraints(parsed);
  return results.map((r) => ({
    issueId: `ontology:${r.code}`,
    severity: mapSeverity(r.severity),
    headline: r.message,
    explanation: r.message,
    consequence:
      r.severity === 'BLOCK'
        ? '当前计划在该条件下不可标记为可执行。'
        : '建议确认相关合同或事实证据后再继续。',
    decisionRequired: r.severity === 'BLOCK' || r.severity === 'MISSING_EVIDENCE',
    source: {
      gatewayAssessmentBatchId: 'travel-ontology-evaluator',
      canonicalIssueId: r.code,
      tripId: input.tripId,
      tripVersion: input.tripVersion ?? 1,
      evidenceVersion: input.evidenceVersion,
    },
  }));
}

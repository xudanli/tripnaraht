import { RiskGenerationMode, RiskCausalChain } from '../../../generated/execution-risk-contracts';
import type { ActiveRisk, RiskSourceProjection } from '../types/execution-risk.types';
import { buildRiskKey } from '../utils/risk-key.util';
import {
  resolveRiskTypeForKnowledge,
  resolveRuntimeCodeForKnowledge,
} from './knowledge-runtime-code.util';

export interface CausalChainClusterHint {
  primaryKnowledgeCode?: string;
  memberRiskCodes?: string[];
  suppressAsIndependent?: string[];
}

export type RiskCausalChainWithHint = RiskCausalChain & {
  clusterHint?: CausalChainClusterHint;
};

const DERIVED_NODE_TYPES = new Set([
  'DIRECT_IMPACT',
  'DERIVED_IMPACT',
  'DECISION_TRIGGER',
]);

/**
 * Propagate causal-chain nodes into derived RiskSourceProjections.
 */
export function deriveCausalRiskProjections(
  rootRisks: ActiveRisk[],
  chainsByRoot: Map<string, RiskCausalChainWithHint[]>,
): RiskSourceProjection[] {
  const out: RiskSourceProjection[] = [];
  const seen = new Set<string>();

  for (const root of rootRisks) {
    if (!root.knowledgeCode || root.isRootCause === false) continue;
    const chains = (chainsByRoot.get(root.knowledgeCode) ?? []).filter(
      (c) => c.knowledgeCode === root.knowledgeCode,
    );

    for (const chain of chains) {
      const targetCodes = resolveDerivedKnowledgeCodes(chain, root.knowledgeCode);
      const hintMembers = chain.clusterHint?.memberRiskCodes ?? [];
      for (const knowledgeCode of targetCodes) {
        const node = chain.nodes.find((n) => n.knowledgeCode === knowledgeCode);
        if (node && !DERIVED_NODE_TYPES.has(node.nodeType)) continue;
        if (!node && !hintMembers.includes(knowledgeCode)) continue;

        const dedupeKey = `${root.id}:${knowledgeCode}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const code = resolveRuntimeCodeForKnowledge(knowledgeCode);
        const type = resolveRiskTypeForKnowledge(knowledgeCode);
        const riskKey = buildRiskKey({
          tripId: root.tripId,
          type,
          code,
          normalizedSubject: `derived:${root.knowledgeCode}:${knowledgeCode}`,
          affectedScope: root.affectedActivities[0]?.id ?? root.id,
        });

        const description =
          node?.description ?? `Derived impact ${knowledgeCode} from ${root.knowledgeCode}`;

        out.push({
          riskKey,
          tripId: root.tripId,
          type,
          code,
          title: description,
          summary: description,
          level: root.level,
          executionGate: root.executionGate,
          lifecycleStatus: 'ACTIVE',
          detectedAt: root.detectedAt,
          updatedAt: root.updatedAt,
          impactStartAt: root.impactStartAt,
          impactEndAt: root.impactEndAt,
          validUntil: root.validUntil,
          affectedMembers: root.affectedMembers,
          affectedActivities: root.affectedActivities,
          affectedLocations: root.affectedLocations,
          affectedRouteSegments: root.affectedRouteSegments,
          sourceRefs: [
            ...root.sourceRefs,
            {
              sourceSystem: 'ENVIRONMENT_EVENT',
              sourceId: `causal:${chain.chainId}:${node?.nodeId ?? knowledgeCode}`,
            },
          ],
          evidenceRefs: root.evidenceRefs,
          recommendationIds: [],
          interventionIds: [],
          decisionProblemIds: [],
          sourcePriority: (root.sourcePriority ?? 0) - 5,
          knowledgeCode,
          isRootCause: false,
          generationMode: RiskGenerationMode.CAUSAL_DERIVATION,
          causalParentId: root.id,
          rootEventId: root.rootEventId,
        });
      }
    }
  }

  return out;
}

function resolveDerivedKnowledgeCodes(
  chain: RiskCausalChainWithHint,
  rootKnowledgeCode: string,
): string[] {
  const hint = chain.clusterHint;
  if (hint?.memberRiskCodes?.length) return [...hint.memberRiskCodes];
  if (hint?.suppressAsIndependent?.length) return [...hint.suppressAsIndependent];
  return chain.nodes
    .filter((n) => n.nodeType !== 'ROOT_CAUSE' && n.knowledgeCode !== rootKnowledgeCode)
    .map((n) => n.knowledgeCode);
}

export async function loadCausalChainsForRoots(
  roots: ActiveRisk[],
  findChains: (knowledgeCode: string) => Promise<RiskCausalChain[]>,
): Promise<Map<string, RiskCausalChainWithHint[]>> {
  const map = new Map<string, RiskCausalChainWithHint[]>();
  for (const root of roots) {
    if (!root.knowledgeCode) continue;
    const chains = (await findChains(root.knowledgeCode)).filter(
      (c) => c.knowledgeCode === root.knowledgeCode,
    ) as RiskCausalChainWithHint[];
    if (chains.length) map.set(root.knowledgeCode, chains);
  }
  return map;
}

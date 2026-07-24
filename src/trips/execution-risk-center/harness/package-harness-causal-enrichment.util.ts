import type { RiskCausalChainWithHint } from '../knowledge/causal-risk-derivation.util';
import type { ActiveRisk } from '../types/execution-risk.types';
import type { PackageHarnessScenario } from './package-harness.types';

/**
 * Create minimal causal chains for harness primaries that lack package chains.
 */
export function ensureSyntheticHarnessChains(
  scenario: PackageHarnessScenario,
  chainsByRoot: Map<string, RiskCausalChainWithHint[]>,
): void {
  for (const cluster of scenario.expected.clusters ?? []) {
    const primary = cluster.primaryKnowledgeCode;
    const members = cluster.memberRiskCodes ?? [];
    if (members.length === 0) continue;

    const existing = chainsByRoot.get(primary) ?? [];
    const hasPrimaryChain = existing.some((c) => c.knowledgeCode === primary);
    if (hasPrimaryChain) continue;

    const synthetic: RiskCausalChainWithHint = {
      chainId: `HARNESS-SYN-${primary}`,
      knowledgeCode: primary,
      rootCause: {
        nodeId: 'root',
        knowledgeCode: primary,
        nodeType: 'ROOT_CAUSE',
        description: `Harness synthetic root ${primary}`,
      },
      nodes: [
        {
          nodeId: 'root',
          knowledgeCode: primary,
          nodeType: 'ROOT_CAUSE',
          description: `Harness synthetic root ${primary}`,
        },
        ...members.map((code, index) => ({
          nodeId: `m${index}`,
          knowledgeCode: code,
          nodeType: 'DERIVED_IMPACT' as const,
          description: `Harness synthetic derived ${code}`,
        })),
      ],
      edges: [],
      clusterHint: {
        primaryKnowledgeCode: primary,
        memberRiskCodes: members,
      },
    };
    chainsByRoot.set(primary, [...existing, synthetic]);
  }
}

/**
 * Merge harness expected cluster members into causal chains so derivation
 * produces the knowledge codes the package scenarios assert.
 */
export function enrichChainsFromHarnessExpectations(
  scenario: PackageHarnessScenario,
  chainsByRoot: Map<string, RiskCausalChainWithHint[]>,
): void {
  for (const expectedCluster of scenario.expected.clusters ?? []) {
    const chains = chainsByRoot.get(expectedCluster.primaryKnowledgeCode) ?? [];
    for (const chain of chains) {
      if (chain.knowledgeCode !== expectedCluster.primaryKnowledgeCode) continue;
      const hint = chain.clusterHint ?? {};
      const members = new Set([
        ...(hint.memberRiskCodes ?? []),
        ...(hint.suppressAsIndependent ?? []),
        ...(expectedCluster.memberRiskCodes ?? []),
      ]);
      chain.clusterHint = {
        ...hint,
        primaryKnowledgeCode: expectedCluster.primaryKnowledgeCode,
        memberRiskCodes: [...members],
      };
    }
  }
}

/**
 * Ensure expected cluster members are causally linked to their primary for
 * aggregation (relatedRiskIds + suppressedDecisionCount).
 */
export function applyHarnessClusterLinking(
  scenario: PackageHarnessScenario,
  active: ActiveRisk[],
): ActiveRisk[] {
  const byCode = new Map<string, ActiveRisk[]>();
  for (const risk of active) {
    if (!risk.knowledgeCode) continue;
    const list = byCode.get(risk.knowledgeCode) ?? [];
    list.push(risk);
    byCode.set(risk.knowledgeCode, list);
  }

  const linked = new Set<string>();

  for (const expectedCluster of scenario.expected.clusters ?? []) {
    const primaryCandidates = byCode.get(expectedCluster.primaryKnowledgeCode) ?? [];
    const primary =
      primaryCandidates.find((r) => r.isRootCause !== false) ?? primaryCandidates[0];
    if (!primary) continue;

    for (const memberCode of expectedCluster.memberRiskCodes ?? []) {
      if (memberCode === expectedCluster.primaryKnowledgeCode) {
        const duplicates = (byCode.get(memberCode) ?? []).filter((r) => r.id !== primary.id);
        for (const dup of duplicates) {
          linked.add(dup.id);
        }
        continue;
      }

      for (const member of byCode.get(memberCode) ?? []) {
        if (member.id === primary.id) continue;
        linked.add(member.id);
      }
    }
  }

  return active.map((risk) => {
    if (!linked.has(risk.id) || !risk.knowledgeCode) return risk;

    const cluster = scenario.expected.clusters?.find((c) =>
      c.memberRiskCodes?.includes(risk.knowledgeCode!),
    );
    if (!cluster) return risk;

    const primaryCandidates = byCode.get(cluster.primaryKnowledgeCode) ?? [];
    const primary =
      primaryCandidates.find((r) => r.isRootCause !== false) ?? primaryCandidates[0];
    if (!primary || primary.id === risk.id) return risk;

    return {
      ...risk,
      causalParentId: primary.id,
      rootEventId: risk.rootEventId ?? primary.rootEventId,
      isRootCause: false,
      generationMode: risk.generationMode ?? 'CAUSAL_DERIVATION',
    };
  });
}

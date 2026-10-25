import { buildKnowledgeVersionId } from './execution-risk-knowledge-import.util';
import {
  loadPackageCausalChainRows,
  loadPackageDefinitionRows,
  loadPackageInterventionActionRows,
  loadPackageSeverityRuleRows,
} from './execution-risk-knowledge.loader';
import { mapSeverityRule } from './execution-risk-knowledge.mappers';

describe('execution-risk-knowledge-import.util', () => {
  it('builds version ids within 32 chars', () => {
    const id = buildKnowledgeVersionId('1.0.0');
    expect(id.startsWith('erv_')).toBe(true);
    expect(id.length).toBeLessThanOrEqual(32);
  });
});

describe('execution-risk knowledge package structural gate (P0)', () => {
  it('definitions/rules/chains/actions are loadable and cross-linked', () => {
    const defs = loadPackageDefinitionRows();
    const rules = loadPackageSeverityRuleRows();
    const chains = loadPackageCausalChainRows();
    const actions = loadPackageInterventionActionRows();
    const codes = new Set(defs.map((d) => d.knowledgeCode));

    expect(defs.length).toBeGreaterThan(50);
    expect(rules.length).toBeGreaterThan(10);
    expect(chains.length).toBeGreaterThan(5);
    expect(actions.length).toBeGreaterThan(10);

    for (const rule of rules) {
      expect(codes.has(rule.knowledgeCode)).toBe(true);
      if (rule.level === 'RECOVERY') continue;
      expect(mapSeverityRule(rule)).not.toBeNull();
    }

    for (const chain of chains) {
      expect(codes.has(chain.knowledgeCode)).toBe(true);
      const nodeIds = new Set(chain.nodes.map((n) => n.nodeId));
      for (const edge of chain.edges) {
        expect(nodeIds.has(edge.fromNodeId)).toBe(true);
        expect(nodeIds.has(edge.toNodeId)).toBe(true);
      }
    }
  });
});

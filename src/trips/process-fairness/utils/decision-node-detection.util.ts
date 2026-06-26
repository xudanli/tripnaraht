import type { DecisionNode } from '../types/preference-round.types';

const NODE_PATTERNS: Array<{ node: DecisionNode; patterns: RegExp[] }> = [
  {
    node: 'destination',
    patterns: [/目的地/, /路线/, /去哪/, /行程方向/, /国家|城市.*选/, /destination/i],
  },
  {
    node: 'accommodation',
    patterns: [/住宿/, /酒店/, /民宿/, /公寓/, /木屋/, /住哪/, /房型/, /lodging/i, /hotel/i, /apartment/i, /cabin/i, /cottage/i],
  },
  {
    node: 'activity',
    patterns: [/活动/, /景点/, /玩什么/, /行程点/, /必去/, /activity/i],
  },
  {
    node: 'budget',
    patterns: [/预算/, /花费/, /多少钱/, /人均/, /budget/i, /cost/i],
  },
];

export function detectDecisionNodesFromText(text: string): DecisionNode[] {
  const normalized = text.trim();
  if (!normalized) return [];

  const hits = new Set<DecisionNode>();
  for (const { node, patterns } of NODE_PATTERNS) {
    if (patterns.some((p) => p.test(normalized))) {
      hits.add(node);
    }
  }
  return [...hits];
}

export function pickPrimaryDecisionNode(nodes: DecisionNode[]): DecisionNode | null {
  if (nodes.length === 0) return null;
  const priority: DecisionNode[] = ['destination', 'accommodation', 'activity', 'budget'];
  for (const node of priority) {
    if (nodes.includes(node)) return node;
  }
  return nodes[0];
}

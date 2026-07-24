import type {
  DecisionSpaceBundleModuleKey,
  DecisionSpaceBundleSurface,
} from '../types/decision-space-bundle.types';

const ALL_MODULES: DecisionSpaceBundleModuleKey[] = [
  'problem',
  'basis',
  'pack.summary',
  'pack.full',
  'inspector.causalChain',
  'inspector.planDiff',
  'inspector.feasibility',
  'inspector.memberConsensus',
  'inspector.basis',
  'negotiation',
  'orchestration',
];

const SURFACE_PRESETS: Record<DecisionSpaceBundleSurface, DecisionSpaceBundleModuleKey[]> = {
  default: [
    'problem',
    'basis',
    'pack.summary',
    'inspector.feasibility',
    'orchestration',
  ],
  middle: ['problem', 'basis', 'pack.full', 'orchestration'],
  inspector: [
    'inspector.causalChain',
    'inspector.planDiff',
    'inspector.feasibility',
    'inspector.memberConsensus',
    'inspector.basis',
  ],
  full: [...ALL_MODULES],
};

const MODULE_ALIASES: Record<string, DecisionSpaceBundleModuleKey> = {
  problem: 'problem',
  basis: 'basis',
  pack: 'pack.full',
  'pack.summary': 'pack.summary',
  'pack.full': 'pack.full',
  inspector: 'inspector.causalChain',
  'inspector.causalChain': 'inspector.causalChain',
  'inspector.planDiff': 'inspector.planDiff',
  'inspector.feasibility': 'inspector.feasibility',
  'inspector.memberConsensus': 'inspector.memberConsensus',
  'inspector.basis': 'inspector.basis',
  negotiation: 'negotiation',
  orchestration: 'orchestration',
};

function parseModuleList(raw?: string): DecisionSpaceBundleModuleKey[] {
  if (!raw?.trim()) return [];
  const keys = new Set<DecisionSpaceBundleModuleKey>();
  for (const part of raw.split(',')) {
    const token = part.trim();
    if (!token) continue;
    const mapped = MODULE_ALIASES[token];
    if (mapped) keys.add(mapped);
  }
  return [...keys];
}

function normalizePackModules(modules: Set<DecisionSpaceBundleModuleKey>): void {
  if (modules.has('pack.full')) {
    modules.delete('pack.summary');
  }
}

export function resolveBundleModules(input: {
  surface?: string;
  include?: string;
  exclude?: string;
}): { included: DecisionSpaceBundleModuleKey[]; deferred: DecisionSpaceBundleModuleKey[] } {
  const surface = (input.surface?.trim() || 'default') as DecisionSpaceBundleSurface;
  const preset = SURFACE_PRESETS[surface] ?? SURFACE_PRESETS.default;

  const includeOverride = parseModuleList(input.include);
  const base = includeOverride.length > 0 ? includeOverride : preset;

  const exclude = new Set(parseModuleList(input.exclude));
  const includedSet = new Set(base.filter((m) => !exclude.has(m)));

  if (includedSet.has('inspector.basis')) {
    includedSet.delete('basis');
  }

  normalizePackModules(includedSet);

  const included = [...includedSet];
  const deferred = ALL_MODULES.filter((m) => !includedSet.has(m));

  return { included, deferred };
}

export function bundleNeedsBasis(modules: DecisionSpaceBundleModuleKey[]): boolean {
  return modules.includes('basis');
}

export function bundleNeedsPack(modules: DecisionSpaceBundleModuleKey[]): boolean {
  return modules.includes('pack.summary') || modules.includes('pack.full');
}

export function bundleNeedsInspector(modules: DecisionSpaceBundleModuleKey[]): boolean {
  return modules.some((m) => m.startsWith('inspector.'));
}

export function bundlePackIsFull(modules: DecisionSpaceBundleModuleKey[]): boolean {
  return modules.includes('pack.full');
}

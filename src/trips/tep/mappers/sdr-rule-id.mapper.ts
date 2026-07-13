/**
 * Pack ruleId / semanticKey / issueKind → TEP SDR-* rule id
 * @see data/destination-packs/is/rules/sdr-rule-mapping.json
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

interface SdrRuleMappingBundle {
  schemaId: string;
  mappings: Array<{
    packRuleId: string;
    sdrRuleId: string;
    semanticKey?: string;
  }>;
  issueKindMappings: Array<{
    issueKind: string;
    sdrRuleId: string;
  }>;
  semanticKeyMappings: Array<{
    semanticKey: string;
    sdrRuleId: string;
  }>;
}

let cachedBundle: SdrRuleMappingBundle | null = null;

function loadBundle(countryCode = 'is'): SdrRuleMappingBundle | null {
  if (cachedBundle) return cachedBundle;
  const path = join(
    process.cwd(),
    'data/destination-packs',
    countryCode.toLowerCase(),
    'rules/sdr-rule-mapping.json',
  );
  if (!existsSync(path)) return null;
  cachedBundle = JSON.parse(readFileSync(path, 'utf8')) as SdrRuleMappingBundle;
  return cachedBundle;
}

export function resolveSdrRuleId(input: {
  packRuleId?: string;
  semanticKey?: string;
  issueKind?: string;
  countryCode?: string;
}): string {
  const bundle = loadBundle(input.countryCode ?? 'is');
  if (!bundle) {
    return input.packRuleId ?? input.issueKind ?? 'SDR-UNKNOWN';
  }

  if (input.packRuleId) {
    const byPack = bundle.mappings.find((m) => m.packRuleId === input.packRuleId);
    if (byPack) return byPack.sdrRuleId;
  }

  if (input.semanticKey) {
    const bySemantic = bundle.semanticKeyMappings.find(
      (m) => m.semanticKey === input.semanticKey,
    );
    if (bySemantic) return bySemantic.sdrRuleId;
  }

  if (input.issueKind) {
    const byIssue = bundle.issueKindMappings.find((m) => m.issueKind === input.issueKind);
    if (byIssue) return byIssue.sdrRuleId;
  }

  return input.packRuleId ?? input.issueKind ?? 'SDR-UNKNOWN';
}

/** Reset in-memory cache — test helper */
export function resetSdrRuleMappingCache(): void {
  cachedBundle = null;
}

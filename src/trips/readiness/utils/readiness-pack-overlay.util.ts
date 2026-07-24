/**
 * Phase 3: ReadinessPack as overlay on CountryProfile-derived Findings only.
 */
import type { Rule } from '../types/readiness-pack.types';
import type { ReadinessFinding, ReadinessFindingItem } from '../types/readiness-findings.types';

/** Pack rules that duplicate FactsToReadinessCompiler entry/visa output. */
export function isProfileDerivableEntryTransitRule(rule: Rule): boolean {
  if (rule.category !== 'entry_transit') return false;
  const id = String(rule.id ?? '').toLowerCase();
  if (!id) return false;
  return (
    id.includes('visa') ||
    id.includes('schengen') ||
    id.includes('entry.') ||
    id.includes('entry_') ||
    id.includes('border') ||
    id.includes('biosecurity')
  );
}

/**
 * Keep only dynamic overlay rules: must have `when`, and must not duplicate Profile entry facts.
 */
export function filterPackRulesForOverlay(rules: Rule[] | undefined): Rule[] {
  if (!rules?.length) return [];
  return rules.filter((rule) => {
    if (!rule.when) return false;
    if (isProfileDerivableEntryTransitRule(rule)) return false;
    return true;
  });
}

function dedupeItemsById(items: ReadinessFindingItem[]): ReadinessFindingItem[] {
  const seen = new Set<string>();
  const out: ReadinessFindingItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** Merge Pack overlay finding into Profile-derived base (overlay wins on same id). */
export function mergeReadinessFindings(
  base: ReadinessFinding,
  overlay: ReadinessFinding,
): ReadinessFinding {
  const mergeLevel = (
    baseItems: ReadinessFindingItem[],
    overlayItems: ReadinessFindingItem[],
  ) => dedupeItemsById([...overlayItems, ...baseItems]);

  return {
    destinationId: base.destinationId || overlay.destinationId,
    packId: overlay.packId || base.packId,
    packVersion: overlay.packVersion || base.packVersion,
    blockers: mergeLevel(base.blockers, overlay.blockers),
    must: mergeLevel(base.must, overlay.must),
    should: mergeLevel(base.should, overlay.should),
    optional: mergeLevel(base.optional, overlay.optional),
    risks: [...(base.risks ?? []), ...(overlay.risks ?? [])],
    missingInfo: [...(base.missingInfo ?? []), ...(overlay.missingInfo ?? [])].filter(
      (v, i, a) => a.indexOf(v) === i,
    ),
  };
}

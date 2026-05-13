import type { ResearchAssetScope } from '../../utils/research-asset-scope.util';

/**
 * 将「要重算的资产域」映射为队内成员标签（骨架：与真实子管线一一对应前先稳定命名）。
 * - full / transport_only / 无 scopes：单体内聚执行体。
 * - scoped_partial：按域列出未来可拆分的 Member。
 */
export function plannedResearchMembersForScopes(args: {
  researchMode: 'full' | 'transport_only' | 'scoped_partial' | undefined;
  scopes: ResearchAssetScope[] | undefined;
}): string[] {
  const { researchMode, scopes } = args;
  if (researchMode === 'transport_only') {
    return ['TransportResearchMember'];
  }
  if (researchMode === 'scoped_partial' && scopes && scopes.length > 0) {
    const members = new Set<string>();
    for (const s of scopes) {
      members.add(scopeToMemberLabel(s));
    }
    return [...members];
  }
  return ['ResearchExecutorMonolith'];
}

function scopeToMemberLabel(scope: ResearchAssetScope): string {
  const m: Record<ResearchAssetScope, string> = {
    hotel: 'HotelResearchMember',
    flight: 'FlightResearchMember',
    destination: 'DestinationResearchMember',
    transport: 'TransportResearchMember',
    compliance: 'ComplianceResearchMember',
    common: 'CommonResearchMember',
  };
  return m[scope] ?? 'CommonResearchMember';
}

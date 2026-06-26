import type { ContextBlock } from '../../../agent/context-engine/types/context-package.types';
import type {
  DomainInfluenceAgentContextPayload,
  DomainLeaderPrivateConstraintBundle,
  TripDomainInfluenceSnapshot,
} from '../types/trip-domain.types';

function formatWeightLine(
  weights: TripDomainInfluenceSnapshot['domains'][number]['weights'],
): string {
  if (weights.length === 0) return '无认领';
  return weights
    .filter((w) => w.weight > 0)
    .map((w) => `${w.displayName} ${w.weightPercent}%`)
    .join(' · ');
}

export function shouldIncludeDomainInfluenceContext(
  snapshot: TripDomainInfluenceSnapshot,
): boolean {
  if (snapshot.memberCount > 1) return true;
  if (snapshot.rulesConfirmed) return true;
  if (snapshot.balanceWarnings.length > 0) return true;
  return snapshot.domains.some((d) => !d.unclaimed);
}

function buildTeamSummaryText(snapshot: TripDomainInfluenceSnapshot): string {
  const rules = snapshot.rulesConfirmed ? '规则已确认' : '规则未确认';
  const header = `【领域影响力 · 同行 ${snapshot.memberCount} 人 · 认领完成度 ${Math.round(snapshot.completionRate * 100)}% · ${rules}】`;

  const domainLines = snapshot.domains
    .filter((d) => !d.unclaimed || d.decisionRule.crossLevel !== 'low')
    .map((d) => {
      const leader = d.leaderDisplayName ? `主导 ${d.leaderDisplayName}` : '无主导';
      const weights = formatWeightLine(d.weights);
      const cross = d.decisionRule.crossLevel;
      if (d.unclaimed) {
        return `- ${d.domainLabel}: 未认领 · ${d.decisionRule.ruleLabelZh} (${cross})`;
      }
      return `- ${d.domainLabel}: ${leader} · 权重 ${weights} · ${d.decisionRule.ruleLabelZh} (${cross})`;
    });

  const balanceLines =
    snapshot.balanceWarnings.length > 0
      ? [
          '',
          '平衡提醒:',
          ...snapshot.balanceWarnings.map((w) => `- ${w.displayName}: ${w.message}`),
        ]
      : [];

  return [header, ...domainLines, ...balanceLines].filter(Boolean).join('\n');
}

function formatPrivateConstraintLine(
  c: DomainLeaderPrivateConstraintBundle['constraints'][number],
): string {
  const slot = c.memberSlot > 0 ? `成员#${c.memberSlot}` : '成员';
  const mustAvoid = c.structuredHints?.must_avoid;
  const avoidNote =
    Array.isArray(mustAvoid) && mustAvoid.length > 0
      ? ` · 忌 ${mustAvoid.slice(0, 3).join('/')}`
      : '';
  return `- [${slot}·重要度${c.importance}${avoidNote}] ${c.text}`;
}

function buildLeaderPrivateSummaryText(bundles: DomainLeaderPrivateConstraintBundle[]): string {
  if (bundles.length === 0) {
    return '';
  }
  const lines = ['【领域负责人私密约束 · 仅规划参考 · 不暴露具体成员身份】'];
  for (const bundle of bundles) {
    lines.push(`${bundle.domainLabel}:`);
    for (const c of bundle.constraints) {
      lines.push(formatPrivateConstraintLine(c));
    }
  }
  return lines.join('\n');
}

export function buildDomainInfluenceContextBlocks(
  payload: DomainInfluenceAgentContextPayload,
): ContextBlock[] {
  const { tripId, userId, snapshot, leaderPrivateBundles } = payload;
  if (!shouldIncludeDomainInfluenceContext(snapshot)) {
    return [];
  }

  const now = new Date().toISOString();
  const blocks: ContextBlock[] = [];

  const teamText = buildTeamSummaryText(snapshot);
  if (teamText.trim().length > 0) {
    blocks.push({
      key: 'DOMAIN_INFLUENCE_TEAM',
      type: 'DOMAIN_INFLUENCE_TEAM',
      text: teamText,
      priority: 72,
      visibility: 'public',
      provenance: {
        source: 'db',
        identifier: `trip:${tripId}:domain-influence:team`,
        timestamp: now,
      },
      data: {
        memberCount: snapshot.memberCount,
        completionRate: snapshot.completionRate,
        rulesConfirmed: snapshot.rulesConfirmed,
        domainLeaders: snapshot.domains
          .filter((d) => d.leaderUserId)
          .map((d) => ({
            domain: d.domain,
            leaderUserId: d.leaderUserId,
            leaderDisplayName: d.leaderDisplayName,
            crossLevel: d.decisionRule.crossLevel,
          })),
      },
    });
  }

  const privateText = buildLeaderPrivateSummaryText(leaderPrivateBundles);
  if (privateText.trim().length > 0) {
    blocks.push({
      key: `DOMAIN_INFLUENCE_PRIVATE:${userId}`,
      type: 'DOMAIN_INFLUENCE_PRIVATE',
      text: privateText,
      priority: 76,
      visibility: 'private',
      provenance: {
        source: 'db',
        identifier: `trip:${tripId}:domain-influence:private:${userId}`,
        timestamp: now,
      },
      data: {
        domainCount: leaderPrivateBundles.length,
        wishConstraintCount: leaderPrivateBundles.reduce((n, b) => n + b.constraints.length, 0),
      },
    });
  }

  return blocks;
}

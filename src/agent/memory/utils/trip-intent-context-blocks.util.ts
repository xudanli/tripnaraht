import type { ContextBlock } from '../../context-engine/types/context-package.types';
import type { TripIntentDigestBundle } from '../services/trip-intent-digest.service';

function pct(rate: number): number {
  return Math.round(rate * 100);
}

export function buildTripIntentContextBlocks(
  bundle: TripIntentDigestBundle,
  tripId: string,
  userId: string | null,
): ContextBlock[] {
  const blocks: ContextBlock[] = [];
  const now = new Date().toISOString();

  const profiling = bundle.decisionProfilingDigest;
  if (profiling) {
    const lines = [
      `【决策风格画像 · 团队完成 ${profiling.teamCompletionRate}%】`,
      profiling.requestingUserStyleLabel
        ? `- 本人风格: ${profiling.requestingUserStyleLabel}${profiling.requestingUserTeamRole ? `（${profiling.requestingUserTeamRole}）` : ''}`
        : '- 本人风格: 未完成',
      profiling.requestingUserMoneyDnaSummary
        ? `- 本人消费 DNA: ${profiling.requestingUserMoneyDnaSummary}`
        : null,
      profiling.teamStyleLabels.length
        ? `- 团队风格: ${profiling.teamStyleLabels.join(' · ')}`
        : null,
      profiling.highRiskFrictionDomains.length
        ? `- 摩擦预警域: ${profiling.highRiskFrictionDomains.join(' · ')}`
        : null,
      profiling.splitMechanismMode
        ? `- 分摊机制: ${profiling.splitMechanismMode}${profiling.splitMechanismLocked ? '（已锁定）' : ''}`
        : null,
    ].filter(Boolean) as string[];

    blocks.push({
      key: 'TRIP_DECISION_PROFILING',
      type: 'USER_PROFILE',
      text: lines.join('\n'),
      priority: 74,
      visibility: 'private',
      provenance: {
        source: 'db',
        identifier: `trip:${tripId}:decision-profiling:digest`,
        timestamp: now,
      },
      data: { teamCompletionRate: profiling.teamCompletionRate },
    });
  }

  const privateWish = bundle.privateWishDigest;
  if (privateWish && privateWish.items.length > 0) {
    const lines = [
      '【私密愿望清单 · 仅当前用户 · 供规划决策参考】',
      ...privateWish.items.map(
        (w) => `- [${w.category}·重要度${w.importance}] ${w.text}`,
      ),
    ];
    blocks.push({
      key: `TRIP_PRIVATE_WISHLIST:${userId ?? 'unknown'}`,
      type: 'CONSTRAINTS',
      text: lines.join('\n'),
      priority: 77,
      visibility: 'private',
      provenance: {
        source: 'db',
        identifier: `trip:${tripId}:wishlist:private:${userId ?? 'unknown'}`,
        timestamp: now,
      },
      data: { itemCount: privateWish.requestingUserItemCount },
    });
  }

  const negotiation = bundle.negotiationDigest;
  if (negotiation) {
    const lines = ['【协商结果 · 团队治理与三人格博弈】'];
    if (negotiation.collaborativeTasks.length) {
      lines.push('领域协商任务:');
      for (const t of negotiation.collaborativeTasks) {
        lines.push(
          `- ${t.title} (${t.crossLevel}): ${t.statusLabel}${t.leaderDisplayName ? ` · 主导 ${t.leaderDisplayName}` : ''}`,
        );
      }
    }
    if (negotiation.guardianSummary || negotiation.guardianConsensusLevel != null) {
      const cPct =
        negotiation.guardianConsensusLevel != null
          ? pct(negotiation.guardianConsensusLevel)
          : null;
      lines.push(
        `三人格博弈: 共识 ${cPct ?? '—'}%${negotiation.guardianHumanDecisionPointCount ? ` · 待确认 ${negotiation.guardianHumanDecisionPointCount} 项` : ''}`,
      );
      if (negotiation.guardianSummary) {
        lines.push(`摘要: ${negotiation.guardianSummary.slice(0, 400)}`);
      }
    }
    if (negotiation.splitMechanismMode) {
      lines.push(
        `分摊共识: ${negotiation.splitMechanismMode}${negotiation.splitMechanismLocked ? '（全员锁定）' : ''}`,
      );
    }

    blocks.push({
      key: 'TRIP_NEGOTIATION_OUTCOMES',
      type: 'METADATA',
      text: lines.join('\n'),
      priority: 73,
      visibility: 'public',
      provenance: {
        source: 'db',
        identifier: `trip:${tripId}:negotiation:digest`,
        timestamp: now,
      },
      data: {
        taskCount: negotiation.collaborativeTasks.length,
        guardianConsensusLevel: negotiation.guardianConsensusLevel,
      },
    });
  }

  const domain = bundle.domainInfluenceDigest;
  if (domain) {
    const domainLines = domain.domains
      .filter((d) => !d.unclaimed || d.crossLevel !== 'low')
      .map((d) => {
        const leader = d.leaderUserId ? `主导权重 ${d.leaderWeightPercent ?? 0}%` : '无主导';
        return `- ${d.domainLabel}: ${leader} · 交叉 ${d.crossLevel}`;
      });
    if (domainLines.length) {
      blocks.push({
        key: 'TRIP_DOMAIN_INFLUENCE_DIGEST',
        type: 'DOMAIN_INFLUENCE_TEAM',
        text: [
          `【领域影响力摘要 · ${domain.memberCount} 人 · 认领 ${pct(domain.completionRate)}% · ${domain.rulesConfirmed ? '规则已确认' : '规则未确认'}】`,
          ...domainLines,
        ].join('\n'),
        priority: 72,
        visibility: 'public',
        provenance: {
          source: 'db',
          identifier: `trip:${tripId}:domain-influence:digest`,
          timestamp: now,
        },
        data: { memberCount: domain.memberCount },
      });
    }
  }

  const wish = bundle.wishConstraintDigest;
  if (wish && (wish.mustDo.length || wish.mustAvoid.length)) {
    blocks.push({
      key: 'TRIP_WISH_CONSTRAINTS',
      type: 'CONSTRAINTS',
      text: [
        '【愿望结构化约束】',
        wish.mustDo.length ? `必做: ${wish.mustDo.join(' · ')}` : null,
        wish.mustAvoid.length ? `忌: ${wish.mustAvoid.join(' · ')}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      priority: 71,
      visibility: 'public',
      provenance: {
        source: 'db',
        identifier: `trip:${tripId}:wish-constraints:digest`,
        timestamp: now,
      },
      data: {
        teamActiveCount: wish.teamActiveCount,
        privateActiveCount: wish.privateActiveCount,
      },
    });
  }

  return blocks;
}

export function formatTripIntentDigestPromptInjection(
  bundle: TripIntentDigestBundle,
): string | null {
  const blocks = buildTripIntentContextBlocks(bundle, 'trip', null);
  if (!blocks.length) return null;
  const parts = blocks.map((b) => b.text.trim()).filter(Boolean);
  if (!parts.length) return null;
  return [
    '[系统注入·行程意图与协商上下文（仅供决策参考；勿向用户复述「系统注入」字样）]',
    ...parts,
  ].join('\n');
}

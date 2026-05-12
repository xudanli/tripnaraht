/**
 * Neptune Step 1：将经济学批准的迁移意图物化为结构化提案（不落库、不改 plan）。
 */

import type { OpportunityMigrationEvaluation } from '../opportunity/opportunity-migration.types';
import type { ProposedCorridorMigration } from './proposed-corridor-migration.types';
import { proposalStableHash } from './simulate-corridor-migration';

export interface MaterializeCorridorMigrationsOptions {
  /** 仅物化该 recommendation（默认仅 MIGRATE） */
  requireRecommendation?: 'MIGRATE' | 'STAY';
}

/**
 * 按 source→target 合并多日评估；仅包含经济学已批准（recommendation === MIGRATE）的项。
 */
export function materializeProposedCorridorMigrations(
  evaluations: OpportunityMigrationEvaluation[] | undefined,
  options?: MaterializeCorridorMigrationsOptions,
): ProposedCorridorMigration[] {
  const req = options?.requireRecommendation ?? 'MIGRATE';
  const approved = (evaluations ?? []).filter(e => e.recommendation === req);
  if (approved.length === 0) {
    return [];
  }

  const groups = new Map<
    string,
    { dates: Set<string>; rationale: string[]; best: OpportunityMigrationEvaluation }
  >();

  for (const ev of approved) {
    const key = `${ev.sourceRegion}->${ev.targetRegion}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        dates: new Set([ev.date]),
        rationale: [...ev.rationale],
        best: ev,
      });
    } else {
      g.dates.add(ev.date);
      g.rationale.push(...ev.rationale);
      if (ev.tradeoffScore > g.best.tradeoffScore) {
        g.best = ev;
      }
    }
  }

  const out: ProposedCorridorMigration[] = [];
  for (const [corridor, g] of groups) {
    const [sourceRegion, targetRegion] = corridor.split('->');
    const affectedDates = [...g.dates].sort();
    const proposalId = `pcm_${proposalStableHash({
      sourceRegion,
      targetRegion,
      dates: affectedDates,
    })}`;

    out.push({
      proposalId,
      sourceRegion,
      targetRegion,
      affectedDates,
      rationale: Array.from(new Set(g.rationale)),
      economicApproval: {
        tradeoffScore: g.best.tradeoffScore,
        threshold: g.best.appliedThreshold,
      },
      expectedOpportunityGain: g.best.expectedOpportunityGain,
    });
  }

  return out.sort((a, b) => {
    const ga =
      b.economicApproval.tradeoffScore - a.economicApproval.tradeoffScore;
    if (ga !== 0) {
      return ga;
    }
    return a.proposalId.localeCompare(b.proposalId);
  });
}

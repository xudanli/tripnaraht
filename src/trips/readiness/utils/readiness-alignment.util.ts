/**
 * 校验 /score 与 /insight 准备度字段是否一致（供单测与 E2E 脚本共用）
 */

export interface ReadinessScoreSnapshot {
  overall?: number;
  blockers?: number;
  must?: number;
  should?: number;
}

export interface ReadinessInsightSnapshot {
  overall?: number;
  blockers?: number;
  must?: number;
  should?: number;
  status?: 'pass' | 'warn' | 'block' | string;
}

export function deriveReadinessStatusFromScore(
  blockers: number,
  must: number,
  overall: number,
): 'pass' | 'warn' | 'block' {
  if (blockers > 0) {
    return 'block';
  }
  if (must > 0 || overall < 70) {
    return 'warn';
  }
  return 'pass';
}

export function assertReadinessScoreInsightAlignment(
  score: ReadinessScoreSnapshot,
  insight: ReadinessInsightSnapshot,
): { aligned: boolean; mismatches: string[] } {
  const mismatches: string[] = [];

  const numericPairs: Array<[keyof ReadinessScoreSnapshot, keyof ReadinessInsightSnapshot]> = [
    ['overall', 'overall'],
    ['blockers', 'blockers'],
    ['must', 'must'],
    ['should', 'should'],
  ];

  for (const [scoreKey, insightKey] of numericPairs) {
    const scoreValue = score[scoreKey];
    const insightValue = insight[insightKey];
    if (
      scoreValue !== undefined &&
      insightValue !== undefined &&
      scoreValue !== insightValue
    ) {
      mismatches.push(`${String(scoreKey)}: score=${scoreValue} insight=${insightValue}`);
    }
  }

  if (
    insight.status &&
    score.blockers !== undefined &&
    score.must !== undefined &&
    score.overall !== undefined
  ) {
    const expected = deriveReadinessStatusFromScore(
      score.blockers,
      score.must,
      score.overall,
    );
    if (insight.status !== expected) {
      mismatches.push(`status: expected=${expected} insight=${insight.status}`);
    }
  }

  return { aligned: mismatches.length === 0, mismatches };
}

/** Format Iceland self-drive causal assessment for product UI (zh). */

export function formatMinutesZh(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m} 分`;
  if (m <= 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分`;
}

export function formatIcelandSelfDriveAssessment(input: {
  routeLabel: string;
  windMps: number;
  windWindowLabel?: string;
  baseDurationMinutes: number;
  p90Minutes: number;
  missProbability: number;
  missProbabilityAfterShift?: number;
  shiftMinutes?: number;
  recommendedRationale?: string;
}): string {
  const windPart = input.windWindowLabel
    ? `${input.windWindowLabel}阵风预计较强（约 ${input.windMps.toFixed(0)} m/s）`
    : `预计风速约 ${input.windMps.toFixed(0)} m/s`;

  const etaPart = `按照当前车型和路况，${input.routeLabel} 的 P90 行驶时间约为 ${formatMinutesZh(input.p90Minutes)}（基准 ${formatMinutesZh(input.baseDurationMinutes)}）`;

  const missPct = Math.round(input.missProbability * 100);
  const missPart = `保持当前出发时间，错过集合/预约的概率约为 ${missPct}%`;

  const parts = [windPart + '。', etaPart + '。', missPart + '。'];

  if (input.shiftMinutes && input.shiftMinutes > 0) {
    const afterPct =
      input.missProbabilityAfterShift != null
        ? Math.round(input.missProbabilityAfterShift * 100)
        : undefined;
    parts.push(
      afterPct != null
        ? `若提前 ${input.shiftMinutes} 分钟出发，错过概率可降至约 ${afterPct}%。`
        : `最小干预建议将出发时间提前 ${input.shiftMinutes} 分钟。`,
    );
  } else if (input.recommendedRationale) {
    parts.push(input.recommendedRationale + '。');
  }

  return parts.join('');
}

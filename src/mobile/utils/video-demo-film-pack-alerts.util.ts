/**
 * 拍摄 Demo（镜头 5–14）硬快路径：只读 trip.metadata.videoDemoFilmPack，
 * 不跑 listRisks / attention / feasibility，避免高负载超时后落成空/错误 legacy 预警。
 */
import type { ExecutionAlertsDto, ExecutionAlertDto } from '../dto/mobile-execution.types';
import { EXECUTION_ALERTS_SCHEMA_V2_ID } from '../dto/mobile-execution.types';

export type VideoDemoFilmPack = {
  schema?: string;
  seededAt?: string;
  environmentEventId?: string;
  /** 与 ERC deriveRiskId 对齐；缺省时用 event 派生占位 */
  riskId?: string;
  conclusionZh?: string;
  conclusionTone?: string;
  anchors?: {
    windLabel?: string;
    vehicle?: string;
    navEtaLocal?: string;
    checkInDeadlineLocal?: string;
    bufferMinutes?: number;
    continuousDriveLabel?: string;
    loadLevel?: string;
    companion?: string;
  };
  options?: Array<{
    label?: string;
    planId?: string;
    name?: string;
    recommended?: boolean;
  }>;
  recommendedOption?: string;
  causalChain?: { main?: string[]; auxiliary?: string[] };
};

export function extractVideoDemoFilmPack(metadata: unknown): VideoDemoFilmPack | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const pack = (metadata as Record<string, unknown>).videoDemoFilmPack;
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) return null;
  const p = pack as VideoDemoFilmPack;
  if (!p.conclusionZh && !p.environmentEventId) return null;
  return p;
}

export function buildVideoDemoFilmPackExecutionAlerts(input: {
  tripId: string;
  contextVersion: number;
  pack: VideoDemoFilmPack;
}): ExecutionAlertsDto {
  const { tripId, contextVersion, pack } = input;
  const a = pack.anchors ?? {};
  const recommended =
    pack.options?.find((o) => o.recommended) ??
    pack.options?.find((o) => o.label === pack.recommendedOption) ??
    pack.options?.[0];
  const recName = recommended?.name ?? '替换附近室内活动后加油并前往酒店';
  const riskId =
    pack.riskId?.trim() ||
    (pack.environmentEventId
      ? `risk_film_${pack.environmentEventId.replace(/-/g, '').slice(0, 16)}`
      : `risk_film_${tripId.slice(0, 8)}`);
  const recommendationIds = (pack.options ?? [])
    .map((o) => o.planId)
    .filter((id): id is string => Boolean(id))
    .map((planId) =>
      pack.environmentEventId
        ? `env-rec-${pack.environmentEventId}-${planId}`
        : `film-rec-${planId}`,
    );

  const reasonParts = [
    a.windLabel && a.vehicle ? `${a.windLabel} × ${a.vehicle}` : a.windLabel ?? a.vehicle,
    a.navEtaLocal && a.checkInDeadlineLocal
      ? `ETA ${a.navEtaLocal} / 签到 ${a.checkInDeadlineLocal}${
          a.bufferMinutes != null ? `（缓冲 ${a.bufferMinutes} 分钟）` : ''
        }`
      : null,
    a.continuousDriveLabel ? `连续驾驶 ${a.continuousDriveLabel}` : null,
    a.loadLevel,
    a.companion,
  ].filter(Boolean);

  const primary: ExecutionAlertDto = {
    id: riskId,
    riskId,
    riskLevel: 'MEDIUM',
    executionGate: 'AT_RISK',
    presentationRole: 'PRIMARY',
    riskType: 'ENVIRONMENT',
    level: 'AT_RISK',
    // 活跃风险：已出现的强风（结论「稳定性下降」放在 aiRecommendation.headline）
    title: a.windLabel
      ? `斯科加瀑布 → 雷尼斯黑沙滩签到：强风预警${a.windLabel}，不建议按原计划出发`
      : '斯科加瀑布 → 雷尼斯黑沙滩签到：强风预警，不建议按原计划出发',
    reason: reasonParts.join('；') || '阵风与高车身叠加后原计划稳定性下降',
    recommendedAction: `推荐${recName}`,
    impact: 'weather · yellow',
    affectedRoute: '斯科加瀑布 → 雷尼斯黑沙滩签到',
    affectedActivities: ['斯科加瀑布', '雷尼斯黑沙滩签到'],
    evidenceRefs: pack.environmentEventId ? [pack.environmentEventId] : [],
    observedAt: pack.seededAt ?? new Date().toISOString(),
    requiresImmediateAttention: false,
    recommendationIds,
    decisionProblemIds: [],
    causalChain: pack.causalChain?.main?.length
      ? {
          headline: pack.conclusionZh ?? '原计划稳定性下降',
          assessment: (pack.causalChain.main ?? []).join(' → '),
          nodes: (pack.causalChain.main ?? []).map((title, i) => ({
            nodeId: `film_node_${i}`,
            type: i === 0 ? 'WORLD_CHANGE' : i < 3 ? 'IMPACT' : 'OUTCOME',
            title,
            description: title,
          })),
          recommendedOption: recommended?.planId
            ? {
                optionId: recommended.planId,
                summary: recName,
                expectedImprovement: '安全 / 时间 / 体验更均衡',
              }
            : undefined,
        }
      : undefined,
  };

  return {
    schemaId: EXECUTION_ALERTS_SCHEMA_V2_ID,
    tripId,
    contextVersion,
    projectionSource: 'execution_risk_center',
    requiredAction: 'ACKNOWLEDGE',
    primaryRisk: primary,
    impacts: [],
    independentRisks: [],
    alerts: [],
    aiRecommendation: {
      title: `推荐${recName}`,
      detail:
        '阵风18m/s+ × 高车身露营车使安全车速下降，名义 ETA 仍卡在签到前 10 分钟缓冲内；推荐替换室内活动后加油前往酒店。',
      headline: pack.conclusionZh ?? '原计划稳定性下降',
      evidenceIds: pack.environmentEventId ? [pack.environmentEventId] : [],
      basedOnRiskIds: [riskId],
    },
  };
}

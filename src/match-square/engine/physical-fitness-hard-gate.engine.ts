import { isPremiumTrekkingScriptId } from '../config/premium-trekking.config';
import {
  PHYSICAL_TIER_HARD_INTERCEPT_MIN,
  ROUTE_PHYSICAL_BY_SCRIPT,
  formatPhysicalHardGateSummary,
  physicalHardGateMicroHint,
} from '../config/physical-tier.config';
import type {
  PhysicalFitnessFitReportView,
  PhysicalFitnessGateView,
  RoutePhysicalProfile,
  TrekkingFitnessBaseline,
} from '../types/physical-fitness-gate.types';

export function resolveRoutePhysicalProfile(
  scriptId: string | null | undefined,
): RoutePhysicalProfile | null {
  if (!scriptId || !isPremiumTrekkingScriptId(scriptId)) return null;
  return ROUTE_PHYSICAL_BY_SCRIPT[scriptId] ?? null;
}

function ratioFit(applicant: number, required: number, threshold: number): number {
  if (required <= 0) return 100;
  const need = required * threshold;
  return Math.min(100, Math.round((applicant / need) * 100));
}

function buildFitReport(
  route: RoutePhysicalProfile,
  applicant: TrekkingFitnessBaseline,
): PhysicalFitnessFitReportView {
  const threshold = route.interceptThresholdRatio;
  const ascentFit = ratioFit(applicant.maxDailyAscentM, route.maxDailyAscentM, threshold);
  const altFit = ratioFit(applicant.maxAltitudeM, route.maxAltitudeM, threshold);
  const packFit = ratioFit(applicant.maxPackWeightKg, route.maxPackWeightKg, threshold);

  const lines: PhysicalFitnessFitReportView['lines'] = [
    {
      status: ascentFit >= 100 ? 'ok' : ascentFit >= 80 ? 'warn' : 'fail',
      label: '历史最大单日爬升',
      detail: `申请人 ${applicant.maxDailyAscentM}m / 路线需 ≥${Math.round(route.maxDailyAscentM * threshold)}m（${ascentFit}%）`,
    },
    {
      status: altFit >= 100 ? 'ok' : altFit >= 80 ? 'warn' : 'fail',
      label: '历史最高海拔',
      detail: `申请人 ${applicant.maxAltitudeM}m / 路线需 ≥${Math.round(route.maxAltitudeM * threshold)}m（${altFit}%）`,
    },
    {
      status:
        !route.requiresHeavyPackCamping || applicant.heavyPackCampingVerified || packFit >= 100
          ? 'ok'
          : packFit >= 80
            ? 'warn'
            : 'fail',
      label: '重装负重与扎营',
      detail: route.requiresHeavyPackCamping
        ? applicant.heavyPackCampingVerified
          ? `已认证重装扎营记录 · 负重峰值 ${applicant.maxPackWeightKg}kg`
          : `负重峰值 ${applicant.maxPackWeightKg}kg / 需 ≥${Math.round(route.maxPackWeightKg * threshold)}kg 或重装扎营认证`
        : `轻装路线 · 峰值负重 ${applicant.maxPackWeightKg}kg`,
    },
  ];

  if (applicant.recentAerobicSessions30d < 4) {
    lines.push({
      status: applicant.recentAerobicSessions30d === 0 ? 'warn' : 'warn',
      label: '近 30 天有氧带宽',
      detail:
        applicant.recentAerobicSessions30d === 0
          ? '近期运动量极低，高海拔重装下核心耐力风险偏高'
          : `近 30 天有氧 ${applicant.recentAerobicSessions30d} 次，建议 ≥4 次后再申请 Level 4`,
    });
  }

  const coreScores = [ascentFit, altFit, packFit];
  if (route.requiresHeavyPackCamping && !applicant.heavyPackCampingVerified) {
    coreScores.push(packFit);
  }
  const fitPercent = Math.min(...coreScores);

  const hardwareNotes: string[] = [];
  if (route.tier >= 4 && applicant.heavyPackCampingVerified) {
    hardwareNotes.push('特征矩阵显示具备重装扎营与失温对抗经验，可匹配公摊装备缺位。');
  }

  return {
    fitPercent,
    headline:
      fitPercent >= 100
        ? `体能拟合度 ${fitPercent}%（物理约束完全匹配）`
        : fitPercent >= 80
          ? `体能拟合度 ${fitPercent}%（临界匹配，建议队长复核）`
          : `体能拟合度 ${fitPercent}%（低于安全阈值）`,
    lines,
    evidenceLabel: applicant.evidenceLabel ?? null,
    hardwareNotes,
  };
}

/**
 * PRD 3.14 Layer 0 — 体能三维硬约束（爬升 / 海拔负重 / 重装扎营）
 * Level 4+ 未达标 → 隐性熔断，申请不到达队长审批。
 */
export function evaluatePhysicalFitnessHardGate(input: {
  scriptId: string | null | undefined;
  applicant: TrekkingFitnessBaseline;
}): PhysicalFitnessGateView {
  const route = resolveRoutePhysicalProfile(input.scriptId);
  if (!route) {
    return {
      active: false,
      blocked: false,
      blockReason: null,
      routeTier: null,
      routeTierLabel: null,
      hardGateSummaryLine: null,
      hardGateHint: null,
      fitPercent: null,
      report: null,
    };
  }

  const report = buildFitReport(route, input.applicant);
  const hardIntercept = route.tier >= PHYSICAL_TIER_HARD_INTERCEPT_MIN;
  const threshold = route.interceptThresholdRatio;

  const ascentOk = input.applicant.maxDailyAscentM >= route.maxDailyAscentM * threshold;
  const altOk = input.applicant.maxAltitudeM >= route.maxAltitudeM * threshold;
  const packOk =
    !route.requiresHeavyPackCamping ||
    input.applicant.heavyPackCampingVerified ||
    input.applicant.maxPackWeightKg >= route.maxPackWeightKg * threshold;

  const blocked =
    hardIntercept && (!ascentOk || !altOk || !packOk || report.fitPercent < 80);

  const blockReason = blocked
    ? `检测到该路线物理强度（${route.tierLabel}）与你当前特征矩阵不匹配。为了安全，建议先完成同级烈度行程或选择 Level 2 休闲路线。`
    : null;

  return {
    active: true,
    blocked,
    blockReason,
    routeTier: route.tier,
    routeTierLabel: route.tierLabel,
    hardGateSummaryLine: formatPhysicalHardGateSummary(route),
    hardGateHint: physicalHardGateMicroHint(route.tier),
    fitPercent: report.fitPercent,
    report: blocked ? null : report,
  };
}

export function buildPostPhysicalHardGateLines(scriptId: string | null | undefined): string[] {
  const route = resolveRoutePhysicalProfile(scriptId);
  if (!route) return [];
  const lines = [formatPhysicalHardGateSummary(route)];
  const hint = physicalHardGateMicroHint(route.tier);
  if (hint) lines.push(hint);
  return lines;
}

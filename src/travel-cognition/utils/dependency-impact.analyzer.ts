/**
 * 依赖图级联影响分析 — 非交易型重规划（只分析 + 建议，不代订）。
 */

import {
  DEFAULT_DEBARK_BUFFER_MINUTES,
  DEFAULT_TRANSFER_SLACK_MINUTES,
  FLIGHT_CASCADE_GRAPH_VERSION,
  FLIGHT_CASCADE_RELATIONS_V0,
} from '../graphs/flight-cascade-graph.v0';
import { withCascadeHop } from './cascade-confidence.util';
import {
  computeReachabilityImpact,
  computeTimeImpact,
  computeTransferSlipImpact,
  maxImpactRisk,
} from './impact-algebra.util';
import type { EvidenceEnvelope } from '../types/evidence-envelope.types';
import type {
  ImpactRecommendationKind,
  ImpactRiskLevel,
  TravelDependencyImpact,
} from '../types/dependency-graph.types';
import type { TravelEntityRef } from '../types/travel-entity-ref.types';
import {
  buildDefaultCoverageDisclosure,
  DEFAULT_NON_TRANSACTION_DISCLOSURE_ZH,
} from '../types/coverage-disclosure.types';
import type { NonTransactionalReplanResult } from '../types/travel-entity-graph.types';
import type { TripDependencyChainNode } from './trip-dependency-chain.util';
import { assessEvidenceFreshness } from '../types/evidence-envelope.types';
import {
  analyzeRoadClosureCascade,
  analyzeWeatherWindowCascade,
  getIcelandCascadeGraphVersion,
  isFroadRoadStatus,
  type RoadStatusValue,
  type WeatherWindowValue,
} from './iceland-dependency-impact.analyzer';

export interface FlightStatusValue {
  status?: 'ON_TIME' | 'DELAYED' | 'CANCELLED' | 'DIVERTED' | 'UNKNOWN' | string;
  scheduledArrival?: string;
  estimatedArrival?: string;
  delayMinutes?: number;
  flightNumber?: string;
}

export interface AnalyzeFlightDelayCascadeInput {
  trigger: EvidenceEnvelope<FlightStatusValue>;
  chain: TripDependencyChainNode[];
  locale?: 'zh' | 'en';
  debarkBufferMinutes?: number;
  transferSlackMinutes?: number;
  nowMs?: number;
}

function parseMs(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : undefined;
}

function maxRisk(a: ImpactRiskLevel, b: ImpactRiskLevel): ImpactRiskLevel {
  const order: ImpactRiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function resolveEffectiveArrivalMs(
  flight: FlightStatusValue,
  fallbackPlannedMs: number,
): { arrivalMs: number; delayMinutes: number; cancelled: boolean } {
  const scheduledMs = parseMs(flight.scheduledArrival) ?? fallbackPlannedMs;
  const status = String(flight.status ?? 'UNKNOWN').toUpperCase();
  const cancelled = status === 'CANCELLED' || status === 'DIVERTED';

  let delayMinutes = Number(flight.delayMinutes ?? 0);
  if (!Number.isFinite(delayMinutes) || delayMinutes < 0) delayMinutes = 0;

  const estimatedMs = parseMs(flight.estimatedArrival);
  let arrivalMs = estimatedMs ?? scheduledMs + delayMinutes * 60_000;
  if (status === 'DELAYED' && delayMinutes === 0 && estimatedMs) {
    delayMinutes = Math.max(0, Math.round((estimatedMs - scheduledMs) / 60_000));
  }
  if (status === 'ON_TIME' && !estimatedMs && delayMinutes === 0) {
    arrivalMs = scheduledMs;
  }

  return { arrivalMs, delayMinutes, cancelled };
}

function recommendationForRisk(
  risk: ImpactRiskLevel,
  cancelled: boolean,
): ImpactRecommendationKind {
  if (cancelled || risk === 'CRITICAL') return 'ASK_USER';
  if (risk === 'HIGH') return 'ADJUST';
  if (risk === 'MEDIUM') return 'DELAY';
  return 'DELAY';
}

function buildImpactNode(params: {
  entityRef: TravelEntityRef;
  riskLevel: ImpactRiskLevel;
  message: string;
  recommendation: ImpactRecommendationKind;
  userConfirmationRequired?: string[];
  rootConfidence: number;
  hopDepth: number;
  netImpactMinutes?: number;
  absorbedMinutes?: number;
}) {
  return withCascadeHop(
    {
      entityRef: params.entityRef,
      riskLevel: params.riskLevel,
      message: params.message,
      recommendation: params.recommendation,
      userConfirmationRequired: params.userConfirmationRequired,
      ...(params.netImpactMinutes !== undefined ? { netImpactMinutes: params.netImpactMinutes } : {}),
      ...(params.absorbedMinutes !== undefined ? { absorbedMinutes: params.absorbedMinutes } : {}),
    },
    params.rootConfidence,
    params.hopDepth,
  );
}

/**
 * 分析航班状态变化对接驳 / 入住 / 当日计划的级联影响。
 */
export function analyzeFlightDelayCascade(
  input: AnalyzeFlightDelayCascadeInput,
): TravelDependencyImpact {
  const locale = input.locale ?? 'zh';
  const debarkBuffer = input.debarkBufferMinutes ?? DEFAULT_DEBARK_BUFFER_MINUTES;
  const transferSlack = input.transferSlackMinutes ?? DEFAULT_TRANSFER_SLACK_MINUTES;
  const flightNode = input.chain.find((n) => n.role === 'flight');
  const rootEntity = flightNode?.entityRef ?? input.trigger.entityRef;

  const flightValue = (input.trigger.value ?? {}) as FlightStatusValue;
  const plannedFlightMs = parseMs(flightNode?.plannedTime) ?? parseMs(input.trigger.observedAt) ?? Date.now();
  const { arrivalMs, delayMinutes, cancelled } = resolveEffectiveArrivalMs(flightValue, plannedFlightMs);

  const freshness = assessEvidenceFreshness(input.trigger, input.nowMs);
  const rootConfidence = freshness.strongJudgmentAllowed
    ? input.trigger.confidence
    : input.trigger.confidence * 0.7;
  const staleNote = !freshness.strongJudgmentAllowed
    ? locale === 'zh'
      ? '（航班状态数据可能已过期，以下影响仅供参考）'
      : ' (flight status may be stale; impact is indicative only)'
    : '';

  const affected: TravelDependencyImpact['affected'] = [];
  let projectedMs = arrivalMs + debarkBuffer * 60_000;
  let cascadeRisk: ImpactRiskLevel = cancelled ? 'CRITICAL' : delayMinutes >= 120 ? 'HIGH' : delayMinutes >= 45 ? 'MEDIUM' : 'LOW';

  if (cancelled) {
    const downstream = input.chain.filter((n) => n.role !== 'flight');
    for (let i = 0; i < downstream.length; i++) {
      const node = downstream[i];
      affected.push(
        buildImpactNode({
          entityRef: node.entityRef,
          riskLevel: 'CRITICAL',
          message:
            locale === 'zh'
              ? `航班取消/改降，${node.label ?? node.role} 可能无法按原计划执行${staleNote}`
              : `Flight cancelled/diverted; ${node.label ?? node.role} likely affected${staleNote}`,
          recommendation: 'ASK_USER',
          userConfirmationRequired:
            locale === 'zh'
              ? ['请自行确认改签/退票', '请自行联系酒店延迟入住']
              : ['Confirm rebooking/cancellation yourself', 'Contact hotel for late check-in yourself'],
          rootConfidence,
          hopDepth: i + 1,
        }),
      );
    }

    return {
      rootEntity,
      rootFactType: 'FLIGHT_STATUS',
      affected,
      rootConfidence,
      coverageHint: DEFAULT_NON_TRANSACTION_DISCLOSURE_ZH,
    };
  }

  if (delayMinutes <= 0 && String(flightValue.status ?? '').toUpperCase() === 'ON_TIME') {
    return {
      rootEntity,
      rootFactType: 'FLIGHT_STATUS',
      affected: [],
      rootConfidence,
      coverageHint: DEFAULT_NON_TRANSACTION_DISCLOSURE_ZH,
    };
  }

  const transferNode = input.chain.find((n) => n.role === 'transfer');
  if (transferNode) {
    const plannedTransferMs = parseMs(transferNode.plannedTime)!;
    const missByMin = Math.max(0, Math.round((projectedMs - plannedTransferMs) / 60_000));
    const transferImpact =
      missByMin > 0
        ? computeTransferSlipImpact({
            missByMinutes: missByMin,
            transferSlackMinutes: transferSlack,
          })
        : null;

    if (transferImpact) {
      const risk = transferImpact.riskLevel;
      cascadeRisk = maxRisk(cascadeRisk, risk);
      affected.push(
        buildImpactNode({
          entityRef: transferNode.entityRef,
          riskLevel: risk,
          message:
            locale === 'zh'
              ? `航班延误 ${delayMinutes} 分钟，接驳净影响约 ${transferImpact.netImpactMinutes} 分钟（buffer 已吸收 ${transferImpact.absorbedMinutes} 分钟）${staleNote}`
              : `Flight delayed ${delayMinutes}m; transfer net impact ~${transferImpact.netImpactMinutes}m (buffer absorbed ${transferImpact.absorbedMinutes}m)${staleNote}`,
          recommendation: recommendationForRisk(risk, false),
          userConfirmationRequired:
            locale === 'zh' ? ['请自行确认接驳/用车是否可改期'] : ['Confirm ground transfer changes yourself'],
          rootConfidence,
          hopDepth: 1,
          netImpactMinutes: transferImpact.netImpactMinutes,
          absorbedMinutes: transferImpact.absorbedMinutes,
        }),
      );
    }
    projectedMs = Math.max(projectedMs, plannedTransferMs) + (transferNode.durationMinutes ?? 45) * 60_000 + transferSlack * 60_000;
  } else {
    projectedMs += 45 * 60_000;
  }

  const checkInNode = input.chain.find((n) => n.role === 'check_in');
  if (checkInNode) {
    const plannedCheckInMs = parseMs(checkInNode.plannedTime)!;
    const reachability = computeReachabilityImpact({
      detourMinutes: 0,
      deadlineMs: plannedCheckInMs,
      projectedArrivalMs: projectedMs,
    });
    const lateImpact = !reachability.reachable
      ? computeTimeImpact({
          disturbanceMinutes: reachability.netImpactMinutes,
          bufferMinutes: 15,
        })
      : null;

    if (lateImpact && !lateImpact.fullyAbsorbed) {
      const risk = maxImpactRisk(lateImpact.riskLevel, reachability.riskLevel);
      cascadeRisk = maxRisk(cascadeRisk, risk);
      affected.push(
        buildImpactNode({
          entityRef: checkInNode.entityRef,
          riskLevel: risk,
          message:
            locale === 'zh'
              ? `预计晚 ${lateImpact.netImpactMinutes} 分钟抵达入住点（15 分钟容忍已计入）${staleNote}`
              : `Estimated ${lateImpact.netImpactMinutes}m late for check-in (15m grace applied)${staleNote}`,
          recommendation: lateImpact.netImpactMinutes > 15 ? 'ASK_USER' : 'DELAY',
          userConfirmationRequired:
            lateImpact.netImpactMinutes > 15
              ? locale === 'zh'
                ? ['请自行联系酒店确认延迟入住']
                : ['Contact hotel to confirm late check-in yourself']
              : undefined,
          rootConfidence,
          hopDepth: 2,
          netImpactMinutes: lateImpact.netImpactMinutes,
          absorbedMinutes: lateImpact.absorbedMinutes,
        }),
      );
    }
    projectedMs = Math.max(projectedMs, plannedCheckInMs + 30 * 60_000);
  }

  const dayPlanNode = input.chain.find((n) => n.role === 'day_plan');
  if (dayPlanNode) {
    const plannedActivityMs = parseMs(dayPlanNode.plannedTime)!;
    const dayReach = computeReachabilityImpact({
      detourMinutes: 0,
      deadlineMs: plannedActivityMs,
      projectedArrivalMs: projectedMs,
    });
    const dayImpact = !dayReach.reachable
      ? computeTimeImpact({ disturbanceMinutes: dayReach.netImpactMinutes, bufferMinutes: 0 })
      : null;

    if (dayImpact && dayImpact.netImpactMinutes > 0) {
      const risk = maxImpactRisk(dayImpact.riskLevel, dayReach.riskLevel);
      cascadeRisk = maxRisk(cascadeRisk, risk);
      affected.push(
        buildImpactNode({
          entityRef: dayPlanNode.entityRef,
          riskLevel: risk,
          message:
            locale === 'zh'
              ? `当日首项活动可能推迟约 ${dayImpact.netImpactMinutes} 分钟，建议压缩或调整顺序${staleNote}`
              : `First activity may start ~${dayImpact.netImpactMinutes}m late; consider reordering${staleNote}`,
          recommendation: risk === 'HIGH' ? 'REPLACE' : 'ADJUST',
          rootConfidence,
          hopDepth: 3,
          netImpactMinutes: dayImpact.netImpactMinutes,
        }),
      );
    }
  }

  if (affected.length === 0 && delayMinutes > 0) {
    affected.push(
      buildImpactNode({
        entityRef: rootEntity,
        riskLevel: cascadeRisk,
        message:
          locale === 'zh'
            ? `航班延误 ${delayMinutes} 分钟，当前行程链未检测到明显下游冲突${staleNote}`
            : `Flight delayed ${delayMinutes}m; no downstream conflicts detected in chain${staleNote}`,
        recommendation: 'DELAY',
        rootConfidence,
        hopDepth: 0,
      }),
    );
  }

  return {
    rootEntity,
    rootFactType: 'FLIGHT_STATUS',
    affected,
    rootConfidence,
    coverageHint: DEFAULT_NON_TRANSACTION_DISCLOSURE_ZH,
  };
}

export function buildNonTransactionalReplanResult(input: {
  tripId?: string;
  trigger: EvidenceEnvelope;
  chain: TripDependencyChainNode[];
  locale?: 'zh' | 'en';
  nowMs?: number;
}): NonTransactionalReplanResult {
  let impact: TravelDependencyImpact;
  let graphVersion: string = FLIGHT_CASCADE_GRAPH_VERSION;

  switch (input.trigger.factType) {
    case 'FLIGHT_STATUS':
      impact = analyzeFlightDelayCascade({
        trigger: input.trigger as EvidenceEnvelope<FlightStatusValue>,
        chain: input.chain,
        locale: input.locale,
        nowMs: input.nowMs,
      });
      graphVersion = FLIGHT_CASCADE_GRAPH_VERSION;
      break;
    case 'ROAD': {
      const roadValue = (input.trigger.value ?? {}) as RoadStatusValue;
      impact = analyzeRoadClosureCascade({
        trigger: input.trigger as EvidenceEnvelope<RoadStatusValue>,
        chain: input.chain,
        locale: input.locale,
        nowMs: input.nowMs,
      });
      graphVersion = getIcelandCascadeGraphVersion('ROAD', isFroadRoadStatus(roadValue));
      break;
    }
    case 'WEATHER':
      impact = analyzeWeatherWindowCascade({
        trigger: input.trigger as EvidenceEnvelope<WeatherWindowValue>,
        chain: input.chain,
        locale: input.locale,
        nowMs: input.nowMs,
      });
      graphVersion = getIcelandCascadeGraphVersion('WEATHER');
      break;
    default:
      impact = {
        rootEntity: input.trigger.entityRef,
        rootFactType: input.trigger.factType,
        affected: [],
        coverageHint: DEFAULT_NON_TRANSACTION_DISCLOSURE_ZH,
      };
  }

  const coveredFactTypes = [
    input.trigger.factType,
    ...impact.affected.map(() => 'TRANSPORT_TIME' as const),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  return {
    tripId: input.tripId,
    trigger: input.trigger,
    impact,
    coverage: buildDefaultCoverageDisclosure({
      coveredFactTypes,
      sourcesUsed: [input.trigger.source, graphVersion],
      locale: input.locale,
    }),
    analyzedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
  };
}

export function getFlightCascadeRelationTemplates() {
  return FLIGHT_CASCADE_RELATIONS_V0;
}

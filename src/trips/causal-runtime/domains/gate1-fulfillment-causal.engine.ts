/**
 * P4 — Readiness blockers → supplier lead time → departure failure risk.
 *
 * Chain:
 *   readiness:blocker → supplier:lead_time → booking:confirmation_window → outcome:departure_failure_risk
 */

import type {
  Gate1FulfillmentBlockerInput,
  Gate1FulfillmentCausalInput,
  Gate1FulfillmentCausalOutput,
} from './gate1-fulfillment-causal.types';
import { GATE1_FULFILLMENT_CAUSAL_SCHEMA } from './gate1-fulfillment-causal.types';

const DEFAULT_LEAD_TIME_DAYS: Record<string, number> = {
  SUPPLIER: 14,
  BOOKING: 7,
  VISA: 21,
  DOCUMENT: 10,
  PAYMENT: 5,
  DEFAULT: 10,
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function statusWeight(status: string): number {
  const s = status.toUpperCase();
  if (s === 'BLOCKER') return 0.35;
  if (s === 'HIGH') return 0.22;
  if (s === 'MEDIUM') return 0.12;
  return 0.05;
}

function leadTimeForDimension(dimension: string, override?: number): number {
  if (override != null && override > 0) return override;
  const key = dimension.toUpperCase();
  for (const [k, v] of Object.entries(DEFAULT_LEAD_TIME_DAYS)) {
    if (key.includes(k)) return v;
  }
  return DEFAULT_LEAD_TIME_DAYS.DEFAULT;
}

function parseDueDays(dueAt: Date | string | null | undefined, now: Date): number | null {
  if (!dueAt) return null;
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export function runGate1FulfillmentCausalAnalysis(
  input: Gate1FulfillmentCausalInput,
  now = new Date(),
): Gate1FulfillmentCausalOutput | null {
  const open = input.blockers.filter((b) => b.status.toUpperCase() !== 'LOW');
  if (open.length === 0 && (input.daysToDeparture == null || input.daysToDeparture > 30)) {
    return null;
  }

  let risk = open.reduce((acc, b) => acc + statusWeight(b.status), 0);
  const leadTime = input.supplierLeadTimeDays ?? DEFAULT_LEAD_TIME_DAYS.DEFAULT;

  const daysToDep = input.daysToDeparture;
  if (daysToDep != null && daysToDep >= 0 && daysToDep < leadTime) {
    const squeeze = clamp01((leadTime - daysToDep) / leadTime);
    risk += 0.25 * squeeze;
  }

  for (const b of open) {
    const dueDays = parseDueDays(b.dueAt, now);
    if (dueDays != null && dueDays < 0) {
      risk += b.status.toUpperCase() === 'BLOCKER' ? 0.2 : 0.1;
    } else if (dueDays != null && dueDays <= 3) {
      risk += 0.08;
    }
  }

  risk = clamp01(risk);
  const blockerCount = open.filter((b) => b.status.toUpperCase() === 'BLOCKER').length;

  const baseRisk = clamp01(open.length * 0.08);
  const bindings = [
    {
      variable: 'readiness:open_blockers',
      label: '未关闭就绪项',
      baseValue: 0,
      projectedValue: open.length,
      unit: 'count',
    },
    {
      variable: 'outcome:departure_failure_risk',
      label: '临近出发仍无法履约的概率',
      baseValue: baseRisk,
      projectedValue: risk,
      unit: 'ratio',
    },
  ];

  if (daysToDep != null) {
    bindings.push({
      variable: 'supplier:lead_time_days',
      label: '供应商确认窗口（天）',
      baseValue: leadTime,
      projectedValue: Math.max(0, daysToDep),
      unit: 'days',
    });
  }

  const topBlocker = open.find((b) => b.status.toUpperCase() === 'BLOCKER') ?? open[0];
  const riskPct = Math.round(risk * 100);

  let recommendedIntervention: Gate1FulfillmentCausalOutput['recommendedIntervention'];
  if (blockerCount > 0 && daysToDep != null && daysToDep < leadTime) {
    recommendedIntervention = {
      type: 'ESCALATE_SUPPLIER',
      action: `优先关闭 ${blockerCount} 项阻断就绪任务，并催促供应商确认`,
      rationale: `距出发仅 ${daysToDep} 天，低于典型确认窗口 ${leadTime} 天`,
    };
  } else if (blockerCount > 0) {
    recommendedIntervention = {
      type: 'ADVISOR_REVIEW',
      action: '顾问复核阻断项并更新 Plan B 触发条件',
      rationale: '存在 BLOCKER 级就绪项，需人工闭环',
    };
  } else if (risk >= 0.35) {
    recommendedIntervention = {
      type: 'ADVANCE_BOOKING',
      action: '提前推进预订与材料收集',
      rationale: '就绪缺口累积，临近出发时放大履约风险',
    };
  }

  const userFacingAssessment =
    blockerCount > 0
      ? `当前有 ${blockerCount} 项阻断级就绪任务${topBlocker ? `（如「${topBlocker.title}」）` : ''}。按供应商确认窗口估算，临近出发仍无法完整履约的概率约 ${riskPct}%。`
      : open.length > 0
        ? `有 ${open.length} 项待关闭就绪任务；预估出发履约风险约 ${riskPct}%。`
        : daysToDep != null && daysToDep < leadTime
          ? `距出发 ${daysToDep} 天，低于典型供应商确认窗口（${leadTime} 天），建议提前推进预订。`
          : `就绪状态整体可控，预估履约风险约 ${riskPct}%。`;

  return {
    schema: GATE1_FULFILLMENT_CAUSAL_SCHEMA,
    departureFailureRisk: risk,
    causalChain: [
      'readiness:blocker',
      'supplier:lead_time',
      'booking:confirmation_window',
      'outcome:departure_failure_risk',
    ],
    bindings,
    userFacingAssessment,
    recommendedIntervention,
  };
}

export function buildFulfillmentInputFromReadinessFindings(
  findings: Gate1FulfillmentBlockerInput[],
  options?: { daysToDeparture?: number; supplierLeadTimeDays?: number },
): Gate1FulfillmentCausalInput {
  return {
    blockers: findings,
    daysToDeparture: options?.daysToDeparture,
    supplierLeadTimeDays: options?.supplierLeadTimeDays,
  };
}

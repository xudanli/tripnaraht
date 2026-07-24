/**
 * 编排步骤 → 轮询 UI 进度（与 `RouteAndRunResponseAssemblerService.mapOrchestrationStepToUIState` 对齐）。
 */

import type { OrchestrationStep } from '../interfaces/trip-plan.interface';
import { orchestrationStepDisplayZh } from '../constants/orchestration-step-display.constants';

const STEP_PROGRESS_PERCENT: Record<string, number> = {
  INTENT_COMPILE: 5,
  INTAKE: 8,
  STATE_UPDATE: 10,
  RESEARCH: 18,
  POI_SELECTION: 24,
  GATE_EVAL: 28,
  CONTEXT_BUILD: 32,
  PLAN_GEN: 42,
  TRAVEL_COMPILE: 46,
  OPTIMIZE: 48,
  VERIFY: 55,
  COMPLIANCE: 62,
  REPAIR: 72,
  NARRATE: 82,
  FEEDBACK: 92,
  HALLUCINATION_DETECTION: 96,
  DONE: 100,
  FAILED: 0,
  TIMEOUT: 0,
};

const STEP_PROGRESS_MESSAGE_ZH: Record<string, string> = {
  INTENT_COMPILE: '正在深度解析您的行程约束条件…',
  INTAKE: '规划师已接收需求，正在解析目的地、日期与出行偏好…',
  STATE_UPDATE: '正在同步决策状态与世界模型快照…',
  RESEARCH: '正在检索空间地理数据、POI 开放时间与路况证据（此阶段可能较慢）…',
  POI_SELECTION: '正在筛选与排序候选兴趣点…',
  GATE_EVAL: '正在进行可行性门禁与三人格安全评估…',
  CONTEXT_BUILD: '正在构建规划上下文包…',
  PLAN_GEN: '正在使用 System 2 状态机生成最佳路线草案…',
  TRAVEL_COMPILE: '正在解析 POI、路线与依赖关系（CTRE 旅行编译）…',
  OPTIMIZE: '正在抽取优化提示与节奏建议…',
  VERIFY: '正在验证开放时间、转乘缓冲与车型路况…',
  COMPLIANCE: '正在进行风险合规检查…',
  REPAIR: '正在修复发现的可执行性问题…',
  NARRATE: '正在为您撰写行程说明与逐日解读…',
  FEEDBACK: '正在采集反馈信号…',
  HALLUCINATION_DETECTION: '正在检测叙事事实一致性…',
  DONE: '行程规划已完成',
  FAILED: '规划失败',
  TIMEOUT: '请求超时',
};

export function orchestrationStepProgressPercent(step: string): number {
  const k = String(step ?? '').trim();
  return STEP_PROGRESS_PERCENT[k] ?? 12;
}

export function orchestrationStepProgressMessageZh(step: string, destinationHint?: string | null): string {
  const k = String(step ?? '').trim();
  const base = STEP_PROGRESS_MESSAGE_ZH[k];
  if (base) {
    if (k === 'RESEARCH' && destinationHint) {
      return `正在穿透空间地理数据库，检索「${destinationHint}」沿线 POI、开放时间与路况…`;
    }
    return base;
  }
  const label = orchestrationStepDisplayZh(k);
  return label ? `正在执行：${label}…` : '规划师正在处理您的请求…';
}

export type RouteAndRunTaskPublicStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

export function mapTaskServiceStatusToPublic(status: string): RouteAndRunTaskPublicStatus {
  const s = String(status ?? '').toUpperCase();
  if (s === 'COMPLETED') return 'SUCCESS';
  if (s === 'PENDING') return 'PENDING';
  if (s === 'FAILED') return 'FAILED';
  if (s === 'CANCELLED') return 'CANCELLED';
  return 'PROCESSING';
}

export function isTerminalTaskPublicStatus(status: RouteAndRunTaskPublicStatus): boolean {
  return status === 'SUCCESS' || status === 'FAILED' || status === 'CANCELLED';
}

export function asOrchestrationStep(step: string): OrchestrationStep {
  return step as OrchestrationStep;
}

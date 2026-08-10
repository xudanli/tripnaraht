/**
 * 认知主链 → 前端可渲染卡片（Decision Cockpit / ui_display）。
 */

import { buildCognitionClientEcho } from '../../decision/kernel/decision-cognition.util';
import type { DecisionCognitionSlice } from '../../decision/kernel/decision-cognition.types';

export const COGNITION_UI_CARDS_SCHEMA = 'tripnara.cognition_ui_cards@v1' as const;

export type CognitionUiCardKind =
  | 'REALITY'
  | 'RELATIONS'
  | 'FOCUSED_PROBLEM'
  | 'FUTURE'
  | 'AUTHORIZATION'
  | 'MILESTONE';

export type CognitionUiCard = {
  id: string;
  kind: CognitionUiCardKind;
  title_zh: string;
  body_zh: string;
  severity?: 'info' | 'warn' | 'critical';
  /** 对应 CognitionTraceMarker 或 problemId */
  ref?: string;
  cta_zh?: string;
};

export type CognitionUiCardsBundle = {
  schema: typeof COGNITION_UI_CARDS_SCHEMA;
  decision_depth?: string;
  markers: string[];
  cards: CognitionUiCard[];
};

const MARKER_COPY: Record<string, { title_zh: string; body_zh: string }> = {
  REALITY_READY: {
    title_zh: '已看清现实',
    body_zh: '行程与世界状态已收敛为统一现实快照，后续判断不再各自重解释。',
  },
  RELATIONS_READY: {
    title_zh: '已发现关系',
    body_zh: '约束、天气、疲劳等已连成影响链，便于定位根因。',
  },
  PROBLEM_FOCUSED: {
    title_zh: '问题已聚焦',
    body_zh: '已选出当前最值得处理的决策问题，其余症状已压后。',
  },
  FUTURE_SIMULATED: {
    title_zh: '已预演未来',
    body_zh: '候选方案已做校验与比较，可据此确认或调整。',
  },
  DECISION_AUTHORIZED: {
    title_zh: '决策已授权',
    body_zh: '您已确认或系统判定可呈现推荐方案。',
  },
  PLAN_APPLIED: {
    title_zh: '方案已写入',
    body_zh: '推荐调整已落到行程。',
  },
  OUTCOME_RECONCILED: {
    title_zh: '结果已对账',
    body_zh: '本轮决策结果已回写观察，用于更新现实。',
  },
};

/**
 * 从 DSO.cognition 生成前端卡片：焦点问题优先，其次里程碑与预演状态。
 */
export function buildCognitionUiCards(
  cognition: DecisionCognitionSlice | undefined,
): CognitionUiCardsBundle | undefined {
  const echo = buildCognitionClientEcho(cognition);
  if (!echo) return undefined;

  const cards: CognitionUiCard[] = [];
  const focus = echo.focused_problem;
  if (focus) {
    const layer = focus.constraintLayer;
    const sev =
      layer === 'BLOCK' || focus.gateDisposition === 'REJECT'
        ? 'critical'
        : layer === 'MUST_CONFIRM' ||
            focus.gateDisposition === 'NEED_CONFIRM' ||
            focus.urgency === 'NOW'
          ? 'warn'
          : 'info';
    const layerZh =
      layer === 'BLOCK'
        ? '不可执行'
        : layer === 'MUST_CONFIRM'
          ? '必须确认'
          : layer === 'SUGGEST_REPLACE'
            ? '建议替换'
            : layer === 'OPTIMIZE'
              ? '优化建议'
              : layer === 'WATCH'
                ? '持续观察'
                : undefined;
    cards.push({
      id: `focus:${focus.problemId}`,
      kind: 'FOCUSED_PROBLEM',
      title_zh: layerZh ? `当前决策焦点（${layerZh}）` : '当前决策焦点',
      body_zh: [
        focus.question,
        focus.whyThisProblem ? `为何现在：${focus.whyThisProblem}` : '',
        focus.actionDeadline ? `截止：${focus.actionDeadline}` : '',
        focus.suppressedSecondaryProblems?.length
          ? `已压后：${focus.suppressedSecondaryProblems.slice(0, 2).join('；')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
      severity: sev,
      ref: focus.problemId,
      cta_zh:
        layer === 'BLOCK'
          ? '不可按原计划执行，请更换方案'
          : layer === 'MUST_CONFIRM' || focus.gateDisposition === 'NEED_CONFIRM'
            ? '请确认后继续'
            : layer === 'WATCH'
              ? '暂无需行动，稍后复查'
              : focus.gateDisposition === 'ALLOW'
                ? '可继续执行'
                : undefined,
    });
  }

  if (echo.future) {
    cards.push({
      id: `future:${echo.future.status}`,
      kind: 'FUTURE',
      title_zh: '预演结果',
      body_zh: [
        `校验：${echo.future.status}`,
        echo.future.recommendedAlternativeId
          ? `推荐方案：${echo.future.recommendedAlternativeId}`
          : '',
        echo.future.alternativeCount
          ? `备选数：${echo.future.alternativeCount}`
          : '',
      ]
        .filter(Boolean)
        .join(' · '),
      severity: echo.future.status === 'BLOCK' ? 'critical' : echo.future.status === 'NEED_CONFIRM' ? 'warn' : 'info',
      ref: echo.future.recommendedAlternativeId,
    });
  }

  if (echo.reality) {
    cards.push({
      id: `reality:${echo.reality.snapshotId}`,
      kind: 'REALITY',
      title_zh: '现实快照',
      body_zh: `置信度 ${(echo.reality.confidence * 100).toFixed(0)}% · 新鲜度 ${echo.reality.freshness}${
        echo.reality.unknownCount ? ` · 未知项 ${echo.reality.unknownCount}` : ''
      }`,
      severity: echo.reality.freshness === 'STALE' || echo.reality.freshness === 'DEGRADED' ? 'warn' : 'info',
      ref: echo.reality.snapshotId,
    });
  }

  if (echo.relations) {
    cards.push({
      id: 'relations:graph',
      kind: 'RELATIONS',
      title_zh: '关系图摘要',
      body_zh: `节点 ${echo.relations.nodeCount} · 边 ${echo.relations.edgeCount} · 影响链 ${echo.relations.impactChainCount}`,
      severity: 'info',
    });
  }

  for (const marker of echo.markers) {
    const copy = MARKER_COPY[marker];
    if (!copy) continue;
    // 焦点/授权已有专卡时，里程碑卡只保留授权与写回类
    if (
      (marker === 'PROBLEM_FOCUSED' && focus) ||
      (marker === 'FUTURE_SIMULATED' && echo.future) ||
      (marker === 'REALITY_READY' && echo.reality)
    ) {
      continue;
    }
    cards.push({
      id: `marker:${marker}`,
      kind: marker === 'DECISION_AUTHORIZED' || marker === 'PLAN_APPLIED' || marker === 'OUTCOME_RECONCILED'
        ? 'AUTHORIZATION'
        : 'MILESTONE',
      title_zh: copy.title_zh,
      body_zh: copy.body_zh,
      severity: marker === 'DECISION_AUTHORIZED' || marker === 'PLAN_APPLIED' ? 'info' : 'info',
      ref: marker,
    });
  }

  if (!cards.length) return undefined;
  return {
    schema: COGNITION_UI_CARDS_SCHEMA,
    decision_depth: echo.decision_depth,
    markers: echo.markers,
    cards: cards.slice(0, 8),
  };
}

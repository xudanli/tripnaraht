/**
 * 模型未输出 <<<CONSULTATION_UI_JSON>>> 时，用 suggested_operations + 检索/MCP 上下文生成最小可用 Dashboard。
 */

import type {
  ConsultationDashboardSummaryCard,
  ConsultationDashboardV1,
} from '../types/consultation-dashboard.types';
import type { TripConsultationSuggestedOperation } from './trip-consultation-suggested-operations.util';

const MAX_SUMMARY_CARDS = 6;

export type LiveSensorAuditRow = {
  tool_id: string;
  ok: boolean;
  latency_ms?: number;
  error?: string;
};

export interface ConsultationDashboardFallbackEnrich {
  /** `data_lookup_rag_citations` 条数 */
  rag_citation_count?: number;
  hotel_search_meta?: {
    disclaimer_zh?: string;
    ui_layout_hint_zh?: string;
    strategy?: string;
  };
  /** 与 `payload.live_sensor_audit` 对齐（天气/住宿/租车等 MCP） */
  live_sensor_audit?: LiveSensorAuditRow[];
}

function buildOpCards(ops: TripConsultationSuggestedOperation[]): ConsultationDashboardSummaryCard[] {
  return ops.slice(0, 4).map((op) => ({
    id: `suggested_${op.id}`.slice(0, 64),
    title: op.kind === 'client_navigation' ? '界面入口' : '对话指令',
    value: op.label.slice(0, 160),
    hint:
      op.kind === 'client_navigation'
        ? '在 App 内打开对应页面'
        : '发送到助手以执行下一步',
    tone: 'neutral' as const,
  }));
}

function summarizeToolId(toolId: string): string {
  const t = toolId.toLowerCase();
  if (t.includes('weather')) return '天气';
  if (t.includes('hotel')) return '住宿';
  if (t.includes('car_rental') || t.includes('car')) return '租车';
  const seg = toolId.includes('.') ? toolId.split('.').pop() : undefined;
  return (seg ?? toolId).slice(0, 14);
}

const HINT_MAX_LEN = 220;
const ERR_SNIPPET_MAX = 40;

/** 单行折叠空白并截断，供卡片 hint 展示 */
function abbreviateErrorMessage(raw: string, max = ERR_SNIPPET_MAX): string {
  const oneLine = raw.replace(/\s+/g, ' ').trim();
  if (!oneLine) return '';
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

/**
 * 第一行：涉及的工具类型摘要；若有失败项，第二行：各失败工具的简短错误（与 tool_id 对齐）。
 */
function buildLiveSensorHint(audit: LiveSensorAuditRow[]): string | undefined {
  const uniqLabels = [...new Set(audit.map((a) => summarizeToolId(a.tool_id)))].slice(0, 6);
  const line1 = uniqLabels.join(' · ');
  const failures = audit.filter((a) => !a.ok);
  if (!failures.length) {
    return line1 || undefined;
  }
  const failParts = failures.slice(0, 4).map((a) => {
    const label = summarizeToolId(a.tool_id);
    const errRaw = typeof a.error === 'string' ? a.error : '';
    const errShow = errRaw.trim() ? abbreviateErrorMessage(errRaw) : '未返回详情';
    return `${label}: ${errShow}`;
  });
  const line2 = `失败 · ${failParts.join(' · ')}`;
  const combined = line1 ? `${line1}\n${line2}` : line2;
  return combined.length > HINT_MAX_LEN ? `${combined.slice(0, HINT_MAX_LEN - 1)}…` : combined;
}

function buildLiveSensorCards(audit?: LiveSensorAuditRow[]): ConsultationDashboardSummaryCard[] {
  if (!audit?.length) return [];
  const okN = audit.filter((a) => a.ok).length;
  const failN = audit.length - okN;
  const tone = failN > 0 ? ('warning' as const) : ('positive' as const);
  const value =
    failN > 0 ? `成功 ${okN} 项 · 失败 ${failN} 项` : `已调用 ${audit.length} 次实时查询`;
  return [
    {
      id: 'fallback_live_sensor',
      title: '实时查询',
      value,
      hint: buildLiveSensorHint(audit),
      tone,
    },
  ];
}

function buildRagHotelCards(enrich: ConsultationDashboardFallbackEnrich): ConsultationDashboardSummaryCard[] {
  const out: ConsultationDashboardSummaryCard[] = [];
  const n = enrich.rag_citation_count;
  if (typeof n === 'number' && n > 0) {
    out.push({
      id: 'fallback_rag_sources',
      title: '知识依据',
      value: `知识库摘录 ${n} 条`,
      hint: '正文引用与《文档名》一致',
      tone: 'neutral',
    });
  }
  const h = enrich.hotel_search_meta;
  const disc = typeof h?.disclaimer_zh === 'string' ? h.disclaimer_zh.trim().slice(0, 200) : '';
  const layout = typeof h?.ui_layout_hint_zh === 'string' ? h.ui_layout_hint_zh.trim().slice(0, 160) : '';
  if (disc || layout) {
    out.push({
      id: 'fallback_hotel_meta',
      title: '住宿检索',
      value: disc || layout || '已按行程采样',
      ...(layout && disc && layout !== disc ? { hint: layout } : {}),
      tone: 'warning' as const,
    });
  }
  return out;
}

/**
 * @param enrich 可选：RAG 条数、住宿 meta、`live_sensor_audit`（与 orchestration 载荷对齐）。
 */
export function buildConsultationDashboardFallbackFromSuggestedOperations(
  ops: TripConsultationSuggestedOperation[] | undefined,
  enrich?: ConsultationDashboardFallbackEnrich,
): ConsultationDashboardV1 | undefined {
  const opList = ops?.length ? ops : [];
  const opCards = opList.length ? buildOpCards(opList) : [];
  const liveCards = buildLiveSensorCards(enrich?.live_sensor_audit);
  const ragHotelCards = enrich ? buildRagHotelCards(enrich) : [];

  const summary_cards = [...opCards, ...liveCards, ...ragHotelCards].slice(0, MAX_SUMMARY_CARDS);
  if (!summary_cards.length) return undefined;

  const hasOps = opList.length > 0;
  const hasLive = liveCards.length > 0;
  const hasRagHotel = ragHotelCards.length > 0;

  let subheadline: string;
  if (hasOps) {
    if (!hasLive && !hasRagHotel) {
      subheadline = '基于本次答复生成的快捷入口（模型未返回可视化块时的兜底）。';
    } else {
      const bits: string[] = ['快捷操作'];
      if (hasLive) bits.push('实时查询');
      if (hasRagHotel) bits.push('检索/住宿摘要');
      subheadline = `${bits.join('与')}（模型未输出 Dashboard 时的兜底）。`;
    }
  } else if (hasLive || hasRagHotel) {
    subheadline = '实时查询与知识库/住宿提示（模型未输出 Dashboard 时的兜底）。';
  } else {
    subheadline = '参考信息（兜底）。';
  }

  return {
    version: 1,
    headline: hasOps ? '下一步操作' : '参考信息',
    subheadline,
    summary_cards,
    ...(hasOps ? { primary_cta_label: opList[0]!.label.slice(0, 48) } : {}),
    dashboard_origin: 'fallback',
  };
}

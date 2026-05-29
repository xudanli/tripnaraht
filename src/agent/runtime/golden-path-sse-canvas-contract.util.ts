/**
 * Golden Path — 编排阶段 → Canvas 渲染层契约（P2 前端消费 / E2E 断言）。
 *
 * 隐式进度：光流沿 active_layers 移动，不展示 Agent 碎嘴日志。
 */
import type { RouteAndRunTaskProgressPayload } from '../events/route-and-run-task.events';
import {
  WORLD_UI_LAYER_DIFF_STREAM,
  WORLD_UI_LAYER_MAP,
  WORLD_UI_LAYER_NARRATIVE,
  WORLD_UI_LAYER_TIMELINE,
} from '../../world/world-editing-ui-paradigm';

export type GoldenPathCanvasRenderHint = {
  /** 当前应点亮/渐显的 World UI 层（见 world-editing-ui-paradigm.ts） */
  active_layers: string[];
  /** 冰岛极光色光流是否沿时间轴/地图连线移动 */
  glow_stream_active: boolean;
};

const PHASE_CANVAS_HINTS: Record<string, GoldenPathCanvasRenderHint> = {
  RESEARCH: {
    active_layers: [WORLD_UI_LAYER_MAP],
    glow_stream_active: true,
  },
  GATE_EVAL: {
    active_layers: [WORLD_UI_LAYER_MAP, WORLD_UI_LAYER_TIMELINE],
    glow_stream_active: true,
  },
  PLAN_GEN: {
    active_layers: [WORLD_UI_LAYER_MAP, WORLD_UI_LAYER_TIMELINE],
    glow_stream_active: true,
  },
  REPAIR: {
    active_layers: [WORLD_UI_LAYER_MAP, WORLD_UI_LAYER_TIMELINE],
    glow_stream_active: true,
  },
  NARRATE: {
    active_layers: [WORLD_UI_LAYER_TIMELINE, WORLD_UI_LAYER_NARRATIVE],
    glow_stream_active: true,
  },
  DONE: {
    active_layers: [
      WORLD_UI_LAYER_DIFF_STREAM,
      WORLD_UI_LAYER_NARRATIVE,
      WORLD_UI_LAYER_MAP,
    ],
    glow_stream_active: false,
  },
};

export function resolveCanvasRenderHintForPhase(phase: string): GoldenPathCanvasRenderHint | null {
  const key = String(phase ?? '').trim();
  return PHASE_CANVAS_HINTS[key] ?? null;
}

/**
 * 为 SSE PHASE 事件附加 Canvas 渲染标记（前端 Glow Stream / 渐显锚点）。
 */
export function enrichSseProgressWithCanvasHint(
  payload: RouteAndRunTaskProgressPayload,
): RouteAndRunTaskProgressPayload {
  const hint = resolveCanvasRenderHintForPhase(payload.current_phase);
  if (!hint) {
    return payload;
  }
  return { ...payload, canvas_render: hint };
}

/** Golden Path 交付阶段应经历的 SSE 相位序列（简化） */
export const GOLDEN_PATH_DELIVERY_PHASES = [
  'RESEARCH',
  'PLAN_GEN',
  'REPAIR',
  'NARRATE',
  'DONE',
] as const;

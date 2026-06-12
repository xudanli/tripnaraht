import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { RouteAndRunTaskPublicStatus } from '../runtime/route-and-run-orchestration-progress.util';
import type { EmotionalContextClientProjection } from '../narrator/emotional-context-client-projection.util';

/** SSE / 进程内总线：编排任务进度（按 task_id 分 channel）。 */
export const routeAndRunTaskChannel = (taskId: string): string =>
  `route_and_run.task.${taskId}`;

export type RouteAndRunTaskSseEventType = 'PHASE' | 'RESULT' | 'ERROR';

export type RouteAndRunTaskProgressPayload = {
  task_id: string;
  request_id: string;
  type: RouteAndRunTaskSseEventType;
  current_phase: string;
  progress_percentage: number;
  message: string;
  status: RouteAndRunTaskPublicStatus;
  ts: string;
  error?: string;
  /** 仅 type=RESULT 且任务成功时可能携带（与轮询 status 一致） */
  data?: RouteAndRunResponseDto | null;
  /** Canvas 渲染层提示（Golden Path / world-editing-ui-paradigm 对齐） */
  canvas_render?: {
    active_layers: string[];
    glow_stream_active: boolean;
  };
  /** NARRATE 阶段增量：情绪矩阵 BFF 投影（tripnara.emotional_context.client@v1） */
  emotional_context?: EmotionalContextClientProjection;
};

import { Injectable, Logger, Optional } from '@nestjs/common';
import { AgentEventType, EventTelemetryService } from './event-telemetry.service';

export type RouteAndRunSseCloseReason =
  | 'terminal_event'
  | 'client_disconnect'
  | 'response_error'
  | 'server_shutdown'
  | 'store_terminal_on_ping';

/**
 * SSE 连接可观测性：TTFA（首条 PHASE）与连接生命周期。
 */
@Injectable()
export class RouteAndRunTaskStreamMetricsService {
  private readonly logger = new Logger(RouteAndRunTaskStreamMetricsService.name);
  private activeConnections = 0;
  private totalOpened = 0;
  private totalClosed = 0;

  constructor(@Optional() private readonly telemetry?: EventTelemetryService) {}

  onConnectionOpened(taskId: string, requestId: string): { connectionId: string; openedAt: number } {
    this.activeConnections++;
    this.totalOpened++;
    const connectionId = `sse_${taskId}_${Date.now()}_${this.totalOpened}`;
    const openedAt = Date.now();

    this.telemetry?.recordEvent({
      type: AgentEventType.ROUTE_AND_RUN_SSE_CONNECT,
      request_id: requestId,
      data: { task_id: taskId, connection_id: connectionId },
      metadata: { active_connections: this.activeConnections },
    });

    this.logger.debug(
      `[SSE] connect task=${taskId} conn=${connectionId} active=${this.activeConnections}`,
    );

    return { connectionId, openedAt };
  }

  onFirstAction(
    taskId: string,
    requestId: string,
    connectionId: string,
    taskCreatedAtIso: string,
    openedAt: number,
  ): void {
    const taskCreatedMs = Date.parse(taskCreatedAtIso);
    const ttfaFromTaskMs =
      Number.isFinite(taskCreatedMs) ? Math.max(0, Date.now() - taskCreatedMs) : undefined;
    const ttfaFromConnectMs = Math.max(0, Date.now() - openedAt);

    this.telemetry?.recordEvent({
      type: AgentEventType.ROUTE_AND_RUN_SSE_FIRST_ACTION,
      request_id: requestId,
      data: {
        task_id: taskId,
        connection_id: connectionId,
        ttfa_from_task_ms: ttfaFromTaskMs,
        ttfa_from_connect_ms: ttfaFromConnectMs,
      },
    });

    this.logger.log(
      `[SSE] first_action task=${taskId} ttfa_task_ms=${ttfaFromTaskMs ?? 'n/a'} ttfa_connect_ms=${ttfaFromConnectMs}`,
    );
  }

  onConnectionClosed(
    taskId: string,
    requestId: string,
    connectionId: string,
    openedAt: number,
    reason: RouteAndRunSseCloseReason,
  ): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
    this.totalClosed++;
    const durationMs = Math.max(0, Date.now() - openedAt);

    this.telemetry?.recordEvent({
      type: AgentEventType.ROUTE_AND_RUN_SSE_CLOSE,
      request_id: requestId,
      data: { task_id: taskId, connection_id: connectionId, reason },
      metadata: {
        duration_ms: durationMs,
        active_connections: this.activeConnections,
      },
    });

    this.logger.debug(
      `[SSE] close task=${taskId} conn=${connectionId} reason=${reason} duration_ms=${durationMs} active=${this.activeConnections}`,
    );
  }

  snapshot() {
    return {
      active_connections: this.activeConnections,
      total_opened: this.totalOpened,
      total_closed: this.totalClosed,
    };
  }
}

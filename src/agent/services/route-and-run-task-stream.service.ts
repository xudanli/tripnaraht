import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RouteAndRunTaskProgressPayload } from '../events/route-and-run-task.events';
import {
  ROUTE_AND_RUN_TASK_EVENT_BUS,
  type RouteAndRunTaskEventBusPort,
} from '../ports/route-and-run-task-event-bus.port';
import {
  taskRecordToProgressPayload,
  terminalPayloadTypeForRecord,
} from '../utils/route-and-run-task-progress-payload.util';
import { RouteAndRunAsyncTaskStore } from './route-and-run-async-task.store';
import { RouteAndRunTaskStreamRegistry } from './route-and-run-task-stream.registry';
import {
  RouteAndRunTaskStreamMetricsService,
  type RouteAndRunSseCloseReason,
} from './route-and-run-task-stream-metrics.service';

const SSE_HEARTBEAT_MS = 30_000;

@Injectable()
export class RouteAndRunTaskStreamService {
  private readonly logger = new Logger(RouteAndRunTaskStreamService.name);

  constructor(
    @Optional() private readonly taskStore?: RouteAndRunAsyncTaskStore,
    @Optional()
    @Inject(ROUTE_AND_RUN_TASK_EVENT_BUS)
    private readonly eventBus?: RouteAndRunTaskEventBusPort,
    @Optional() private readonly streamRegistry?: RouteAndRunTaskStreamRegistry,
    @Optional() private readonly metrics?: RouteAndRunTaskStreamMetricsService,
  ) {}

  /**
   * `GET /agent/task/stream/:taskId` — 编排阶段 SSE（与轮询 `task/status` 并存）。
   */
  async streamTask(taskId: string, req: Request, res: Response): Promise<void> {
    if (!this.taskStore) {
      throw new NotFoundException('Task store is not configured');
    }

    const record = await this.taskStore.getRecord(taskId);
    if (!record) {
      throw new NotFoundException(`Task not found: ${taskId}`);
    }

    const { connectionId, openedAt } =
      this.metrics?.onConnectionOpened(taskId, record.request_id) ?? {
        connectionId: `sse_${taskId}`,
        openedAt: Date.now(),
      };

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as Response & { flushHeaders?: () => void }).flushHeaders?.();

    let closed = false;
    let firstActionRecorded = false;
    let writePaused = false;
    const pendingPayloads: RouteAndRunTaskProgressPayload[] = [];

    const recordFirstAction = () => {
      if (firstActionRecorded) return;
      firstActionRecorded = true;
      this.metrics?.onFirstAction(
        taskId,
        record.request_id,
        connectionId,
        record.created_at,
        openedAt,
      );
    };

    const flushPending = () => {
      while (!writePaused && pendingPayloads.length > 0 && !res.writableEnded) {
        const next = pendingPayloads.shift()!;
        if (!writePayload(next)) {
          pendingPayloads.unshift(next);
          break;
        }
      }
    };

    const writePayload = (payload: RouteAndRunTaskProgressPayload): boolean => {
      if (res.writableEnded) return true;
      recordFirstAction();
      const line = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
      const ok = res.write(line);
      if (!ok) {
        writePaused = true;
        res.once('drain', () => {
          writePaused = false;
          flushPending();
        });
        return false;
      }
      return true;
    };

    const sendEnd = () => {
      if (res.writableEnded) return;
      res.write(`event: end\ndata: {}\n\n`);
    };

    const finish = (reason: RouteAndRunSseCloseReason) => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unregister?.();
      if (this.eventBus) {
        this.eventBus.offProgress(taskId, onProgress);
      }
      this.metrics?.onConnectionClosed(
        taskId,
        record.request_id,
        connectionId,
        openedAt,
        reason,
      );
      if (!res.writableEnded) {
        res.end();
      }
    };

    const closeTerminal = (
      rec: typeof record,
      reason: RouteAndRunSseCloseReason,
    ) => {
      const terminalType = terminalPayloadTypeForRecord(rec);
      if (!terminalType) return false;
      writePayload(taskRecordToProgressPayload(rec, terminalType));
      sendEnd();
      finish(reason);
      return true;
    };

    // P0：快人一步 — 连接时若已终态，立即推 RESULT/ERROR + end
    if (closeTerminal(record, 'terminal_event')) {
      return;
    }

    writePayload(taskRecordToProgressPayload(record, 'PHASE'));

    const pushTerminalFromRegistry = (payload: RouteAndRunTaskProgressPayload) => {
      pendingPayloads.length = 0;
      writePayload(payload);
      sendEnd();
      finish('server_shutdown');
    };

    const unregister = this.streamRegistry?.register({
      taskId,
      connectionId,
      pushTerminal: pushTerminalFromRegistry,
      close: () => finish('server_shutdown'),
    });

    if (!this.eventBus) {
      this.logger.warn(
        `Event bus not configured; SSE task=${taskId} relies on heartbeat store poll`,
      );
    }

    const onProgress = (payload: RouteAndRunTaskProgressPayload) => {
      if (closed) return;
      if (!writePayload(payload)) {
        pendingPayloads.push(payload);
      }
      if (payload.type === 'RESULT' || payload.type === 'ERROR') {
        sendEnd();
        finish('terminal_event');
      }
    };

    if (this.eventBus) {
      this.eventBus.onProgress(taskId, onProgress);
    }

    const heartbeat = setInterval(() => {
      if (closed || res.writableEnded) return;
      const ok = res.write(`: ping ${Date.now()}\n\n`);
      if (!ok) {
        writePaused = true;
        res.once('drain', () => {
          writePaused = false;
          flushPending();
        });
      }
      void this.taskStore!
        .getRecord(taskId)
        .then((latest) => {
          if (!latest || closed) return;
          closeTerminal(latest, 'store_terminal_on_ping');
        })
        .catch(() => undefined);
    }, SSE_HEARTBEAT_MS);

    const onClientGone = () => finish('client_disconnect');
    req.once('close', onClientGone);
    res.once('close', onClientGone);
    res.once('error', () => finish('response_error'));
  }
}

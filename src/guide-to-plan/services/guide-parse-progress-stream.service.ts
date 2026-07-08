import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { GUIDE_PARSE_JOB_STATUS } from '../constants/guide-to-plan-status.constants';
import type { GuideParseProgressView } from '../types/guide-to-plan.types';
import { GuideParseJobService } from './guide-parse-job.service';
import { GuideParseProgressHub } from './guide-parse-progress-hub.service';

const SSE_HEARTBEAT_MS = 30_000;
const SSE_POLL_MS = 2_000;

@Injectable()
export class GuideParseProgressStreamService {
  private readonly logger = new Logger(GuideParseProgressStreamService.name);

  constructor(
    private readonly parseJobService: GuideParseJobService,
    private readonly progressHub: GuideParseProgressHub,
  ) {}

  /**
   * `GET /guide-to-plan/sessions/:sessionId/parse/stream` — 解析进度 SSE（与轮询 status 并存）。
   */
  async stream(userId: string, sessionId: string, req: Request, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as Response & { flushHeaders?: () => void }).flushHeaders?.();

    let closed = false;
    let writePaused = false;
    const pendingPayloads: GuideParseProgressView[] = [];

    const flushPending = () => {
      while (!writePaused && pendingPayloads.length > 0 && !res.writableEnded) {
        const next = pendingPayloads.shift()!;
        if (!writePayload(next)) {
          pendingPayloads.unshift(next);
          break;
        }
      }
    };

    const writePayload = (payload: GuideParseProgressView): boolean => {
      if (res.writableEnded) return true;
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

    const finish = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      clearInterval(pollTimer);
      unsubscribe?.();
      if (!res.writableEnded) {
        res.end();
      }
    };

    const closeIfTerminal = (payload: GuideParseProgressView): boolean => {
      if (
        payload.status !== GUIDE_PARSE_JOB_STATUS.COMPLETED &&
        payload.status !== GUIDE_PARSE_JOB_STATUS.FAILED
      ) {
        return false;
      }
      writePayload(payload);
      sendEnd();
      finish();
      return true;
    };

    const pushProgress = (payload: GuideParseProgressView) => {
      if (closed) return;
      if (!writePayload(payload)) {
        pendingPayloads.push(payload);
      }
      closeIfTerminal(payload);
    };

    const initial = await this.parseJobService.getParseStatus(userId, sessionId);
    if (closeIfTerminal(initial)) {
      return;
    }
    writePayload(initial);

    const unsubscribe = this.progressHub.subscribe(sessionId, pushProgress);

    const pollTimer = setInterval(() => {
      if (closed || res.writableEnded) return;
      void this.parseJobService
        .getParseStatus(userId, sessionId)
        .then((latest) => {
          if (closed) return;
          pushProgress(latest);
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`SSE poll failed session=${sessionId}: ${message}`);
        });
    }, SSE_POLL_MS);

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
    }, SSE_HEARTBEAT_MS);

    const onClientGone = () => finish();
    req.once('close', onClientGone);
    res.once('close', onClientGone);
    res.once('error', onClientGone);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TravelContextDiffService } from '../diff/travel-context-diff.service';
import type { TravelContextRevisionEvent } from '../diff/travel-context-diff.util';

const SSE_HEARTBEAT_MS = 30_000;

@Injectable()
export class TravelContextEventsStreamService {
  private readonly logger = new Logger(TravelContextEventsStreamService.name);

  constructor(private readonly diffService: TravelContextDiffService) {}

  /**
   * RFC-003 §8.1.4 — `GET /travel-contexts/:contextId/events`
   * Streams CONTEXT_REVISION_CHANGED events for incremental sync.
   */
  stream(contextId: string, req: Request, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as Response & { flushHeaders?: () => void }).flushHeaders?.();

    let closed = false;

    const writeEvent = (event: TravelContextRevisionEvent) => {
      if (closed || res.writableEnded) return;
      res.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`);
    };

    const finish = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      if (!res.writableEnded) {
        res.end();
      }
    };

    const unsubscribe = this.diffService.subscribe(contextId, writeEvent);

    const heartbeat = setInterval(() => {
      if (!closed && !res.writableEnded) {
        res.write(': heartbeat\n\n');
      }
    }, SSE_HEARTBEAT_MS);

    req.on('close', finish);
    req.on('error', () => finish());
    res.on('error', (err) => {
      this.logger.debug(`SSE stream error context=${contextId}: ${String(err)}`);
      finish();
    });
  }
}

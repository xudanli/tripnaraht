import { Injectable } from '@nestjs/common';
import type { GuideParseProgressView } from '../types/guide-to-plan.types';

type ProgressListener = (progress: GuideParseProgressView) => void;

/**
 * In-memory pub/sub for parse progress SSE subscribers (per sessionId).
 */
@Injectable()
export class GuideParseProgressHub {
  private readonly listeners = new Map<string, Set<ProgressListener>>();

  subscribe(sessionId: string, listener: ProgressListener): () => void {
    let set = this.listeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.listeners.set(sessionId, set);
    }
    set.add(listener);

    return () => {
      set?.delete(listener);
      if (set?.size === 0) {
        this.listeners.delete(sessionId);
      }
    };
  }

  publish(sessionId: string, progress: GuideParseProgressView): void {
    const set = this.listeners.get(sessionId);
    if (!set?.size) return;
    for (const listener of set) {
      try {
        listener(progress);
      } catch {
        // ignore subscriber errors
      }
    }
  }
}

import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import type { TravelContextRevisionEvent } from './travel-context-diff.util';

type RevisionListener = (event: TravelContextRevisionEvent) => void;

@Injectable()
export class TravelContextRevisionHubService {
  private readonly emitters = new Map<string, EventEmitter>();

  publish(event: TravelContextRevisionEvent): void {
    this.emitterFor(event.contextId).emit('revision', event);
  }

  subscribe(contextId: string, listener: RevisionListener): () => void {
    const emitter = this.emitterFor(contextId);
    emitter.on('revision', listener);
    return () => emitter.off('revision', listener);
  }

  private emitterFor(contextId: string): EventEmitter {
    let emitter = this.emitters.get(contextId);
    if (!emitter) {
      emitter = new EventEmitter();
      emitter.setMaxListeners(32);
      this.emitters.set(contextId, emitter);
    }
    return emitter;
  }
}

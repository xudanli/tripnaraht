import { Injectable } from '@nestjs/common';
import type { AuthoritativeWriteCorridorId } from './authoritative-write.types';
import type { CorridorShadowHandler } from './corridor-handler.types';
import { UWC_1B_WIRE_ORDER } from './corridor-write-mode.config';
import { ActionsCommitCorridorHandler } from './handlers/actions-commit.handler';
import { ItineraryAdjustCorridorHandler } from './handlers/itinerary-adjust.handler';
import { UnifiedExecuteCorridorHandler } from './handlers/unified-execute.handler';

/**
 * Explicit handler registry — bind order: ACTIONS_COMMIT → ITINERARY_ADJUST → UNIFIED_EXECUTE.
 */
@Injectable()
export class AuthoritativeWriteHandlerRegistryService {
  private readonly handlers = new Map<
    AuthoritativeWriteCorridorId,
    CorridorShadowHandler
  >();

  constructor() {
    const ordered: CorridorShadowHandler[] = [
      new ActionsCommitCorridorHandler(),
      new ItineraryAdjustCorridorHandler(),
      new UnifiedExecuteCorridorHandler(),
    ];
    for (const corridor of UWC_1B_WIRE_ORDER) {
      const handler = ordered.find((h) => h.corridor === corridor);
      if (!handler) {
        throw new Error(`UWC handler missing for ${corridor}`);
      }
      this.handlers.set(corridor, handler);
    }
  }

  get(corridor: AuthoritativeWriteCorridorId): CorridorShadowHandler {
    const h = this.handlers.get(corridor);
    if (!h) {
      throw new Error(`UWC handler not bound: ${corridor}`);
    }
    return h;
  }

  listBound(): AuthoritativeWriteCorridorId[] {
    return [...UWC_1B_WIRE_ORDER];
  }

  isBound(corridor: AuthoritativeWriteCorridorId): boolean {
    return this.handlers.has(corridor);
  }
}

/** Non-DI accessor for util call sites (itinerary adjust). */
let registrySingleton: AuthoritativeWriteHandlerRegistryService | null = null;

export function getOrCreateHandlerRegistry(): AuthoritativeWriteHandlerRegistryService {
  if (!registrySingleton) {
    registrySingleton = new AuthoritativeWriteHandlerRegistryService();
  }
  return registrySingleton;
}

export function setHandlerRegistryForTests(
  registry: AuthoritativeWriteHandlerRegistryService | null,
): void {
  registrySingleton = registry;
}

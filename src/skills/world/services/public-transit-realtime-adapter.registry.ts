import { Injectable } from '@nestjs/common';
import type { PublicTransitRealtimeAdapter } from './public-transit-realtime.adapter';

@Injectable()
export class PublicTransitRealtimeAdapterRegistry {
  private readonly adapters = new Map<string, PublicTransitRealtimeAdapter>();

  register(adapter: PublicTransitRealtimeAdapter): void {
    this.adapters.set(String(adapter.provider), adapter);
  }

  get(provider: string): PublicTransitRealtimeAdapter | undefined {
    return this.adapters.get(String(provider));
  }
}


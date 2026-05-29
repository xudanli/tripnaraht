/**
 * 最小 Nest 模块：供 SkillEvolver live decision_replay 调用真实 TripDecisionEngineService
 * （与 scripts/capture-golden-with-engine-dso.ts 同构，避免拉起完整 AppModule）
 */
import { Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TripDecisionEngineService } from '../../../trips/decision/trip-decision-engine.service';
import { SenseToolsAdapter } from '../../../trips/decision/adapters/sense-tools.adapter';
import { DecisionParamsInjectorService } from '../../../agent/memory/services/decision-params-injector.service';

class StubSenseToolsAdapter {
  async getHotelPointForDate(_date: string): Promise<{ lat: number; lng: number } | undefined> {
    return { lat: 64.1466, lng: -21.9426 };
  }

  async getTravelLeg(from: { lat?: number; lng?: number }, to: { lat?: number; lng?: number }) {
    const dx = (from?.lat ?? 0) - (to?.lat ?? 0);
    const dy = (from?.lng ?? 0) - (to?.lng ?? 0);
    const distKm = Math.sqrt(dx * dx + dy * dy) * 111;
    const durationMin = Math.max(5, Math.round((distKm / 50) * 60));
    return {
      mode: 'drive',
      from,
      to,
      durationMin,
      distanceKm: distKm,
      reliability: 0.7,
      source: 'stub',
    };
  }
}

const stubDecisionParamsInjector = {
  getDecisionParamsForUser: async () => ({}),
  injectConstraintsToWorldModel: () => undefined,
  getUserTravelProfileForRuntime: async () => ({}),
};

@Module({
  providers: [
    TripDecisionEngineService,
    { provide: SenseToolsAdapter, useClass: StubSenseToolsAdapter },
    { provide: DecisionParamsInjectorService, useValue: stubDecisionParamsInjector },
    { provide: EventEmitter2, useValue: new EventEmitter2() },
  ],
  exports: [TripDecisionEngineService],
})
export class DecisionReplayLiveModule {}

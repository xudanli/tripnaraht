import { Module, forwardRef } from '@nestjs/common';
import { PoiAccessCapacityModule } from '../../../poi-access-capacity/poi-access-capacity.module';
import { DecisionTickRoadBindingStore } from './decision-tick-road-binding.store';
import { DecisionTickRoadGateProvider } from './decision-tick-road-gate.provider';
import { DecisionTickPoiBindingStore } from './decision-tick-poi-binding.store';
import { PoiAccessOverrideAuthorityPort } from './poi-access-override-authority.port';
import { PoiAccessCapacityOverrideLookup } from './poi-access-capacity-override.lookup';
import { PoiAuthorityDecisionTickService } from './poi-authority-decision-tick.service';
import { DecisionTickPoiGateProvider } from './decision-tick-poi-gate.provider';

/**
 * Decision-time world consistency (tick-scoped).
 * Leaf module: stores + gate/POI providers only.
 * Look→Authority port/tick live on GuardianDecisionCoreModule to avoid
 * SharedMemory ↔ Guardian ↔ DecisionSemantics circular import.
 */
@Module({
  imports: [forwardRef(() => PoiAccessCapacityModule)],
  providers: [
    DecisionTickRoadBindingStore,
    DecisionTickRoadGateProvider,
    DecisionTickPoiBindingStore,
    PoiAccessCapacityOverrideLookup,
    {
      provide: PoiAccessOverrideAuthorityPort,
      useFactory: (lookup: PoiAccessCapacityOverrideLookup) =>
        new PoiAccessOverrideAuthorityPort(lookup),
      inject: [PoiAccessCapacityOverrideLookup],
    },
    PoiAuthorityDecisionTickService,
    DecisionTickPoiGateProvider,
  ],
  exports: [
    DecisionTickRoadBindingStore,
    DecisionTickRoadGateProvider,
    DecisionTickPoiBindingStore,
    PoiAccessCapacityOverrideLookup,
    PoiAccessOverrideAuthorityPort,
    PoiAuthorityDecisionTickService,
    DecisionTickPoiGateProvider,
  ],
})
export class WorldConsistencyModule {}

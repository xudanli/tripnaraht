import { Module } from '@nestjs/common';
import { TravelEventStoreModule } from '../event-store/travel-event-store.module';
import { CausalTravelEventEmitterService } from './causal-travel-event.emitter.service';
import { CausalCounterfactualClosureService } from './causal-counterfactual-closure.service';
import { CausalRuntimeSessionService } from './causal-runtime-session.service';

@Module({
  imports: [TravelEventStoreModule],
  providers: [
    CausalTravelEventEmitterService,
    CausalCounterfactualClosureService,
    CausalRuntimeSessionService,
  ],
  exports: [
    CausalTravelEventEmitterService,
    CausalCounterfactualClosureService,
    CausalRuntimeSessionService,
  ],
})
export class CausalRuntimeModule {}

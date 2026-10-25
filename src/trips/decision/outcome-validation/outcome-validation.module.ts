/**
 * World Model Outcome Validation — Nest module.
 * Tick-scoped outcome ledger only; not a World SSOT.
 */

import { Module, forwardRef } from '@nestjs/common';
import { WorldConsistencyModule } from '../world-consistency/world-consistency.module';
import { WmOutcomeValidationStore } from './wm-outcome-validation.store';
import { WmOutcomeValidationBridgeService } from './wm-outcome-validation-bridge.service';

@Module({
  imports: [forwardRef(() => WorldConsistencyModule)],
  providers: [WmOutcomeValidationStore, WmOutcomeValidationBridgeService],
  exports: [WmOutcomeValidationStore, WmOutcomeValidationBridgeService],
})
export class OutcomeValidationModule {}

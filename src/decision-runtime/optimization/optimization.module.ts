import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { GuardianDecisionCoreModule } from '../../trips/guardian-decision-core/guardian-decision-core.module';
import { ObjectiveSemanticsModule } from '../objectives/objective-semantics.module';
import { WorldStateSnapshotModule } from '../snapshot/world-state-snapshot.module';
import { OptimizationStrategySelectorService } from './strategy-selector.service';
import { CanonicalSolutionPostValidatorService } from './post-validator.service';
import { LegacyFrozenStrategy } from './strategies/legacy-frozen.strategy';
import { CpSatLexicographicStrategy } from './strategies/cp-sat-lexicographic.strategy';
import { BoundedLnsRepairStrategy } from './strategies/bounded-lns-repair.strategy';

@Module({
  imports: [
    forwardRef(() => GuardianDecisionCoreModule),
    ObjectiveSemanticsModule,
    forwardRef(() => WorldStateSnapshotModule),
  ],
  providers: [
    OptimizationStrategySelectorService,
    CanonicalSolutionPostValidatorService,
    LegacyFrozenStrategy,
    CpSatLexicographicStrategy,
    BoundedLnsRepairStrategy,
  ],
  exports: [
    OptimizationStrategySelectorService,
    CanonicalSolutionPostValidatorService,
    LegacyFrozenStrategy,
    CpSatLexicographicStrategy,
    BoundedLnsRepairStrategy,
  ],
})
export class OptimizationModule implements OnModuleInit {
  constructor(
    private readonly selector: OptimizationStrategySelectorService,
    private readonly legacyFrozen: LegacyFrozenStrategy,
    private readonly cpSatLex: CpSatLexicographicStrategy,
    private readonly boundedLns: BoundedLnsRepairStrategy,
  ) {}

  onModuleInit(): void {
    this.selector.register(this.legacyFrozen);
    this.selector.register(this.cpSatLex);
    this.selector.register(this.boundedLns);
  }
}

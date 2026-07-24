import { Module } from '@nestjs/common';
import { EffectivePlanWriteGuardService } from './effective-plan-write-guard.service';
import { CanonicalMutationCommitGuardService } from './canonical-mutation-commit-guard.service';
import { AuthoritativeWriteModule } from './authoritative-write/authoritative-write.module';

@Module({
  imports: [AuthoritativeWriteModule],
  providers: [EffectivePlanWriteGuardService, CanonicalMutationCommitGuardService],
  exports: [
    EffectivePlanWriteGuardService,
    CanonicalMutationCommitGuardService,
    AuthoritativeWriteModule,
  ],
})
export class EffectivePlanExecutionModule {}

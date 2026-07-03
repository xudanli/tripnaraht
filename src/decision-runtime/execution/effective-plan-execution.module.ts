import { Module } from '@nestjs/common';
import { EffectivePlanWriteGuardService } from './effective-plan-write-guard.service';
import { CanonicalMutationCommitGuardService } from './canonical-mutation-commit-guard.service';

@Module({
  providers: [EffectivePlanWriteGuardService, CanonicalMutationCommitGuardService],
  exports: [EffectivePlanWriteGuardService, CanonicalMutationCommitGuardService],
})
export class EffectivePlanExecutionModule {}

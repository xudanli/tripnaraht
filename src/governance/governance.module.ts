import { Module } from '@nestjs/common';
import { LedgerModule } from '../agent/ledger/ledger.module';
import { GovernanceHydrationService } from './activation/governance-hydration.service';
import { GovernanceRuntimeGraphService } from './runtime-graph/governance-runtime-graph.service';

@Module({
  imports: [LedgerModule],
  providers: [GovernanceRuntimeGraphService, GovernanceHydrationService],
  exports: [GovernanceRuntimeGraphService, GovernanceHydrationService, LedgerModule],
})
export class GovernanceModule {}

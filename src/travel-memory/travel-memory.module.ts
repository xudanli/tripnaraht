/**
 * Travel Memory Runtime Nest 模块 — 薄门面，不平行重建 Agent Memory SoT。
 * Phase 1：可选 Prisma Evidence Chain + Accountability HTTP。
 */

import { Module } from '@nestjs/common';
import { SharedMemoryModule } from '../agent/memory/shared-memory.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TravelMemoryRuntimeService } from './runtime/travel-memory-runtime.service';
import { PrismaTravelMemoryLedgerService } from './ledger/prisma-travel-memory-ledger.service';
import { MemoryAccountabilityService } from './runtime/memory-accountability.service';
import { MemoryAccountabilityController } from './runtime/memory-accountability.controller';
import { TravelContextAssemblerService } from './context-assembly/travel-context-assembler.service';

@Module({
  imports: [SharedMemoryModule, PrismaModule],
  controllers: [MemoryAccountabilityController],
  providers: [
    TravelMemoryRuntimeService,
    PrismaTravelMemoryLedgerService,
    MemoryAccountabilityService,
    TravelContextAssemblerService,
  ],
  exports: [
    TravelMemoryRuntimeService,
    PrismaTravelMemoryLedgerService,
    MemoryAccountabilityService,
    TravelContextAssemblerService,
  ],
})
export class TravelMemoryModule {}

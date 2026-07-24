import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CausalRuntimeModule } from '../trips/causal-runtime/causal-runtime.module';
import { CanonicalCausalTraceService } from './services/canonical-causal-trace.service';
import { CanonicalCausalTracePersistenceService } from './services/canonical-causal-trace-persistence.service';

@Module({
  imports: [PrismaModule, CausalRuntimeModule],
  providers: [CanonicalCausalTracePersistenceService, CanonicalCausalTraceService],
  exports: [CanonicalCausalTraceService, CanonicalCausalTracePersistenceService],
})
export class CausalProtocolModule {}

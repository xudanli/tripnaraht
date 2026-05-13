import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { MemoryKernelService } from './memory-kernel.service';
import {
  MEMORY_COGNITIVE_SLICE_PROVIDER,
  NoOpMemoryCognitiveSliceProvider,
} from './memory-cognitive-slice.provider';
import { PrismaMemoryCognitiveSliceProvider } from './prisma-memory-cognitive-slice.provider';
import { EXPERIENCE_REPLAY_PRISMA_SLICE_PROVIDER_ENV } from './memory-replay.constants';

@Module({
  imports: [PrismaModule],
  providers: [
    MemoryKernelService,
    NoOpMemoryCognitiveSliceProvider,
    PrismaMemoryCognitiveSliceProvider,
    {
      provide: MEMORY_COGNITIVE_SLICE_PROVIDER,
      useFactory: (
        noop: NoOpMemoryCognitiveSliceProvider,
        prismaSlices: PrismaMemoryCognitiveSliceProvider,
      ) => (process.env[EXPERIENCE_REPLAY_PRISMA_SLICE_PROVIDER_ENV] === '1' ? prismaSlices : noop),
      inject: [NoOpMemoryCognitiveSliceProvider, PrismaMemoryCognitiveSliceProvider],
    },
  ],
  exports: [
    MemoryKernelService,
    MEMORY_COGNITIVE_SLICE_PROVIDER,
    NoOpMemoryCognitiveSliceProvider,
    PrismaMemoryCognitiveSliceProvider,
  ],
})
export class ExperienceReplayModule {}

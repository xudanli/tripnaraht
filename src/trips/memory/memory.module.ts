/**
 * Memory Module
 *
 * Provides episodic and semantic memory capabilities for self-evolution.
 * This module implements the Synapse-inspired dual-memory architecture.
 * Round 3: Added ACT-R decay and reflection mechanism.
 */

import { Module } from '@nestjs/common';
import { EpisodicMemoryService } from './episodic-memory.service';
import { SemanticMemoryService } from './semantic-memory.service';
import { MemoryController } from './memory.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MemoryController],
  providers: [
    EpisodicMemoryService,
    SemanticMemoryService,
  ],
  exports: [
    EpisodicMemoryService,
    SemanticMemoryService,
  ],
})
export class MemoryModule {}

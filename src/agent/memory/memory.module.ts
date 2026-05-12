// src/agent/memory/memory.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MemoryService } from './services/memory.service';
import { UserProfileMapperService } from './services/user-profile-mapper.service';
import { DecisionParamsInjectorService } from './services/decision-params-injector.service';
import { DecisionParamsMappingV2Service } from './services/decision-params-mapping-v2.service';
import { ShadowModeDiffService } from './services/shadow-mode-diff.service';
import { PersonaIdentificationService } from './services/persona-identification.service';
import { PersonaStateManagerService } from './services/persona-state-manager.service';
import { MultiPersonaManagerService } from './services/multi-persona-manager.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { FlywheelModule } from '../../trips/decision/flywheel/flywheel.module';
import { AgentMemoryContextStore } from './context/agent-memory-context.store';
import { MemoryContextAssemblerService } from './services/memory-context-assembler.service';
import { MemoryWritePipelineService } from './pipeline/memory-write-pipeline.service';
import { DecisionReplayService } from './replay/decision-replay.service';
import { MemorySnapshotPersistenceService } from './persistence/memory-snapshot-persistence.service';
import { RedisModule } from '../../redis/redis.module';
import { AgentExecutionContextStore } from '../runtime/agent-execution-context.store';
import { AgentExecutionContextFactoryService } from '../runtime/agent-execution-context-factory.service';
import { ExecutionTimelineRecorderService } from '../runtime/execution-timeline-recorder.service';
import { WorldDecisionMemoryService } from './decision-memory/world-decision-memory.service';
import { PrismaWorldDecisionMemoryArchiveService } from './decision-memory/prisma-world-decision-memory-archive.service';
import { WORLD_DECISION_MEMORY_ARCHIVE } from './decision-memory/world-decision-memory-archive.port';

/**
 * Memory Module
 * 
 * 提供 TripNARA Agent 的记忆层能力：
 * - L1: 用户旅行人格
 * - L2: 路线决策记忆
 * - L3: 路线健康记忆
 * - L4: 行为反馈记忆
 */
@Module({
  imports: [PrismaModule, FlywheelModule, EventEmitterModule, forwardRef(() => RedisModule)],
  providers: [
    MemoryService,
    UserProfileMapperService,
    DecisionParamsMappingV2Service,
    ShadowModeDiffService,
    DecisionParamsInjectorService,
    PersonaIdentificationService,
    MultiPersonaManagerService,
    PersonaStateManagerService,
    AgentMemoryContextStore,
    AgentExecutionContextStore,
    AgentExecutionContextFactoryService,
    ExecutionTimelineRecorderService,
    MemoryContextAssemblerService,
    MemoryWritePipelineService,
    DecisionReplayService,
    MemorySnapshotPersistenceService,
    PrismaWorldDecisionMemoryArchiveService,
    { provide: WORLD_DECISION_MEMORY_ARCHIVE, useExisting: PrismaWorldDecisionMemoryArchiveService },
    WorldDecisionMemoryService,
  ],
  exports: [
    MemoryService,
    UserProfileMapperService,
    DecisionParamsInjectorService,
    PersonaIdentificationService,
    MultiPersonaManagerService,
    PersonaStateManagerService,
    AgentMemoryContextStore,
    AgentExecutionContextStore,
    AgentExecutionContextFactoryService,
    ExecutionTimelineRecorderService,
    MemoryContextAssemblerService,
    DecisionReplayService,
    MemorySnapshotPersistenceService,
    PrismaWorldDecisionMemoryArchiveService,
    WorldDecisionMemoryService,
  ],
})
export class MemoryModule {}


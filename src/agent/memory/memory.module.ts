// src/agent/memory/memory.module.ts

import { Module, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LlmModule } from '../../llm/llm.module';
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
import { LedgerRecomputeExecutorService } from './decision-ledger/ledger-recompute-executor.service';
import { LedgerDriftAuditService } from './decision-ledger/ledger-drift-audit.service';
import { LedgerPendingAuditStoreService } from './decision-ledger/ledger-pending-audit.store.service';
import { LedgerWritebackService } from './decision-ledger/ledger-writeback.service';
import { LEDGER_LOGIC_CONSTRAINT_VALIDATORS } from './decision-ledger/ledger-logic-constraint-validator.port';
import { TimelineLedgerLogicConstraintValidator } from './decision-ledger/ledger-timeline-logic-constraint.validator';
import { IncrementalRecomputeOrchestratorService } from './decision-ledger/incremental-recompute-orchestrator.service';
import { ConstraintSinkService } from './constraint-sink/constraint-sink.service';
import { UserMemoryConsoleService } from './console/user-memory-console.service';
import { MemoryConsoleController } from './console/memory-console.controller';
import { TripDomainInfluenceModule } from '../../trips/domain-influence/trip-domain-influence.module';
import { MemoryStateDecisionParamsService } from './services/memory-state-decision-params.service';
import { TripIntentDigestService } from './services/trip-intent-digest.service';
import { EpisodicMemorySummarizerService } from './services/episodic-memory-summarizer.service';

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
  imports: [PrismaModule, FlywheelModule, EventEmitterModule, forwardRef(() => RedisModule), TripDomainInfluenceModule, forwardRef(() => LlmModule)],
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
    LedgerRecomputeExecutorService,
    LedgerDriftAuditService,
    LedgerPendingAuditStoreService,
    {
      provide: LEDGER_LOGIC_CONSTRAINT_VALIDATORS,
      useValue: [new TimelineLedgerLogicConstraintValidator()],
    },
    LedgerWritebackService,
    IncrementalRecomputeOrchestratorService,
    ConstraintSinkService,
    UserMemoryConsoleService,
    TripIntentDigestService,
    MemoryStateDecisionParamsService,
    EpisodicMemorySummarizerService,
  ],
  controllers: [MemoryConsoleController],
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
    LedgerRecomputeExecutorService,
    LedgerDriftAuditService,
    LedgerPendingAuditStoreService,
    LedgerWritebackService,
    IncrementalRecomputeOrchestratorService,
    ConstraintSinkService,
    UserMemoryConsoleService,
    TripIntentDigestService,
    MemoryStateDecisionParamsService,
    EpisodicMemorySummarizerService,
  ],
})
export class MemoryModule {}


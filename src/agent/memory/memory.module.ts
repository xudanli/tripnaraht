// src/agent/memory/memory.module.ts

import { Module } from '@nestjs/common';
import { MemoryService } from './services/memory.service';
import { UserProfileMapperService } from './services/user-profile-mapper.service';
import { DecisionParamsInjectorService } from './services/decision-params-injector.service';
import { PersonaIdentificationService } from './services/persona-identification.service';
import { PersonaStateManagerService } from './services/persona-state-manager.service';
import { MultiPersonaManagerService } from './services/multi-persona-manager.service';
import { PrismaModule } from '../../prisma/prisma.module';

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
  imports: [PrismaModule],
  providers: [
    MemoryService,
    UserProfileMapperService,
    DecisionParamsInjectorService,
    PersonaIdentificationService,
    MultiPersonaManagerService,
    PersonaStateManagerService,
  ],
  exports: [
    MemoryService,
    UserProfileMapperService,
    DecisionParamsInjectorService,
    PersonaIdentificationService,
    MultiPersonaManagerService,
    PersonaStateManagerService,
  ],
})
export class MemoryModule {}


// src/agent/memory/memory.module.ts

import { Module } from '@nestjs/common';
import { MemoryService } from './services/memory.service';
import { UserProfileMapperService } from './services/user-profile-mapper.service';
import { DecisionParamsInjectorService } from './services/decision-params-injector.service';
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
  providers: [MemoryService, UserProfileMapperService, DecisionParamsInjectorService],
  exports: [MemoryService, UserProfileMapperService, DecisionParamsInjectorService],
})
export class MemoryModule {}


/**
 * Memory Controller
 *
 * Provides HTTP API for episodic and semantic memory operations.
 * Round 3: Dual-memory architecture with ACT-R decay.
 */

import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import {
  EpisodicMemoryService,
  EpisodicMemoryRequest,
  EpisodicMemoryRetrievalRequest,
} from './episodic-memory.service';
import {
  SemanticMemoryService,
  SemanticMemoryReflectionRequest,
  SemanticMemoryRetrievalRequest,
} from './semantic-memory.service';
import { EpisodicMemory, MemoryType } from '../attribution/types/self-evolution.types';

@Controller('memory')
export class MemoryController {
  constructor(
    private readonly episodicMemoryService: EpisodicMemoryService,
    private readonly semanticMemoryService: SemanticMemoryService,
  ) {}

  // ============================================
  // Episodic Memory Endpoints
  // ============================================

  /**
   * Generate episodic memory from trip events
   * POST /memory/episodic
   */
  @Post('episodic')
  @HttpCode(HttpStatus.CREATED)
  async generateEpisodicMemory(
    @Body() request: EpisodicMemoryRequest,
  ) {
    return this.episodicMemoryService.generate(request);
  }

  /**
   * Retrieve episodic memories for a user
   * GET /memory/episodic/:userId
   */
  @Get('episodic/:userId')
  async retrieveEpisodicMemories(
    @Param('userId') userId: string,
    @Query('topK') topK?: string,
    @Query('minActivationScore') minActivationScore?: string,
    @Query('season') season?: string,
  ) {
    const request: EpisodicMemoryRetrievalRequest = {
      userId,
      topK: topK ? parseInt(topK, 10) : undefined,
      minActivationScore: minActivationScore ? parseFloat(minActivationScore) : undefined,
      season,
    };
    return this.episodicMemoryService.retrieve(request);
  }

  /**
   * Reset memories on life event
   * POST /memory/episodic/:userId/reset
   */
  @Post('episodic/:userId/reset')
  @HttpCode(HttpStatus.OK)
  async resetOnLifeEvent(
    @Param('userId') userId: string,
    @Body('eventType') eventType: string,
  ) {
    return this.episodicMemoryService.resetOnLifeEvent(userId, eventType as any);
  }

  /**
   * Apply social correction
   * POST /memory/episodic/:memoryId/social-correction
   */
  @Post('episodic/:memoryId/social-correction')
  @HttpCode(HttpStatus.OK)
  async applySocialCorrection(
    @Param('memoryId') memoryId: string,
    @Body('companionId') companionId: string,
    @Body('correctionFactor') correctionFactor: number,
  ) {
    return this.episodicMemoryService.applySocialCorrection(
      memoryId,
      companionId,
      correctionFactor,
    );
  }

  // ============================================
  // Semantic Memory Endpoints
  // ============================================

  /**
   * Reflect: generate semantic memories from episodic memories
   * POST /memory/semantic/reflect
   */
  @Post('semantic/reflect')
  @HttpCode(HttpStatus.CREATED)
  async reflect(
    @Body() request: SemanticMemoryReflectionRequest,
  ) {
    return this.semanticMemoryService.reflect(request);
  }

  /**
   * Retrieve semantic memories for a user
   * GET /memory/semantic/:userId
   */
  @Get('semantic/:userId')
  async retrieveSemanticMemories(
    @Param('userId') userId: string,
    @Query('topK') topK?: string,
    @Query('minConfidence') minConfidence?: string,
    @Query('pattern') pattern?: string,
  ) {
    const request: SemanticMemoryRetrievalRequest = {
      userId,
      topK: topK ? parseInt(topK, 10) : undefined,
      minConfidence: minConfidence ? parseFloat(minConfidence) : undefined,
      pattern,
    };
    return this.semanticMemoryService.retrieve(request);
  }

  /**
   * Update semantic memory
   * POST /memory/semantic/:memoryId
   */
  @Post('semantic/:memoryId')
  @HttpCode(HttpStatus.OK)
  async updateSemanticMemory(
    @Param('memoryId') memoryId: string,
    @Body() updates: any,
  ) {
    return this.semanticMemoryService.updateMemory(memoryId, updates);
  }

  /**
   * Merge semantic memories
   * POST /memory/semantic/merge
   */
  @Post('semantic/merge')
  @HttpCode(HttpStatus.OK)
  async mergeSemanticMemories(
    @Body('memoryIds') memoryIds: string[],
  ) {
    return this.semanticMemoryService.mergeMemories(memoryIds);
  }

  /**
   * Schedule reflection (for cron job)
   * POST /memory/semantic/schedule-reflection
   */
  @Post('semantic/schedule-reflection')
  @HttpCode(HttpStatus.OK)
  async scheduleReflection(
    @Body('userId') userId: string,
    @Body('episodicMemoryIds') episodicMemoryIds: string[],
  ) {
    // Get episodic memories by IDs (simplified)
    const episodicMemories = episodicMemoryIds.map(id => ({
      id,
      userId,
      tripId: '',
      type: MemoryType.EPISODIC,
      content: '',
      embedding: [],
      activationScore: 1.0,
      lastAccessedAt: new Date(),
      accessHistory: [],
      seasonalityFactor: { season: 'spring', activation: 1.0 },
      socialCorrection: [],
      confidence: 0.7,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    return this.semanticMemoryService.scheduleReflection(
      userId,
      episodicMemories as unknown as EpisodicMemory[],
    );
  }
}

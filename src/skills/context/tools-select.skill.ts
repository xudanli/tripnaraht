// src/skills/context/tools-select.skill.ts
/**
 * tripnara.tools.select
 * 
 * P0: 工具选择（Tool RAG）
 * 
 * 输入：用户请求 + planning_phase + 当前已知 state
 * 输出：3-5 个工具（含 JSON schema 简版+调用建议）
 */

import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { SkillsRegistryService } from '../services/skills-registry.service';
import { EmbeddingService } from '../../places/services/embedding.service';

export interface ToolsSelectInput extends SkillInput {
  /** 用户请求 */
  userQuery: string;
  
  /** 规划阶段 */
  planningPhase: string;
  
  /** 当前已知 state（摘要） */
  currentState?: {
    tripId?: string;
    phase?: string;
    agent?: string;
    constraints?: string[];
  };
  
  /** 工具分组过滤（可选） */
  toolGroupFilter?: 'DOMAIN' | 'CONTEXT' | 'ALL';
  
  /** 是否排除 Context Tools（默认 false） */
  excludeContextTools?: boolean;

  /** 与编排超时联动：已 abort 时跳过向量检索 */
  abortSignal?: AbortSignal;
}

export interface ToolsSelectOutput extends SkillOutput {
  /** 推荐的工具列表 */
  tools: Array<{
    /** 工具名称（skill name） */
    name: string;
    
    /** 工具描述 */
    description: string;
    
    /** JSON schema 简版 */
    schema: Record<string, any>;
    
    /** 调用建议 */
    suggestion: string;
    
    /** 优先级 (0-100) */
    priority: number;
    
    /** 为什么推荐这个工具 */
    reason: string;
  }>;
  
  /** 推荐总数 */
  totalTools: number;
}

@Injectable()
export class ToolsSelectSkill implements Skill<ToolsSelectInput, ToolsSelectOutput> {
  private readonly logger = new Logger(ToolsSelectSkill.name);

  metadata = {
    name: 'tools.select',
    description: '工具选择（Tool RAG）：根据用户请求、规划阶段和当前状态，推荐 3-5 个最相关的工具',
    version: '1.0.0',
    category: 'rag' as const,
    toolGroup: 'CONTEXT' as const,
  };

  /** Tool RAG 向量路径（embedding 缓存在 EmbeddingService / Redis） */
  private cacheEnabled = true;

  /** 向量打分前最多考虑的 skill 数（预过滤 + 批量 embedding） */
  private readonly maxVectorSkills = 56;

  private skillsRegistry?: SkillsRegistryService;

  constructor(
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject(EmbeddingService) private readonly embeddingService?: EmbeddingService,
  ) {
    // ⚠️ 使用懒加载避免循环依赖死锁
    // SkillsRegistryService 在 execute 方法中通过 ModuleRef 获取
    
    // 如果 EmbeddingService 可用，启用向量检索；否则降级到规则匹配
    if (this.embeddingService) {
      this.logger.log('Tool RAG Embedding 已启用，将使用向量检索');
    } else {
      this.logger.warn('EmbeddingService 未注入，Tool RAG 将降级到规则匹配');
    }
  }

  /**
   * 懒加载获取 SkillsRegistryService
   * 避免在构造函数中注入，防止循环依赖死锁
   */
  private getSkillsRegistry(): SkillsRegistryService {
    if (!this.skillsRegistry) {
      try {
        this.skillsRegistry = this.moduleRef.get(SkillsRegistryService, { strict: false });
      } catch (error) {
        this.logger.error('无法获取 SkillsRegistryService，tools.select 功能将不可用');
        throw new Error('SkillsRegistryService 未注入，tools.select 功能不可用');
      }
    }
    return this.skillsRegistry;
  }

  async execute(input: ToolsSelectInput): Promise<ToolsSelectOutput> {
    this.logger.debug(
      `执行 tools.select: phase=${input.planningPhase}, userQuery=${input.userQuery.substring(0, 50)}...`,
    );

    try {
      if (input.abortSignal?.aborted) {
        return { tools: [], totalTools: 0 };
      }

      // 1. 获取所有可用工具
      const skillsRegistry = this.getSkillsRegistry();
      let allSkills = skillsRegistry.getAllSkills();

      // 1.1 按工具分组过滤（如果指定）
      if (input.toolGroupFilter && input.toolGroupFilter !== 'ALL') {
        allSkills = this.filterByToolGroup(allSkills, input.toolGroupFilter);
      } else if (input.excludeContextTools) {
        // 排除 Context Tools（只保留 Domain Tools）
        allSkills = this.filterByToolGroup(allSkills, 'DOMAIN');
      }

      // 2. 基于 phase 的规则匹配（第一阶段：规则匹配）
      const phaseTools = this.selectToolsByPhase(input.planningPhase, allSkills);

      // 3. 基于用户请求的匹配（优先向量检索，降级到关键词匹配）
      let queryTools: any[];
      if (this.embeddingService && this.cacheEnabled) {
        const forVector = this.prefilterSkillsForVectorSearch(input.userQuery, allSkills);
        queryTools = await this.selectToolsByVectorSimilarity(
          input.userQuery,
          forVector,
          input.abortSignal,
        );
      } else {
        queryTools = this.selectToolsByQuery(input.userQuery, allSkills);
      }

      // 4. 合并并去重
      const candidateTools = this.mergeAndDeduplicate(phaseTools, queryTools);

      // 5. 排序并选择 Top-K（3-5 个）
      const selectedTools = this.rankAndSelect(candidateTools, input.userQuery, input.planningPhase, 5);

      // 6. 构建输出（包含简化的 schema）
      const tools = selectedTools.map((skill) => ({
        name: skill.metadata.name,
        description: skill.metadata.description,
        schema: this.buildSimplifiedSchema(skill),
        suggestion: this.buildSuggestion(skill, input.userQuery, input.planningPhase),
        priority: this.calculatePriority(skill, input.userQuery, input.planningPhase),
        reason: this.buildReason(skill, input.userQuery, input.planningPhase),
      }));

      return {
        tools,
        totalTools: tools.length,
      };
    } catch (error: any) {
      this.logger.error(`工具选择失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 基于 phase 选择工具（规则匹配）
   */
  private selectToolsByPhase(phase: string, allSkills: any[]): any[] {
    const phaseToolMap: Record<string, string[]> = {
      planning: [
        'context.build',
        'routeDirection.pickForIntent',
        'world.buildContext',
        'safetravel.get_advisories',
        'iceland.rentalGuidance',
      ],
      decision: ['decision.abuCheck', 'decision.drdrePace', 'decision.neptuneRepair'],
      adjustment: ['itinerary.smart_update', 'decision.drdrePace', 'decision.neptuneRepair', 'plan.selectSlices'],
      repair: ['itinerary.smart_update', 'decision.neptuneRepair', 'plan.selectSlices'],
      readiness: [
        'readiness.generateChecklist',
        'readiness.summarizeRisks',
        'safetravel.get_advisories',
        'iceland.rentalGuidance',
      ],
      countryPack: ['countryPack.newSkeleton', 'countryPack.validate'],
    };

    const phaseKey = phase.toLowerCase();
    const toolNames = phaseToolMap[phaseKey] || [];

    return allSkills.filter((skill) => toolNames.includes(skill.metadata.name));
  }

  /**
   * 基于用户请求选择工具（关键词匹配）
   */
  private selectToolsByQuery(userQuery: string, allSkills: any[]): any[] {
    const queryLower = userQuery.toLowerCase();
    const keywords: Record<string, string[]> = {
      route: ['routeDirection.pickForIntent', 'routeDirection.listForCountry'],
      decision: ['decision.abuCheck', 'decision.drdrePace', 'decision.neptuneRepair'],
      checklist: ['readiness.generateChecklist'],
      country: ['countryPack.newSkeleton', 'countryPack.validate'],
      context: ['context.build', 'world.buildContext'],
      plan: ['plan.selectSlices', 'itinerary.smart_update'],
      tools: ['tools.select'],
      改行程: ['itinerary.smart_update', 'itinerary.verify'],
      修改行程: ['itinerary.smart_update'],
      调整行程: ['itinerary.smart_update', 'plan.selectSlices'],
      // 冰岛 / 高地 / 官方旅行安全 RSS（与天气、路况证据互补）
      iceland: ['safetravel.get_advisories', 'iceland.rentalGuidance'],
      冰岛: ['safetravel.get_advisories', 'iceland.rentalGuidance'],
      highland: ['safetravel.get_advisories', 'iceland.rentalGuidance'],
      高地: ['safetravel.get_advisories', 'iceland.rentalGuidance'],
      'f-road': ['safetravel.get_advisories', 'iceland.rentalGuidance'],
      'f路': ['safetravel.get_advisories', 'iceland.rentalGuidance'],
      safetravel: ['safetravel.get_advisories'],
      landmannalaugar: ['safetravel.get_advisories', 'iceland.rentalGuidance'],
      租车: ['iceland.rentalGuidance', 'safetravel.get_advisories'],
      车行: ['iceland.rentalGuidance'],
      carrental: ['iceland.rentalGuidance'],
    };

    const matchedToolNames: string[] = [];
    for (const [keyword, toolNames] of Object.entries(keywords)) {
      if (queryLower.includes(keyword)) {
        matchedToolNames.push(...toolNames);
      }
    }

    return allSkills.filter((skill) => matchedToolNames.includes(skill.metadata.name));
  }

  /**
   * 合并并去重
   */
  private mergeAndDeduplicate(tools1: any[], tools2: any[]): any[] {
    const seen = new Set<string>();
    const merged: any[] = [];

    for (const tool of [...tools1, ...tools2]) {
      const name = tool.metadata.name;
      if (!seen.has(name)) {
        seen.add(name);
        merged.push(tool);
      }
    }

    return merged;
  }

  /**
   * 在进入昂贵向量计算前按关键词/ token 重叠缩小候选集（仍保留 merge 与 phase 路径的完整性）
   */
  private prefilterSkillsForVectorSearch(userQuery: string, allSkills: any[]): any[] {
    if (allSkills.length <= this.maxVectorSkills) {
      return allSkills;
    }
    const q = userQuery.toLowerCase();
    const tokens = [...new Set(q.split(/[\s,，。.!?；]+/).filter((t) => t.length > 1))];
    const scored = allSkills.map((skill) => {
      const hay = `${skill.metadata.name} ${skill.metadata.description}`.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (hay.includes(tok)) score += 3;
      }
      const cat = skill.metadata.category ? String(skill.metadata.category).toLowerCase() : '';
      if (cat && q.includes(cat)) score += 2;
      return { skill, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, this.maxVectorSkills).map((x) => x.skill);
  }

  /**
   * 基于向量相似度选择工具（Tool RAG Embedding）
   */
  private async selectToolsByVectorSimilarity(
    userQuery: string,
    allSkills: any[],
    abortSignal?: AbortSignal,
  ): Promise<any[]> {
    if (!this.embeddingService) {
      return this.selectToolsByQuery(userQuery, allSkills);
    }
    if (abortSignal?.aborted) {
      return [];
    }

    try {
      const queryEmbedding = await this.embeddingService.generateEmbedding(userQuery);
      if (abortSignal?.aborted) {
        return [];
      }

      const skillTexts = allSkills.map(
        (skill) => `${skill.metadata.name} ${skill.metadata.description}`,
      );
      const skillEmbeddings = await this.embeddingService.embedTextsOrdered(skillTexts);
      if (abortSignal?.aborted) {
        return [];
      }

      const skillWithScores = allSkills.map((skill, idx) => ({
        skill,
        similarity: this.cosineSimilarity(queryEmbedding, skillEmbeddings[idx]),
      }));

      skillWithScores.sort((a, b) => b.similarity - a.similarity);

      const threshold = 0.3;
      return skillWithScores
        .filter((item) => item.similarity >= threshold)
        .map((item) => item.skill);
    } catch (error: any) {
      this.logger.warn(`向量检索失败，降级到关键词匹配: ${error.message}`);
      return this.selectToolsByQuery(userQuery, allSkills);
    }
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error('向量维度不匹配');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * 排序并选择 Top-K
   */
  private rankAndSelect(
    tools: any[], 
    userQuery: string, 
    phase: string, 
    k: number,
    skipReScoring: boolean = false,
  ): any[] {
    // 如果已经使用向量检索排序，且相似度分数已包含在工具中，可以直接返回
    if (skipReScoring && tools.length > 0) {
      return tools.slice(0, k);
    }

    // 简单排序：优先考虑 phase 匹配的，然后是 description 匹配的
    const scored = tools.map((tool) => ({
      tool,
      score: this.calculatePriority(tool, userQuery, phase),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, k).map((item) => item.tool);
  }

  /**
   * 计算优先级
   */
  private calculatePriority(skill: any, userQuery: string, phase: string): number {
    let score = 50; // 基础分

    // Phase 匹配加分
    const phaseToolMap: Record<string, string[]> = {
      planning: ['context.build', 'routeDirection.pickForIntent', 'safetravel.get_advisories'],
      decision: ['decision.abuCheck', 'decision.drdrePace'],
      adjustment: ['decision.drdrePace', 'itinerary.smart_update'],
      repair: ['decision.neptuneRepair', 'itinerary.smart_update'],
      readiness: ['readiness.generateChecklist', 'safetravel.get_advisories'],
    };
    const phaseKey = phase.toLowerCase();
    if (phaseToolMap[phaseKey]?.includes(skill.metadata.name)) {
      score += 30;
    }

    // 描述匹配加分
    const queryLower = userQuery.toLowerCase();
    const descLower = skill.metadata.description.toLowerCase();
    if (queryLower.split(' ').some((word) => descLower.includes(word))) {
      score += 20;
    }

    return Math.min(100, score);
  }

  /**
   * 构建简化 schema
   */
  private buildSimplifiedSchema(_skill: any): Record<string, any> {
    // 简化实现：返回基本结构
    // 实际应该从 skill 的输入接口中提取
    return {
      type: 'object',
      properties: {
        // 这里应该从 skill 的实际输入接口中提取
      },
    };
  }

  /**
   * 构建调用建议
   */
  private buildSuggestion(skill: any, userQuery: string, phase: string): string {
    return `根据当前阶段 "${phase}" 和用户请求，建议调用 ${skill.metadata.name} 来处理相关任务。`;
  }

  /**
   * 构建推荐原因
   */
  private buildReason(skill: any, userQuery: string, phase: string): string {
    const phaseMatch = this.selectToolsByPhase(phase, [skill]).length > 0;
    const queryMatch = this.selectToolsByQuery(userQuery, [skill]).length > 0;

    if (phaseMatch && queryMatch) {
      return `同时匹配规划阶段 "${phase}" 和用户请求关键词`;
    } else if (phaseMatch) {
      return `匹配规划阶段 "${phase}"`;
    } else if (queryMatch) {
      return '匹配用户请求关键词';
    } else {
      return '通用工具推荐';
    }
  }

  /**
   * 按工具分组过滤
   */
  private filterByToolGroup(skills: any[], toolGroup: 'DOMAIN' | 'CONTEXT'): any[] {
    return skills.filter((skill) => {
      const group = skill.metadata.toolGroup;
      
      // 如果没有设置 toolGroup，根据 category 推断
      if (!group) {
        // Context Tools: rag, world
        // Domain Tools: decision, dem, routeDirection, countryPack, readiness, etc.
        const contextCategories = ['rag', 'world'];
        const isContext = contextCategories.includes(skill.metadata.category);
        return toolGroup === 'CONTEXT' ? isContext : !isContext;
      }
      
      return group === toolGroup;
    });
  }
}
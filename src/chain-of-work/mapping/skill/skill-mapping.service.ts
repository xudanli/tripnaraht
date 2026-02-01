// src/chain-of-work/mapping/skill/skill-mapping.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { OrchestratorState } from '../../../agent/interfaces/trip-plan.interface';
import { SkillsRegistryService } from '../../../skills/services/skills-registry.service';
import { Skill } from '../../../skills/interfaces/skill.interface';
import { TripNARAStepDraft, SkillMapping } from '../../interfaces/chain-of-work.interface';

/**
 * Skills 映射服务
 */
@Injectable()
export class SkillMappingService {
  private readonly logger = new Logger(SkillMappingService.name);
  private readonly cache = new Map<string, SkillMapping[]>();

  constructor(
    private readonly skillsRegistry: SkillsRegistryService,
  ) {}

  /**
   * 将步骤映射到 Skills
   */
  async mapStepToSkills(
    step: TripNARAStepDraft,
    context?: OrchestratorState,
  ): Promise<SkillMapping[]> {
    this.logger.debug(`[SkillMapping] 开始映射步骤到 Skills: step_id=${step.id}, step_type=${step.step_type}`);
    
    // 1. 检查缓存
    const cacheKey = this.getCacheKey(step);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger.debug(`[SkillMapping] 使用缓存结果: ${cached.length} 个匹配`);
      return cached;
    }
    
    // 2. 获取所有 Skills
    const skills = this.skillsRegistry.getAllSkills();
    
    // 3. 计算匹配分数
    const matches = await Promise.all(
      skills.map(skill => this.calculateMatchScore(step, skill)),
    );
    
    // 4. 返回 Top-K 匹配结果（按置信度排序）
    const topMatches = matches
      .filter(m => m.score > 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(m => ({
        step_id: step.id,
        skill_name: m.skill.metadata?.name || 'unknown',
        confidence: m.score,
        matching_reason: this.explainMatch(step, m.skill),
      }));
    
    // 5. 缓存结果
    this.cache.set(cacheKey, topMatches);
    
    this.logger.debug(`[SkillMapping] 映射完成: ${topMatches.length} 个匹配`);
    
    return topMatches;
  }

  /**
   * 计算匹配分数
   */
  private async calculateMatchScore(
    step: TripNARAStepDraft,
    skill: Skill,
  ): Promise<{ skill: Skill; score: number }> {
    // 1. 关键词匹配
    const keywordScore = this.keywordMatch(step, skill);
    
    // 2. 类型匹配
    const typeScore = this.typeMatch(step, skill);
    
    // 3. 综合分数（加权平均）
    const score = keywordScore * 0.7 + typeScore * 0.3;
    
    return { skill, score };
  }

  /**
   * 关键词匹配
   */
  private keywordMatch(step: TripNARAStepDraft, skill: Skill): number {
    const stepText = `${step.title} ${step.description}`.toLowerCase();
    const skillName = (skill.metadata?.name || '').toLowerCase();
    const skillDesc = (skill.metadata?.description || '').toLowerCase();
    
    // 检查步骤文本中是否包含 Skill 名称或描述中的关键词
    const keywords = skillName.split('.').concat(skillDesc.split(' '));
    let matchCount = 0;
    
    for (const keyword of keywords) {
      if (keyword.length > 2 && stepText.includes(keyword)) {
        matchCount++;
      }
    }
    
    // 归一化到 0-1
    return Math.min(matchCount / Math.max(keywords.length, 1), 1);
  }

  /**
   * 类型匹配
   */
  private typeMatch(step: TripNARAStepDraft, skill: Skill): number {
    // RESEARCH 步骤应该匹配数据收集类 Skills
    if (step.step_type === 'RESEARCH') {
      const dataCollectionKeywords = ['search', 'get', 'find', 'query', 'fetch'];
      const skillName = (skill.metadata?.name || '').toLowerCase();
      
      for (const keyword of dataCollectionKeywords) {
        if (skillName.includes(keyword)) {
          return 0.8;
        }
      }
    }
    
    return 0.3; // 默认分数
  }

  /**
   * 解释匹配原因
   */
  private explainMatch(step: TripNARAStepDraft, skill: Skill): string {
    const skillName = skill.metadata?.name || 'unknown';
    return `步骤 "${step.title}" 匹配到 Skill "${skillName}"，基于关键词和类型匹配`;
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(step: TripNARAStepDraft): string {
    return `${step.step_type}:${step.title}:${step.description}`;
  }
}
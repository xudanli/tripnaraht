// src/skills/detail/detail-show-evidence.skill.ts
/**
 * skill.detail.showEvidence
 * 
 * 目的：展示证据（基于证据引用）
 * 
 * System 1 技能：快速展示
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { EvidenceEnvelope } from '../plan/shared/plan-state.types';

export interface DetailShowEvidenceInput extends SkillInput {
  /** Trip ID */
  tripId: string;
  
  /** 证据引用 ID 列表（可选，如果不提供则返回所有证据） */
  evidenceRefs?: string[];
  
  /** PlanState（可选，如果有） */
  planState?: any;
}

export interface DetailShowEvidenceOutput extends SkillOutput {
  /** 证据列表 */
  evidence: Array<{
    id: string;
    source: string;
    excerpt: string;
    relevance: string;
    confidence: 'low' | 'medium' | 'high';
  }>;
}

@Injectable()
export class DetailShowEvidenceSkill implements Skill<DetailShowEvidenceInput, DetailShowEvidenceOutput> {
  private readonly logger = new Logger(DetailShowEvidenceSkill.name);

  metadata = {
    name: 'detail.showEvidence',
    description: '展示证据（基于证据引用），让用户了解决策依据',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: DetailShowEvidenceInput): Promise<DetailShowEvidenceOutput> {
    this.logger.debug(`执行 detail.showEvidence: tripId=${input.tripId}`);

    try {
      // 从 PlanState 中提取证据
      const evidenceRefs = input.planState?.evidence_refs || [];
      
      const evidence = evidenceRefs.map((env: EvidenceEnvelope, index: number) => ({
        id: `evidence_${index}`,
        source: env.source_title,
        excerpt: env.excerpt,
        relevance: env.relevance,
        confidence: env.confidence,
      }));

      // 如果指定了证据引用，只返回匹配的
      if (input.evidenceRefs && input.evidenceRefs.length > 0) {
        // TODO: 根据 evidenceRefs 过滤
      }

      return {
        evidence,
      };
    } catch (error: any) {
      this.logger.error(`展示证据失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}

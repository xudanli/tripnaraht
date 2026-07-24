// src/skills/plan/evidence/plan-evidence-build-envelope.skill.ts
/**
 * skill.plan.evidence.buildEnvelope
 * 
 * 目的：统一 Evidence 结构，让所有结论可解释、可审计、可对比
 * 
 * System 1 技能：快速封装
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { EvidenceEnvelope } from '../shared/plan-state.types';

export interface PlanEvidenceBuildEnvelopeInput extends SkillInput {
  /** 证据来源标题 */
  source_title: string;
  
  /** 证据来源 URL（可选） */
  source_url?: string;
  
  /** 发布者（可选） */
  publisher?: string;
  
  /** 发布时间（可选） */
  published_at?: string;
  
  /** 摘录内容 */
  excerpt: string;
  
  /** 相关性说明 */
  relevance: string;
  
  /** 置信度 */
  confidence?: 'LOW' | 'MEDIUM' | 'HIGH';
  
  /** 数据时间戳（可选） */
  data_timestamp?: string;
}

export interface PlanEvidenceBuildEnvelopeOutput extends SkillOutput {
  /** 证据信封 */
  envelope: EvidenceEnvelope;
}

@Injectable()
export class PlanEvidenceBuildEnvelopeSkill implements Skill<PlanEvidenceBuildEnvelopeInput, PlanEvidenceBuildEnvelopeOutput> {
  private readonly logger = new Logger(PlanEvidenceBuildEnvelopeSkill.name);

  metadata = {
    name: 'plan.evidence.buildEnvelope',
    description: '构建 plan 统一 evidence envelope，使结论可解释可审计。在 gate/decision 输出需绑定证据引用时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: PlanEvidenceBuildEnvelopeInput): Promise<PlanEvidenceBuildEnvelopeOutput> {
    this.logger.debug(`执行 plan.evidence.buildEnvelope: source=${input.source_title}`);

    try {
      const envelope: EvidenceEnvelope = {
        source_title: input.source_title,
        source_url: input.source_url,
        publisher: input.publisher,
        published_at: input.published_at,
        retrieved_at: new Date().toISOString(),
        excerpt: input.excerpt,
        relevance: input.relevance,
        confidence: input.confidence || 'MEDIUM',
        data_timestamp: input.data_timestamp,
      };

      return {
        envelope,
      };
    } catch (error: any) {
      this.logger.error(`构建证据信封失败: ${error.message}`, error.stack);
      throw error;
    }
  }
}

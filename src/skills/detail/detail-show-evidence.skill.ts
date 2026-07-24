// src/skills/detail/detail-show-evidence.skill.ts
/**
 * skill.detail.showEvidence
 */

import { Injectable, Logger } from '@nestjs/common';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { EvidenceEnvelope } from '../plan/shared/plan-state.types';

export interface DetailShowEvidenceInput extends SkillInput {
  tripId: string;
  evidenceRefs?: string[];
  planState?: any;
}

export interface DetailShowEvidenceOutput extends SkillOutput {
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
    description: 'detail.showEvidence：展示 decision evidence 引用与依据摘要。在用户需要验证结论来源或 detail 页展示证据链时调用。',
    version: '1.0.0',
    category: 'trip' as const,
    toolGroup: 'DOMAIN' as const,
  };

  async execute(input: DetailShowEvidenceInput): Promise<DetailShowEvidenceOutput> {
    this.logger.debug(`执行 detail.showEvidence: tripId=${input.tripId}`);

    const evidenceRefs = input.planState?.evidence_refs || [];

    let evidence = evidenceRefs.map((env: EvidenceEnvelope, index: number) => ({
      id: `evidence_${index}`,
      source: env.source_title,
      excerpt: env.excerpt,
      relevance: env.relevance,
      confidence:
        env.confidence === 'LOW'
          ? 'low'
          : env.confidence === 'HIGH'
            ? 'high'
            : 'medium',
    }));

    if (input.evidenceRefs && input.evidenceRefs.length > 0) {
      const refSet = new Set(input.evidenceRefs);
      evidence = evidence.filter(
        (item: DetailShowEvidenceOutput['evidence'][number], index: number) =>
          refSet.has(item.id) ||
          refSet.has(`evidence_${index}`) ||
          refSet.has(evidenceRefs[index]?.source_title ?? ''),
      );
    }

    return { evidence };
  }
}

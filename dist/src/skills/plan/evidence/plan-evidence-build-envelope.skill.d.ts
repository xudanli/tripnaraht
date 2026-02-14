import { Skill, SkillInput, SkillOutput } from '../../interfaces/skill.interface';
import { EvidenceEnvelope } from '../shared/plan-state.types';
export interface PlanEvidenceBuildEnvelopeInput extends SkillInput {
    source_title: string;
    source_url?: string;
    publisher?: string;
    published_at?: string;
    excerpt: string;
    relevance: string;
    confidence?: 'LOW' | 'MEDIUM' | 'HIGH';
    data_timestamp?: string;
}
export interface PlanEvidenceBuildEnvelopeOutput extends SkillOutput {
    envelope: EvidenceEnvelope;
}
export declare class PlanEvidenceBuildEnvelopeSkill implements Skill<PlanEvidenceBuildEnvelopeInput, PlanEvidenceBuildEnvelopeOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    execute(input: PlanEvidenceBuildEnvelopeInput): Promise<PlanEvidenceBuildEnvelopeOutput>;
}

import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
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
export declare class DetailShowEvidenceSkill implements Skill<DetailShowEvidenceInput, DetailShowEvidenceOutput> {
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "trip";
        toolGroup: "DOMAIN";
    };
    execute(input: DetailShowEvidenceInput): Promise<DetailShowEvidenceOutput>;
}

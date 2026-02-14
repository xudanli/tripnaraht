import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import { DecisionLogStorageService } from '../../trips/decision/services/decision-log-storage.service';
import { WorldBuildContextSkill } from '../world/world-build-context.skill';
export interface DecisionExplainForHumanInput extends SkillInput {
    tripId?: string;
    decisionLog?: Array<{
        persona: string;
        action: string;
        explanation: string;
        reasonCodes?: string[];
        timestamp?: string;
    }>;
    world?: WorldModelContext;
}
export interface DecisionExplainForHumanOutput extends SkillOutput {
    userFacingNarrative: {
        abuSection: string;
        drdreSection: string;
        neptuneSection: string;
    };
    riskHighlights: Array<{
        risk: string;
        severity: 'high' | 'medium' | 'low';
        explanation: string;
    }>;
    tradeOffs: Array<{
        what: string;
        why: string;
        impact: string;
    }>;
    explanation?: string;
    summary?: string;
    keyPoints?: Array<{
        point: string;
        category: string;
    }>;
}
export declare class DecisionExplainForHumanSkill implements Skill<DecisionExplainForHumanInput, DecisionExplainForHumanOutput> {
    private readonly decisionLogStorage;
    private readonly worldBuildContext;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "decision";
    };
    constructor(decisionLogStorage: DecisionLogStorageService, worldBuildContext: WorldBuildContextSkill);
    execute(input: DecisionExplainForHumanInput): Promise<DecisionExplainForHumanOutput>;
    private generateAbuNarrative;
    private generateDrdreNarrative;
    private generateNeptuneNarrative;
    private extractRiskHighlights;
    private extractTradeOffs;
}

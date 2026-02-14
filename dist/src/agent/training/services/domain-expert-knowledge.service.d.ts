import { RedLineRule, SeasonalRisk, EvaluationSetAnnotation, AntiPatternCase } from '../interfaces/enhancement.interface';
export declare class DomainExpertKnowledgeService {
    private readonly logger;
    private readonly redLineRules;
    private readonly seasonalRisks;
    private readonly annotations;
    private readonly antiPatterns;
    constructor();
    addRedLineRule(rule: Omit<RedLineRule, 'rule_id'>): RedLineRule;
    addSeasonalRisk(risk: Omit<SeasonalRisk, 'risk_id'>): SeasonalRisk;
    addAnnotation(annotation: Omit<EvaluationSetAnnotation, 'annotation_id'>): EvaluationSetAnnotation;
    addAntiPattern(antiPattern: Omit<AntiPatternCase, 'case_id'>): AntiPatternCase;
    getRedLineRules(destination?: string): RedLineRule[];
    getSeasonalRisks(destination?: string, month?: number): SeasonalRisk[];
    private initializeKnowledge;
}

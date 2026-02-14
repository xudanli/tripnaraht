import { PrismaService } from '../../../prisma/prisma.service';
import { ConstraintRule, ConstraintCheckResult } from '../interfaces/safety-compliance.interface';
import { Itinerary } from '../../interfaces/trip-plan.interface';
import { ConstraintRuleManagerService } from './constraint-rule-manager.service';
export declare class ConstraintsEngineService {
    private readonly prisma;
    private readonly ruleManager?;
    private readonly logger;
    private readonly rules;
    constructor(prisma: PrismaService, ruleManager?: ConstraintRuleManagerService);
    private loadRules;
    checkConstraints(itinerary: Itinerary, context: {
        country_code?: string;
        season?: string;
        user_preferences?: Record<string, any>;
        model_version?: string;
    }): Promise<ConstraintCheckResult>;
    private checkRule;
    private checkRuleAsWarning;
    private checkGeographicConstraint;
    private checkTemporalConstraint;
    private checkComplianceConstraint;
    private checkUserPreferenceConstraint;
    private determineSevLevel;
    private initializeRules;
    addRule(rule: ConstraintRule): void;
    getAllRules(): ConstraintRule[];
}

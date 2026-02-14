import { ConfigService } from '@nestjs/config';
import { ConstraintRule, ConstraintType } from '../interfaces/safety-compliance.interface';
export declare class ConstraintRuleManagerService {
    private readonly configService;
    private readonly logger;
    private readonly rulesDir;
    private rulesCache;
    constructor(configService: ConfigService);
    loadRulesFromFile(type: ConstraintType): Promise<ConstraintRule[]>;
    getGeographicRules(): Promise<ConstraintRule[]>;
    getTemporalRules(): Promise<ConstraintRule[]>;
    getComplianceRules(): Promise<ConstraintRule[]>;
    getUserPreferenceRules(): Promise<ConstraintRule[]>;
    addRule(rule: ConstraintRule): Promise<void>;
    private validateRule;
    private getDefaultRules;
    clearCache(): void;
}

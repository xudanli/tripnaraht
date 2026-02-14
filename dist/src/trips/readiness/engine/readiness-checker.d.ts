import { ReadinessPack, SupportedLanguage } from '../types/readiness-pack.types';
import { TripContext } from '../types/trip-context.types';
import { ReadinessFinding, ReadinessCheckResult } from '../types/readiness-findings.types';
import { RiskQuantificationService } from '../services/risk-quantification.service';
export declare class ReadinessChecker {
    private readonly riskQuantificationService?;
    private ruleEngine;
    constructor(riskQuantificationService?: RiskQuantificationService);
    checkDestination(pack: ReadinessPack, context: TripContext, lang?: SupportedLanguage): ReadinessFinding;
    checkMultipleDestinations(packs: ReadinessPack[], context: TripContext, lang?: SupportedLanguage): ReadinessCheckResult;
    private enhanceContext;
    private ruleToFindingItem;
}

import { ThreeLayerExplanation, UserFriendlyExplanation } from '../interfaces/three-layer-explanation.interface';
import { DecisionRunLog } from '../decision-log';
import { TripPlan } from '../plan-model';
import { CheckerViolation } from '../constraints';
import { SourceAnnotationService } from '../../../data-quality/services/source-annotation.service';
export declare class ThreeLayerExplanationService {
    private readonly sourceAnnotationService?;
    private readonly logger;
    constructor(sourceAnnotationService?: SourceAnnotationService);
    generateThreeLayerExplanation(plan: TripPlan | null, log: DecisionRunLog, violations?: CheckerViolation[]): ThreeLayerExplanation;
    generateUserFriendlyExplanation(explanation: ThreeLayerExplanation): UserFriendlyExplanation;
    private generateConclusion;
    private generateReason;
    private generateEvidence;
    private extractDataSources;
    private extractCalculationMethod;
    private extractAssumptions;
    private extractLimitations;
    private buildEvidenceChain;
    private describeAction;
    private getActionType;
    private getActionInput;
    private getActionOutput;
    private getActionMethod;
    private inferSourceType;
    private inferSourceName;
}

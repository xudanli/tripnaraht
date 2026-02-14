import { UserTravelProfile } from '../interfaces/user-travel-profile.interface';
import { DecisionParams } from '../interfaces/decision-params.interface';
export declare class UserProfileMapperService {
    private readonly logger;
    mapUserProfileToDecisionParams(profile: UserTravelProfile): DecisionParams;
    private applyPacePreference;
    private applyAltitudeTolerance;
    private applyRiskTolerance;
    private applyTravelPhilosophy;
    mergeDecisionParams(paramsList: DecisionParams[]): DecisionParams;
}

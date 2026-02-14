import { DecisionParams } from '../interfaces/decision-params.interface';
import { MemoryService } from './memory.service';
import { UserProfileMapperService } from './user-profile-mapper.service';
export declare class DecisionParamsInjectorService {
    private readonly memoryService;
    private readonly profileMapper;
    private readonly logger;
    constructor(memoryService: MemoryService, profileMapper: UserProfileMapperService);
    getDecisionParamsForUser(userId: string): Promise<DecisionParams>;
    adjustRouteDirectionScore(routeDirectionId: number, countryCode: string, baseScore: number, decisionParams: DecisionParams, routeDirection?: any): Promise<number>;
    injectConstraintsToWorldModel(worldModel: any, decisionParams: DecisionParams): void;
    filterRouteDirectionByPreference(routeDirection: any, preferredRouteTypes: string[]): {
        shouldKeep: boolean;
        scoreMultiplier: number;
    };
}

import { RankingRequest, PoiRankingFeatures } from '../interfaces/ranking.interface';
import { FeasibilityService } from './feasibility.service';
export declare class RankingService {
    private feasibilityService;
    constructor(feasibilityService: FeasibilityService);
    rankPois(req: RankingRequest): PoiRankingFeatures[];
    private calculateLastEntrySlack;
}

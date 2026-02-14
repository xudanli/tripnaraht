import { WorldModelContext, RoutePlanDraft } from '../shared/world-model.types';
import { SpatialIssue } from '../interfaces/spatial-issue.interface';
import { Road } from '../interfaces/road.interface';
import { PoiStatusData } from '../interfaces/poi-status.interface';
import { Ferry } from '../interfaces/ferry.interface';
import { HazardZone } from '../interfaces/hazard.interface';
export interface RoadRepository {
    findBySegmentId(segmentId: string): Promise<Road | null>;
    findByPoiId(poiId: string): Promise<Road | null>;
}
export interface PoiRepository {
    findManyByIds(poiIds: string[]): Promise<PoiStatusData[]>;
    findById(poiId: string): Promise<PoiStatusData | null>;
}
export interface FerryRepository {
    findById(ferryId: string): Promise<Ferry | null>;
}
export interface HazardService {
    checkSegment(segmentId: string): Promise<HazardZone | null>;
}
export declare class SpatialIssueDetectorService {
    private readonly roadRepo?;
    private readonly poiRepo?;
    private readonly ferryRepo?;
    private readonly hazardService?;
    private readonly logger;
    constructor(roadRepo?: RoadRepository, poiRepo?: PoiRepository, ferryRepo?: FerryRepository, hazardService?: HazardService);
    detect(world: WorldModelContext, plan: RoutePlanDraft): Promise<SpatialIssue[]>;
    private detectEntryIssues;
    private detectPoiIssues;
    private detectSegmentIssues;
    private detectFerryIssues;
    private detectHazardIssues;
}

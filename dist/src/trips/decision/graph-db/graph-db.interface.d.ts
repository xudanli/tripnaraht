export type GraphNodeType = 'Place' | 'RouteDirection' | 'RouteSegment' | 'Country' | 'Region' | 'HumanCapabilityProfile';
export type GraphRelationType = 'CONNECTS_TO' | 'BELONGS_TO' | 'HAS_SEGMENT' | 'IN_COUNTRY' | 'IN_REGION' | 'SUITABLE_FOR' | 'REQUIRES' | 'AVOIDS';
export interface GraphNode {
    id: string;
    type: GraphNodeType;
    properties: Record<string, any>;
}
export interface GraphRelation {
    id: string;
    type: GraphRelationType;
    from: string;
    to: string;
    properties: Record<string, any>;
}
export interface PlaceNodeProperties {
    name: string;
    nameCN?: string;
    nameEN?: string;
    latitude: number;
    longitude: number;
    elevation?: number;
    slope?: number;
    distance?: number;
    demEvidence?: {
        cumulativeAscent?: number;
        maxSlopePct?: number;
        fatigueIndex?: number;
    };
    poiType?: string;
    countryCode: string;
    regionId?: string;
}
export interface RouteDirectionNodeProperties {
    name: string;
    nameCN: string;
    countryCode: string;
    tags: string[];
    philosophy?: string;
    constraints?: Record<string, any>;
}
export interface RouteSegmentNodeProperties {
    segmentId: string;
    dayIndex: number;
    distanceKm: number;
    ascentM: number;
    slopePct: number;
    fatigueIndex: number;
    rollingAscent3Days: number;
    routeDirectionId: string;
}
export interface HumanCapabilityProfileNodeProperties {
    profileId: string;
    maxDailyAscentM: number;
    rollingAscent3DaysM: number;
    maxSlopePct: number;
    preferredPace: 'SLOW' | 'MEDIUM' | 'FAST';
    riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
}
export interface GraphQueryResult {
    nodes: GraphNode[];
    relations: GraphRelation[];
    paths?: Array<{
        nodes: GraphNode[];
        relations: GraphRelation[];
        totalDistance?: number;
        totalAscent?: number;
        fatigueIndex?: number;
    }>;
}
export interface IGraphDatabaseService {
    createNode(node: GraphNode): Promise<void>;
    createRelation(relation: GraphRelation): Promise<void>;
    findNode(id: string, type?: GraphNodeType): Promise<GraphNode | null>;
    findRelations(fromId: string, toId?: string, relationType?: GraphRelationType): Promise<GraphRelation[]>;
    findPath(fromId: string, toId: string, options?: {
        maxDistance?: number;
        maxAscent?: number;
        maxFatigueIndex?: number;
        maxRollingAscent?: number;
        humanCapabilityProfileId?: string;
    }): Promise<GraphQueryResult>;
    findSuitablePlaces(humanCapabilityProfileId: string, options?: {
        countryCode?: string;
        regionId?: string;
        maxDistance?: number;
        limit?: number;
    }): Promise<GraphNode[]>;
    importData(nodes: GraphNode[], relations: GraphRelation[]): Promise<void>;
}

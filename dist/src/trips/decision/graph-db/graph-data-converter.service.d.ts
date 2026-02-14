import { Place } from '@prisma/client';
import { GraphNode, GraphRelation } from './graph-db.interface';
import { RouteSegment } from '../shared/world-model.types';
import { RouteDirectionWithPhilosophy } from '../shared/world-model.types';
import { HumanCapabilityModel } from '../models/human-capability.model';
export declare class GraphDataConverterService {
    private readonly logger;
    convertPlaceToGraphNode(place: Place, options?: {
        countryCode?: string;
        regionId?: string;
        demEvidence?: {
            cumulativeAscent?: number;
            maxSlopePct?: number;
            fatigueIndex?: number;
        };
    }): GraphNode;
    convertRouteSegmentToGraph(segment: RouteSegment, options?: {
        routeDirectionId: string;
        fromPlaceId?: string;
        toPlaceId?: string;
    }): {
        node?: GraphNode;
        relations: GraphRelation[];
    };
    convertRouteDirectionToGraphNode(routeDirection: RouteDirectionWithPhilosophy): GraphNode;
    convertHumanCapabilityToGraphNode(humanCapability: HumanCapabilityModel, profileId?: string): GraphNode;
    convertPlacesToGraphNodes(places: Place[], options?: {
        countryCode?: string;
        regionId?: string;
    }): GraphNode[];
    convertRouteSegmentsToGraph(segments: RouteSegment[], options?: {
        routeDirectionId: string;
    }): {
        nodes: GraphNode[];
        relations: GraphRelation[];
    };
    convertGraphNodeToPlace(node: GraphNode): Partial<Place>;
    generateCypherQueryForSuitablePlaces(humanCapabilityProfileId: string, options?: {
        countryCode?: string;
        maxDistance?: number;
        limit?: number;
    }): string;
    generateCypherQueryForPath(fromPlaceId: string, toPlaceId: string, options?: {
        maxDistance?: number;
        maxAscent?: number;
        maxFatigueIndex?: number;
        maxRollingAscent?: number;
        humanCapabilityProfileId?: string;
    }): string;
}

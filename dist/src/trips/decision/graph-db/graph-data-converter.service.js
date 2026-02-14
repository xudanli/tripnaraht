"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var GraphDataConverterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphDataConverterService = void 0;
const common_1 = require("@nestjs/common");
let GraphDataConverterService = GraphDataConverterService_1 = class GraphDataConverterService {
    constructor() {
        this.logger = new common_1.Logger(GraphDataConverterService_1.name);
    }
    convertPlaceToGraphNode(place, options) {
        let latitude = 0;
        let longitude = 0;
        const placeWithLocation = place;
        if (placeWithLocation.location) {
            const locationStr = String(placeWithLocation.location);
            const match = locationStr.match(/POINT\(([\d.]+)\s+([\d.]+)\)/);
            if (match) {
                longitude = parseFloat(match[1]);
                latitude = parseFloat(match[2]);
            }
        }
        let elevation;
        const metadata = place.metadata;
        const physicalMetadata = place.physicalMetadata;
        if (metadata === null || metadata === void 0 ? void 0 : metadata.elevationMeters) {
            elevation = metadata.elevationMeters;
        }
        else if (physicalMetadata === null || physicalMetadata === void 0 ? void 0 : physicalMetadata.elevation) {
            elevation = physicalMetadata.elevation;
        }
        const properties = {
            name: place.nameCN,
            nameCN: place.nameCN,
            nameEN: place.nameEN || undefined,
            latitude,
            longitude,
            elevation,
            countryCode: (options === null || options === void 0 ? void 0 : options.countryCode) || '',
            regionId: options === null || options === void 0 ? void 0 : options.regionId,
            poiType: place.category,
        };
        if (options === null || options === void 0 ? void 0 : options.demEvidence) {
            properties.demEvidence = options.demEvidence;
        }
        return {
            id: `place-${place.uuid}`,
            type: 'Place',
            properties,
        };
    }
    convertRouteSegmentToGraph(segment, options) {
        var _a;
        const relations = [];
        if (segment.graphRelations) {
            const graphRel = segment.graphRelations;
            if (graphRel.fromPlaceId && graphRel.toPlaceId) {
                relations.push({
                    id: `rel-${segment.segmentId}`,
                    type: 'CONNECTS_TO',
                    from: `place-${graphRel.fromPlaceId}`,
                    to: `place-${graphRel.toPlaceId}`,
                    properties: {
                        segmentId: segment.segmentId,
                        dayIndex: segment.dayIndex,
                        distanceKm: segment.distanceKm,
                        ascentM: segment.ascentM,
                        slopePct: segment.slopePct,
                    },
                });
            }
            if (options === null || options === void 0 ? void 0 : options.routeDirectionId) {
                relations.push({
                    id: `rel-rd-seg-${segment.segmentId}`,
                    type: 'HAS_SEGMENT',
                    from: `route-direction-${options.routeDirectionId}`,
                    to: `segment-${segment.segmentId}`,
                    properties: {
                        dayIndex: segment.dayIndex,
                    },
                });
            }
        }
        const node = ((_a = segment.graphRelations) === null || _a === void 0 ? void 0 : _a.graphNodeId)
            ? {
                id: `segment-${segment.segmentId}`,
                type: 'RouteSegment',
                properties: {
                    segmentId: segment.segmentId,
                    dayIndex: segment.dayIndex,
                    distanceKm: segment.distanceKm,
                    ascentM: segment.ascentM,
                    slopePct: segment.slopePct,
                    fatigueIndex: 0,
                    rollingAscent3Days: 0,
                    routeDirectionId: (options === null || options === void 0 ? void 0 : options.routeDirectionId) || '',
                },
            }
            : undefined;
        return {
            node,
            relations,
        };
    }
    convertRouteDirectionToGraphNode(routeDirection) {
        var _a;
        const properties = {
            name: routeDirection.name,
            nameCN: routeDirection.nameCN,
            countryCode: routeDirection.countryCode,
            tags: routeDirection.tags || [],
            philosophy: typeof routeDirection.philosophy === 'string'
                ? routeDirection.philosophy
                : (_a = routeDirection.philosophy) === null || _a === void 0 ? void 0 : _a.coreStatement,
            constraints: routeDirection.constraints,
        };
        const routeDirectionId = routeDirection.uuid || String(routeDirection.id);
        return {
            id: `route-direction-${routeDirectionId}`,
            type: 'RouteDirection',
            properties,
        };
    }
    convertHumanCapabilityToGraphNode(humanCapability, profileId) {
        const properties = {
            profileId: profileId || humanCapability.profileId,
            maxDailyAscentM: humanCapability.maxDailyAscentM,
            rollingAscent3DaysM: humanCapability.rollingAscent3DaysM,
            maxSlopePct: humanCapability.maxSlopePct,
            preferredPace: humanCapability.preferredPace,
            riskTolerance: humanCapability.riskTolerance,
        };
        return {
            id: `human-capability-${profileId || humanCapability.profileId}`,
            type: 'HumanCapabilityProfile',
            properties,
        };
    }
    convertPlacesToGraphNodes(places, options) {
        return places.map(place => this.convertPlaceToGraphNode(place, options));
    }
    convertRouteSegmentsToGraph(segments, options) {
        const nodes = [];
        const relations = [];
        for (const segment of segments) {
            const result = this.convertRouteSegmentToGraph(segment, options);
            if (result.node) {
                nodes.push(result.node);
            }
            relations.push(...result.relations);
        }
        return { nodes, relations };
    }
    convertGraphNodeToPlace(node) {
        if (node.type !== 'Place') {
            throw new Error(`节点类型不是 Place: ${node.type}`);
        }
        const props = node.properties;
        return {
            nameCN: props.nameCN || props.name,
            nameEN: props.nameEN,
            category: props.poiType,
            metadata: {
                elevationMeters: props.elevation,
                countryCode: props.countryCode,
                regionId: props.regionId,
                demEvidence: props.demEvidence,
            },
        };
    }
    generateCypherQueryForSuitablePlaces(humanCapabilityProfileId, options) {
        let query = `
      MATCH (profile:HumanCapabilityProfile {profileId: $profileId})
      MATCH (place:Place)
    `;
        const conditions = [];
        const params = {
            profileId: humanCapabilityProfileId,
        };
        if (options === null || options === void 0 ? void 0 : options.countryCode) {
            conditions.push('place.countryCode = $countryCode');
            params.countryCode = options.countryCode;
        }
        if (options === null || options === void 0 ? void 0 : options.maxDistance) {
            conditions.push('place.distance <= $maxDistance');
            params.maxDistance = options.maxDistance;
        }
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }
        query += `
      MATCH (place)-[:SUITABLE_FOR]->(profile)
      RETURN place
      ORDER BY place.elevation ASC
      LIMIT ${(options === null || options === void 0 ? void 0 : options.limit) || 10}
    `;
        return query;
    }
    generateCypherQueryForPath(fromPlaceId, toPlaceId, options) {
        let query = `
      MATCH (start:Place {id: $fromPlaceId})
      MATCH (end:Place {id: $toPlaceId})
      MATCH path = (start)-[:CONNECTS_TO*..5]-(end)
    `;
        const conditions = [];
        const params = {
            fromPlaceId: `place-${fromPlaceId}`,
            toPlaceId: `place-${toPlaceId}`,
        };
        if (options === null || options === void 0 ? void 0 : options.maxDistance) {
            conditions.push('reduce(total = 0, segment in path.segments | total + segment.distanceKm) <= $maxDistance');
            params.maxDistance = options.maxDistance;
        }
        if (options === null || options === void 0 ? void 0 : options.maxAscent) {
            conditions.push('reduce(total = 0, segment in path.segments | total + segment.ascentM) <= $maxAscent');
            params.maxAscent = options.maxAscent;
        }
        if (options === null || options === void 0 ? void 0 : options.maxFatigueIndex) {
            conditions.push('ALL(segment IN path.segments WHERE segment.fatigueIndex < $maxFatigueIndex)');
            params.maxFatigueIndex = options.maxFatigueIndex;
        }
        if (options === null || options === void 0 ? void 0 : options.maxRollingAscent) {
            conditions.push('ALL(segment IN path.segments WHERE segment.rollingAscent3Days < $maxRollingAscent)');
            params.maxRollingAscent = options.maxRollingAscent;
        }
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }
        query += `
      RETURN path
      ORDER BY reduce(total = 0, segment in path.segments | total + segment.ascentM) ASC
      LIMIT 10
    `;
        return query;
    }
};
exports.GraphDataConverterService = GraphDataConverterService;
exports.GraphDataConverterService = GraphDataConverterService = GraphDataConverterService_1 = __decorate([
    (0, common_1.Injectable)()
], GraphDataConverterService);
//# sourceMappingURL=graph-data-converter.service.js.map
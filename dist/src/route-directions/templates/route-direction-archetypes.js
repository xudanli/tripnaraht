"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROUTE_DIRECTION_ARCHETYPES = void 0;
exports.generateRouteDirectionFromArchetype = generateRouteDirectionFromArchetype;
exports.recommendArchetypesByRegion = recommendArchetypesByRegion;
exports.getAllArchetypes = getAllArchetypes;
exports.getArchetypeById = getArchetypeById;
exports.ROUTE_DIRECTION_ARCHETYPES = {
    HIGH_ALTITUDE_CULTURAL_TREKKING: {
        id: 'HIGH_ALTITUDE_CULTURAL_TREKKING',
        nameCN: '高海拔文化徒步',
        nameEN: 'High-altitude Cultural Trekking',
        description: '结合高海拔徒步和文化探索的路线，适合有经验的旅行者',
        defaultTags: ['徒步', '文化', '高海拔', '挑战', '自然', 'hiking', 'culture', 'high_altitude', 'challenge'],
        constraintsTemplate: {
            hard: {
                rapidAscentForbidden: true,
                requiresPermit: false,
                requiresGuide: false,
            },
            soft: {
                maxDailyAscentM: 800,
                maxElevationM: 5500,
                maxSlopePct: 25,
                bufferTimeMin: 20,
            },
        },
        riskProfileTemplate: {
            altitudeSickness: true,
            roadClosure: true,
            weatherWindow: true,
            weatherWindowMonths: [5, 6, 7, 8, 9, 10],
            consecutiveHighAltitudeDays: { min: 3, max: 10 },
            consecutiveAscentThreshold: 1200,
        },
        typicalPace: 'moderate',
        seasonalityTemplate: {
            bestMonths: [5, 6, 7, 8, 9, 10],
            avoidMonths: [11, 12, 1, 2, 3],
            weatherWindow: true,
        },
        signaturePoiTypes: [
            'MOUNTAIN_PASS',
            'MONASTERY',
            'VIEWPOINT',
            'TRAILHEAD',
            'CULTURAL_SITE',
            'ACCLIMATIZATION_POINT',
        ],
        itinerarySkeletonTemplate: {
            dayThemes: ['适应', '探索', '挑战', '文化', '休息', '登高', '返程'],
            restDaysRequired: [2, 4, 6],
            dailyPace: 'moderate',
        },
        applicableRegions: {
            elevationRange: { min: 3000, max: 6000 },
            terrainTypes: ['mountain', 'plateau', 'highland'],
            climateZones: ['alpine', 'subalpine'],
        },
    },
    FJORD_COASTLINE_DRIVING: {
        id: 'FJORD_COASTLINE_DRIVING',
        nameCN: '峡湾/海岸线自驾',
        nameEN: 'Fjord/Coastline Driving',
        description: '沿着海岸线或峡湾的自驾路线，风景优美，节奏轻松',
        defaultTags: ['自驾', '海岸', '峡湾', '自然', '摄影', '轻松', 'driving', 'coastline', 'fjord', 'nature', 'photography'],
        constraintsTemplate: {
            hard: {},
            soft: {
                maxDailyAscentM: 500,
                maxElevationM: 2000,
                maxSlopePct: 15,
                bufferTimeMin: 15,
            },
        },
        riskProfileTemplate: {
            altitudeSickness: false,
            roadClosure: true,
            ferryDependent: true,
            weatherWindow: true,
            weatherWindowMonths: [6, 7, 8],
        },
        typicalPace: 'relaxed',
        seasonalityTemplate: {
            bestMonths: [6, 7, 8, 9],
            avoidMonths: [11, 12, 1, 2],
            weatherWindow: true,
        },
        signaturePoiTypes: [
            'VIEWPOINT',
            'BEACH',
            'LIGHTHOUSE',
            'FERRY_TERMINAL',
            'COASTAL_TOWN',
            'NATURAL_WONDER',
        ],
        itinerarySkeletonTemplate: {
            dayThemes: ['出发', '海岸', '峡湾', '小镇', '摄影', '返程'],
            restDaysRequired: [],
            dailyPace: 'relaxed',
        },
        applicableRegions: {
            elevationRange: { min: 0, max: 1500 },
            terrainTypes: ['coastline', 'fjord', 'island'],
            climateZones: ['temperate', 'subarctic'],
        },
    },
    URBAN_CULTURAL_EXPLORATION: {
        id: 'URBAN_CULTURAL_EXPLORATION',
        nameCN: '城市文化探索',
        nameEN: 'Urban Cultural Exploration',
        description: '以城市为中心的文化探索路线，节奏轻松，适合所有年龄段',
        defaultTags: ['城市', '文化', '历史', '博物馆', '轻松', 'urban', 'culture', 'history', 'museum'],
        constraintsTemplate: {
            hard: {},
            soft: {
                maxDailyAscentM: 200,
                maxElevationM: 1000,
                maxSlopePct: 10,
                bufferTimeMin: 10,
            },
        },
        riskProfileTemplate: {
            altitudeSickness: false,
            roadClosure: false,
            ferryDependent: false,
            weatherWindow: false,
        },
        typicalPace: 'relaxed',
        seasonalityTemplate: {
            bestMonths: [4, 5, 6, 7, 8, 9, 10],
            avoidMonths: [],
            weatherWindow: false,
        },
        signaturePoiTypes: [
            'MUSEUM',
            'HISTORIC_SITE',
            'CITY_CENTER',
            'MARKET',
            'RESTAURANT',
            'SHOPPING',
        ],
        itinerarySkeletonTemplate: {
            dayThemes: ['到达', '探索', '文化', '美食', '购物', '返程'],
            restDaysRequired: [],
            dailyPace: 'relaxed',
        },
        applicableRegions: {
            elevationRange: { min: 0, max: 2000 },
            terrainTypes: ['urban', 'city'],
            climateZones: ['temperate', 'subtropical', 'tropical'],
        },
    },
    NATURE_SCENIC_LOOP: {
        id: 'NATURE_SCENIC_LOOP',
        nameCN: '自然风光环线',
        nameEN: 'Nature Scenic Loop',
        description: '以自然风光为主的环线路线，适合喜欢户外和摄影的旅行者',
        defaultTags: ['自然', '环线', '摄影', '户外', '轻松', 'nature', 'scenic', 'loop', 'photography', 'outdoor'],
        constraintsTemplate: {
            hard: {},
            soft: {
                maxDailyAscentM: 600,
                maxElevationM: 3000,
                maxSlopePct: 20,
                bufferTimeMin: 15,
            },
        },
        riskProfileTemplate: {
            altitudeSickness: false,
            roadClosure: true,
            ferryDependent: false,
            weatherWindow: true,
            weatherWindowMonths: [5, 6, 7, 8, 9, 10],
        },
        typicalPace: 'moderate',
        seasonalityTemplate: {
            bestMonths: [5, 6, 7, 8, 9, 10],
            avoidMonths: [11, 12, 1, 2, 3],
            weatherWindow: true,
        },
        signaturePoiTypes: [
            'NATIONAL_PARK',
            'VIEWPOINT',
            'WATERFALL',
            'LAKE',
            'TRAIL',
            'WILDLIFE_VIEWING',
        ],
        itinerarySkeletonTemplate: {
            dayThemes: ['出发', '探索', '摄影', '自然', '环线', '返程'],
            restDaysRequired: [],
            dailyPace: 'moderate',
        },
        applicableRegions: {
            elevationRange: { min: 0, max: 4000 },
            terrainTypes: ['mountain', 'forest', 'lake', 'valley'],
            climateZones: ['temperate', 'alpine'],
        },
    },
    ADVENTURE_CHALLENGE_ROUTE: {
        id: 'ADVENTURE_CHALLENGE_ROUTE',
        nameCN: '冒险挑战路线',
        nameEN: 'Adventure Challenge Route',
        description: '高难度、高风险的冒险路线，适合有经验的户外爱好者',
        defaultTags: ['挑战', '冒险', '徒步', '极限', '户外', 'adventure', 'challenge', 'extreme', 'outdoor'],
        constraintsTemplate: {
            hard: {
                requiresPermit: true,
                requiresGuide: true,
                rapidAscentForbidden: false,
            },
            soft: {
                maxDailyAscentM: 1500,
                maxElevationM: 6000,
                maxSlopePct: 35,
                bufferTimeMin: 30,
            },
        },
        riskProfileTemplate: {
            altitudeSickness: true,
            roadClosure: true,
            weatherWindow: true,
            weatherWindowMonths: [6, 7, 8, 9],
            consecutiveHighAltitudeDays: { min: 5, max: 15 },
            consecutiveAscentThreshold: 2000,
        },
        typicalPace: 'intense',
        seasonalityTemplate: {
            bestMonths: [6, 7, 8, 9],
            avoidMonths: [11, 12, 1, 2, 3, 4],
            weatherWindow: true,
        },
        signaturePoiTypes: [
            'MOUNTAIN_PEAK',
            'TRAILHEAD',
            'BASE_CAMP',
            'VIEWPOINT',
            'CHALLENGE_POINT',
        ],
        itinerarySkeletonTemplate: {
            dayThemes: ['准备', '适应', '挑战', '登顶', '下降', '恢复'],
            restDaysRequired: [2, 4],
            dailyPace: 'intense',
        },
        applicableRegions: {
            elevationRange: { min: 2000, max: 8000 },
            terrainTypes: ['mountain', 'alpine', 'extreme'],
            climateZones: ['alpine', 'arctic'],
        },
    },
    RELAXED_LEISURE_VACATION: {
        id: 'RELAXED_LEISURE_VACATION',
        nameCN: '轻松休闲度假',
        nameEN: 'Relaxed Leisure Vacation',
        description: '以放松和休闲为主的度假路线，节奏轻松，适合所有年龄段',
        defaultTags: ['轻松', '休闲', '度假', '海滩', '温泉', 'relaxed', 'leisure', 'vacation', 'beach', 'spa'],
        constraintsTemplate: {
            hard: {},
            soft: {
                maxDailyAscentM: 100,
                maxElevationM: 500,
                maxSlopePct: 5,
                bufferTimeMin: 20,
            },
        },
        riskProfileTemplate: {
            altitudeSickness: false,
            roadClosure: false,
            ferryDependent: false,
            weatherWindow: false,
        },
        typicalPace: 'relaxed',
        seasonalityTemplate: {
            bestMonths: [5, 6, 7, 8, 9, 10],
            avoidMonths: [],
            weatherWindow: false,
        },
        signaturePoiTypes: [
            'BEACH',
            'SPA',
            'RESORT',
            'RESTAURANT',
            'SHOPPING',
            'ENTERTAINMENT',
        ],
        itinerarySkeletonTemplate: {
            dayThemes: ['到达', '放松', '休闲', '享受', '返程'],
            restDaysRequired: [],
            dailyPace: 'relaxed',
        },
        applicableRegions: {
            elevationRange: { min: 0, max: 1000 },
            terrainTypes: ['coastline', 'beach', 'resort'],
            climateZones: ['tropical', 'subtropical', 'temperate'],
        },
    },
};
function generateRouteDirectionFromArchetype(archetype, countryCode, customizations = {}) {
    var _a;
    const template = exports.ROUTE_DIRECTION_ARCHETYPES[archetype];
    if (!template) {
        throw new Error(`Unknown archetype: ${archetype}`);
    }
    const defaultName = `${countryCode}_${archetype}`;
    const defaultNameCN = `${template.nameCN}`;
    const defaultNameEN = `${template.nameEN}`;
    return {
        countryCode,
        name: customizations.name || defaultName,
        nameCN: customizations.nameCN || defaultNameCN,
        nameEN: customizations.nameEN || defaultNameEN,
        description: customizations.description || template.description,
        tags: [...template.defaultTags],
        regions: customizations.regions || [],
        entryHubs: customizations.entryHubs || [],
        constraints: {
            ...template.constraintsTemplate,
            ...(customizations.constraints || {}),
        },
        riskProfile: {
            ...template.riskProfileTemplate,
            ...(customizations.riskProfile || {}),
        },
        seasonality: {
            ...template.seasonalityTemplate,
            ...(customizations.seasonality || {}),
        },
        signaturePois: {
            types: template.signaturePoiTypes,
            examples: ((_a = customizations.signaturePois) === null || _a === void 0 ? void 0 : _a.examples) || [],
        },
        itinerarySkeleton: {
            ...template.itinerarySkeletonTemplate,
            ...(customizations.itinerarySkeleton || {}),
        },
        metadata: {
            archetype: archetype,
            ...(customizations.metadata || {}),
            ...(customizations.corridorGeom ? { corridorGeom: customizations.corridorGeom } : {}),
        },
    };
}
function recommendArchetypesByRegion(regionFeatures) {
    const recommendations = [];
    for (const [archetypeId, template] of Object.entries(exports.ROUTE_DIRECTION_ARCHETYPES)) {
        let score = 0;
        const reasons = [];
        const archetype = archetypeId;
        const applicable = template.applicableRegions;
        if (regionFeatures.elevation !== undefined && applicable.elevationRange) {
            if (regionFeatures.elevation >= applicable.elevationRange.min &&
                regionFeatures.elevation <= applicable.elevationRange.max) {
                score += 30;
                reasons.push(`海拔匹配（${regionFeatures.elevation}m在${applicable.elevationRange.min}-${applicable.elevationRange.max}m范围内）`);
            }
            else {
                score -= 10;
            }
        }
        if (regionFeatures.terrainType && applicable.terrainTypes) {
            if (applicable.terrainTypes.includes(regionFeatures.terrainType)) {
                score += 25;
                reasons.push(`地形类型匹配（${regionFeatures.terrainType}）`);
            }
        }
        if (regionFeatures.climateZone && applicable.climateZones) {
            if (applicable.climateZones.includes(regionFeatures.climateZone)) {
                score += 20;
                reasons.push(`气候带匹配（${regionFeatures.climateZone}）`);
            }
        }
        if (regionFeatures.hasCoastline) {
            if (archetype === 'FJORD_COASTLINE_DRIVING' || archetype === 'RELAXED_LEISURE_VACATION') {
                score += 15;
                reasons.push('有海岸线，适合海岸/度假路线');
            }
        }
        if (regionFeatures.hasCities) {
            if (archetype === 'URBAN_CULTURAL_EXPLORATION') {
                score += 15;
                reasons.push('有城市，适合城市文化探索');
            }
        }
        if (score > 0) {
            recommendations.push({
                archetype,
                score,
                reason: reasons.join('；'),
            });
        }
    }
    recommendations.sort((a, b) => b.score - a.score);
    return recommendations;
}
function getAllArchetypes() {
    return Object.values(exports.ROUTE_DIRECTION_ARCHETYPES);
}
function getArchetypeById(id) {
    return exports.ROUTE_DIRECTION_ARCHETYPES[id];
}
//# sourceMappingURL=route-direction-archetypes.js.map
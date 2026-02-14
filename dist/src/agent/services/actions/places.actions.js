"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlacesActions = createPlacesActions;
const action_interface_1 = require("../../interfaces/action.interface");
function extractMustHavePois(userInput) {
    if (!userInput || userInput.trim().length === 0) {
        return [];
    }
    const pois = [];
    const input = userInput;
    const containsMatch = input.match(/包含\s*([^，,。.\n]+)/);
    if (containsMatch) {
        const poiList = containsMatch[1].trim();
        const parts = poiList.split(/[、,，]/).map(s => s.trim()).filter(s => {
            if (s.length < 2)
                return false;
            if (/^\d+/.test(s))
                return false;
            if (/规划|安排|行程|旅行|旅游|游玩|游|日|一共|想去|打卡|去|到|在/.test(s))
                return false;
            if (/省|市|县|区/.test(s) && s.length < 5)
                return false;
            return true;
        });
        pois.push(...parts);
        if (pois.length > 0) {
            return Array.from(new Set(pois));
        }
    }
    const otherPatterns = [
        /去\s*([^，,。.\n]+)/g,
        /参观\s*([^，,。.\n]+)/g,
        /游览\s*([^，,。.\n]+)/g,
        /包括\s*([^，,。.\n]+)/g,
    ];
    for (const pattern of otherPatterns) {
        let match;
        while ((match = pattern.exec(input)) !== null) {
            const poiName = match[1].trim();
            if (pois.some(p => poiName.includes(p) || p.includes(poiName))) {
                continue;
            }
            if (poiName && !poiName.match(/^\d+/) && poiName.length > 1) {
                if (!/规划|安排|行程|旅行|旅游|游玩|游|日|一共|想去|打卡|去|到|在/.test(poiName)) {
                    pois.push(poiName);
                }
            }
        }
    }
    return Array.from(new Set(pois));
}
function createPlacesActions(placesService, vectorSearchService, entityResolutionService) {
    return [
        {
            name: 'places.resolve_entities',
            description: '解析用户输入中的实体（POI、地点等）',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.LOW,
                side_effect: action_interface_1.ActionSideEffect.CALLS_API,
                preconditions: [],
                idempotent: true,
                cacheable: true,
            },
            input_schema: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    lat: { type: 'number', optional: true },
                    lng: { type: 'number', optional: true },
                    limit: { type: 'number', optional: true },
                },
                required: ['query'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    nodes: { type: 'array' },
                    count: { type: 'number' },
                },
            },
            execute: async (input, state) => {
                var _a, _b, _c, _d;
                const logger = console;
                try {
                    const normalizedInput = {
                        query: input.query || input.userInput || input.user_input,
                        lat: input.lat,
                        lng: input.lng,
                        limit: input.limit,
                    };
                    const query = (((_a = state === null || state === void 0 ? void 0 : state.user_input) === null || _a === void 0 ? void 0 : _a.trim()) ||
                        ((_b = state === null || state === void 0 ? void 0 : state.userQuery) === null || _b === void 0 ? void 0 : _b.trim()) ||
                        ((_c = state === null || state === void 0 ? void 0 : state.rawInput) === null || _c === void 0 ? void 0 : _c.trim()) ||
                        ((_d = normalizedInput.query) === null || _d === void 0 ? void 0 : _d.trim()) ||
                        '');
                    if (!query || query.toLowerCase() === 'unknown') {
                        logger.warn(`places.resolve_entities: Invalid query (${query}), returning empty result`);
                        return {
                            nodes: [],
                            count: 0,
                            error: `Invalid query: ${query || 'empty'}`,
                        };
                    }
                    logger.debug(`[resolve_entities] 开始解析实体，query: "${query}"`);
                    const placeIdMatch = query.match(/地点ID[：:]\s*(\d+)/i);
                    if (placeIdMatch && placeIdMatch[1]) {
                        const placeId = parseInt(placeIdMatch[1], 10);
                        logger.debug(`[resolve_entities] 检测到地点ID: ${placeId}，直接通过ID查询`);
                        try {
                            const place = await placesService.findOne(placeId);
                            if (place) {
                                let lat;
                                let lng;
                                if (place.location && place.location.lat && place.location.lng) {
                                    lat = place.location.lat;
                                    lng = place.location.lng;
                                }
                                else {
                                    const metadata = place.metadata || {};
                                    if (metadata.lat && metadata.lng) {
                                        lat = metadata.lat;
                                        lng = metadata.lng;
                                    }
                                    else if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
                                        lng = metadata.coordinates[0];
                                        lat = metadata.coordinates[1];
                                    }
                                }
                                if (lat && lng) {
                                    logger.debug(`[resolve_entities] 通过ID查询成功: ${place.nameCN || place.nameEN}`);
                                    return {
                                        nodes: [{
                                                id: place.id,
                                                name: place.nameCN || place.nameEN || 'Unknown',
                                                type: 'poi',
                                                geo: {
                                                    lat,
                                                    lng,
                                                },
                                                category: place.category,
                                                metadata: {
                                                    address: place.address,
                                                    score: 1.0,
                                                    source: 'direct_id_lookup',
                                                    matchReasons: ['通过地点ID直接查询'],
                                                    ...place.metadata,
                                                },
                                            }],
                                        count: 1,
                                        diagnostics: {
                                            searchMethod: 'direct_id_lookup',
                                            rawHitCount: 1,
                                            filteredCount: 0,
                                            mappingErrors: 0,
                                            finalCount: 1,
                                        },
                                    };
                                }
                                else {
                                    logger.warn(`[resolve_entities] 地点ID ${placeId} (${place.nameCN || place.nameEN}) 存在但缺少坐标信息（location 和 metadata 中都没有），降级到实体解析`);
                                }
                            }
                            else {
                                logger.warn(`[resolve_entities] 地点ID ${placeId} 不存在，降级到实体解析`);
                            }
                        }
                        catch (error) {
                            logger.warn(`[resolve_entities] 通过ID查询失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}，降级到实体解析`);
                        }
                    }
                    let extractedPlaceName = null;
                    const placeNameMatch = query.match(/地点名称[：:]\s*([^，,。.\n，,]+?)(?=，|,|。|\.|$)/i);
                    if (placeNameMatch && placeNameMatch[1]) {
                        extractedPlaceName = placeNameMatch[1].trim();
                        extractedPlaceName = extractedPlaceName.replace(/\s*[，,]\s*地点ID.*$/i, '').trim();
                        logger.debug(`[resolve_entities] 提取的地点名称: "${extractedPlaceName}"`);
                    }
                    const effectiveQuery = extractedPlaceName || query;
                    const mustHavePois = extractMustHavePois(effectiveQuery);
                    logger.debug(`[resolve_entities] 提取的must-have POI: [${mustHavePois.join(', ')}]`);
                    if (entityResolutionService) {
                        try {
                            const resolutionResult = await entityResolutionService.resolveEntities(effectiveQuery, mustHavePois, input.lat, input.lng, input.limit || 10);
                            const nodes = resolutionResult.results
                                .filter(r => r.lat != null && r.lng != null && r.lat !== 0 && r.lng !== 0)
                                .map(r => ({
                                id: r.id,
                                name: r.nameCN || r.nameEN || r.name,
                                type: 'poi',
                                geo: {
                                    lat: r.lat,
                                    lng: r.lng,
                                },
                                category: r.category,
                                metadata: {
                                    address: r.address,
                                    score: r.score,
                                    source: r.source,
                                    matchReasons: r.matchReasons,
                                    ...r.metadata,
                                },
                            }));
                            logger.debug(`[resolve_entities] 策略链解析结果: {
  totalResults: ${resolutionResult.results.length},
  nodesWithCoords: ${nodes.length},
  missingPois: [${resolutionResult.missingPois.join(', ')}],
  needsClarification: ${resolutionResult.needsClarification.length}
}`);
                            if (resolutionResult.missingPois.length > 0) {
                                logger.warn(`[resolve_entities] 缺失的must-have POI: [${resolutionResult.missingPois.join(', ')}]`);
                            }
                            if (resolutionResult.needsClarification.length > 0) {
                                logger.warn(`[resolve_entities] 需要澄清的POI: ${JSON.stringify(resolutionResult.needsClarification, null, 2)}`);
                            }
                            return {
                                nodes,
                                count: nodes.length,
                                diagnostics: {
                                    searchMethod: 'entity_resolution_strategy_chain',
                                    rawHitCount: resolutionResult.results.length,
                                    filteredCount: resolutionResult.results.length - nodes.length,
                                    mappingErrors: 0,
                                    finalCount: nodes.length,
                                    missingPois: resolutionResult.missingPois,
                                    needsClarification: resolutionResult.needsClarification,
                                },
                            };
                        }
                        catch (strategyError) {
                            logger.warn(`[resolve_entities] 策略链服务失败，降级到传统搜索: ${(strategyError === null || strategyError === void 0 ? void 0 : strategyError.message) || String(strategyError)}`);
                        }
                    }
                    let results;
                    let rawHitCount = 0;
                    let searchMethod = '';
                    if (vectorSearchService) {
                        try {
                            searchMethod = 'hybridSearch';
                            const hybridResults = await vectorSearchService.hybridSearch(effectiveQuery, input.lat, input.lng, undefined, undefined, input.limit || 10);
                            results = hybridResults;
                            rawHitCount = results.length;
                            logger.debug(`[resolve_entities] VectorSearch 原始命中数: ${rawHitCount}`);
                            if (rawHitCount > 0) {
                                const top3 = results.slice(0, 3).map((r, idx) => ({
                                    index: idx + 1,
                                    id: r.id,
                                    nameCN: r.nameCN,
                                    nameEN: r.nameEN,
                                    category: r.category,
                                    score: r.finalScore || r.vectorScore || r.keywordScore,
                                    hasLatLng: !!(r.lat && r.lng),
                                }));
                                logger.debug(`[resolve_entities] Top 3 结果: ${JSON.stringify(top3, null, 2)}`);
                            }
                        }
                        catch (vectorError) {
                            logger.warn(`[resolve_entities] 向量搜索失败，降级到关键词搜索: ${(vectorError === null || vectorError === void 0 ? void 0 : vectorError.message) || String(vectorError)}`);
                            searchMethod = 'placesService.search';
                            results = await placesService.search(effectiveQuery, input.lat, input.lng, undefined, undefined, input.limit || 10);
                            rawHitCount = results.length;
                            logger.debug(`[resolve_entities] 关键词搜索原始命中数: ${rawHitCount}`);
                        }
                    }
                    else {
                        searchMethod = 'placesService.search';
                        results = await placesService.search(effectiveQuery, input.lat, input.lng, undefined, undefined, input.limit || 10);
                        rawHitCount = results.length;
                        logger.debug(`[resolve_entities] 关键词搜索原始命中数: ${rawHitCount}`);
                    }
                    let filteredCount = 0;
                    let mappingErrors = [];
                    const mappedNodes = results
                        .map((place, index) => {
                        var _a, _b, _c, _d;
                        try {
                            if (!place.id) {
                                mappingErrors.push({ index, error: 'Missing id', placeId: place.id });
                                return null;
                            }
                            if (place.finalScore !== undefined) {
                                const node = {
                                    id: place.id,
                                    name: place.nameCN || place.nameEN,
                                    type: 'poi',
                                    geo: {
                                        lat: place.lat || ((_a = place.location) === null || _a === void 0 ? void 0 : _a.lat),
                                        lng: place.lng || ((_b = place.location) === null || _b === void 0 ? void 0 : _b.lng),
                                    },
                                    category: place.category,
                                    metadata: {
                                        address: place.address,
                                        rating: place.rating,
                                        score: place.finalScore,
                                        vectorScore: place.vectorScore,
                                        keywordScore: place.keywordScore,
                                        matchReasons: place.matchReasons,
                                    },
                                };
                                return node;
                            }
                            const node = {
                                id: place.id,
                                name: place.nameCN || place.nameEN,
                                type: 'poi',
                                geo: {
                                    lat: place.lat || ((_c = place.location) === null || _c === void 0 ? void 0 : _c.lat),
                                    lng: place.lng || ((_d = place.location) === null || _d === void 0 ? void 0 : _d.lng),
                                },
                                category: place.category,
                                metadata: {
                                    address: place.address,
                                    rating: place.rating,
                                    score: place.score || place.vectorScore,
                                },
                            };
                            return node;
                        }
                        catch (error) {
                            mappingErrors.push({
                                index,
                                error: (error === null || error === void 0 ? void 0 : error.message) || String(error),
                                placeId: place.id
                            });
                            logger.error(`[resolve_entities] 映射节点失败 (index: ${index}, id: ${place.id}): ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                            return null;
                        }
                    })
                        .filter((node) => node !== null);
                    const nodesWithCoords = [];
                    const nodesWithoutCoords = [];
                    for (const node of mappedNodes) {
                        if (node.geo.lat && node.geo.lng) {
                            nodesWithCoords.push(node);
                        }
                        else {
                            nodesWithoutCoords.push(node);
                            filteredCount++;
                            logger.debug(`[resolve_entities] 节点 ${node.id} (${node.name}) 缺少坐标，将被过滤`);
                        }
                    }
                    const nodes = nodesWithCoords;
                    const finalCount = nodes.length;
                    logger.debug(`[resolve_entities] 诊断信息: {
  searchMethod: "${searchMethod}",
  rawHitCount: ${rawHitCount},
  filteredCount: ${filteredCount} (缺少坐标),
  mappingErrors: ${mappingErrors.length},
  finalCount: ${finalCount}
}`);
                    if (mappingErrors.length > 0) {
                        logger.warn(`[resolve_entities] 映射错误详情: ${JSON.stringify(mappingErrors, null, 2)}`);
                    }
                    if (finalCount === 0 && rawHitCount > 0) {
                        logger.warn(`[resolve_entities] 警告：原始命中 ${rawHitCount} 条，但最终节点数为 0（可能被过滤或映射失败）`);
                    }
                    return {
                        nodes,
                        count: finalCount,
                        diagnostics: {
                            searchMethod,
                            rawHitCount,
                            filteredCount,
                            mappingErrors: mappingErrors.length,
                            finalCount,
                        },
                    };
                }
                catch (error) {
                    logger.error(`[resolve_entities] 实体解析失败，返回空结果: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                    logger.error(`[resolve_entities] 错误堆栈: ${(error === null || error === void 0 ? void 0 : error.stack) || 'N/A'}`);
                    return {
                        nodes: [],
                        count: 0,
                        error: (error === null || error === void 0 ? void 0 : error.message) || String(error),
                    };
                }
            },
        },
        {
            name: 'places.get_poi_facts',
            description: '获取 POI 事实信息（营业时间、规则等）',
            metadata: {
                kind: action_interface_1.ActionKind.INTERNAL,
                cost: action_interface_1.ActionCost.LOW,
                side_effect: action_interface_1.ActionSideEffect.CALLS_API,
                preconditions: ['draft.nodes'],
                idempotent: true,
                cacheable: true,
            },
            input_schema: {
                type: 'object',
                properties: {
                    poi_ids: { type: 'array', items: { type: 'number' } },
                },
                required: ['poi_ids'],
            },
            output_schema: {
                type: 'object',
                properties: {
                    facts: { type: 'object' },
                },
            },
            execute: async (input, state) => {
                try {
                    const places = await placesService.findBatch(input.poi_ids);
                    const facts = {};
                    for (const place of places) {
                        const metadata = place.metadata;
                        facts[place.id] = {
                            name: place.nameCN || place.nameEN,
                            category: place.category,
                            address: place.address,
                            rating: place.rating,
                            opening_hours: (metadata === null || metadata === void 0 ? void 0 : metadata.openingHours) || (metadata === null || metadata === void 0 ? void 0 : metadata.opening_hours),
                            price_level: (metadata === null || metadata === void 0 ? void 0 : metadata.priceLevel) || (metadata === null || metadata === void 0 ? void 0 : metadata.price_level),
                            phone: metadata === null || metadata === void 0 ? void 0 : metadata.phone,
                            website: metadata === null || metadata === void 0 ? void 0 : metadata.website,
                            description: metadata === null || metadata === void 0 ? void 0 : metadata.description,
                        };
                    }
                    return {
                        facts,
                    };
                }
                catch (error) {
                    throw new Error(`获取 POI 事实失败: ${(error === null || error === void 0 ? void 0 : error.message) || String(error)}`);
                }
            },
        },
    ];
}
//# sourceMappingURL=places.actions.js.map
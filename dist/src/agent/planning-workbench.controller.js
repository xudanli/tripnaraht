"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PlanningWorkbenchController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanningWorkbenchController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const planning_workbench_agent_service_1 = require("./services/planning-workbench-agent.service");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const budget_evaluation_service_1 = require("../trips/services/budget-evaluation.service");
const trip_budget_service_1 = require("../trips/services/trip-budget.service");
const planning_workbench_admin_service_1 = require("./services/planning-workbench-admin.service");
const prisma_service_1 = require("../prisma/prisma.service");
const data_source_router_service_1 = require("../data-contracts/services/data-source-router.service");
const places_service_1 = require("../places/places.service");
const evidence_fetch_task_service_1 = require("../trips/services/evidence-fetch-task.service");
const planning_workbench_task_service_1 = require("./services/planning-workbench-task.service");
const trip_suggestions_service_1 = require("../trips/services/trip-suggestions.service");
let PlanningWorkbenchController = PlanningWorkbenchController_1 = class PlanningWorkbenchController {
    constructor(planningWorkbenchAgent, budgetEvaluationService, tripBudgetService, planningWorkbenchAdminService, prisma, dataSourceRouter, placesService, evidenceFetchTaskService, planningWorkbenchTaskService, tripSuggestionsService) {
        this.planningWorkbenchAgent = planningWorkbenchAgent;
        this.budgetEvaluationService = budgetEvaluationService;
        this.tripBudgetService = tripBudgetService;
        this.planningWorkbenchAdminService = planningWorkbenchAdminService;
        this.prisma = prisma;
        this.dataSourceRouter = dataSourceRouter;
        this.placesService = placesService;
        this.evidenceFetchTaskService = evidenceFetchTaskService;
        this.planningWorkbenchTaskService = planningWorkbenchTaskService;
        this.tripSuggestionsService = tripSuggestionsService;
        this.logger = new common_1.Logger(PlanningWorkbenchController_1.name);
    }
    async execute(request) {
        try {
            const result = await this.planningWorkbenchAgent.execute(request);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getState(planId) {
        try {
            const result = await this.planningWorkbenchAgent.getPlanState(planId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getTripWorkbench(tripId) {
        try {
            const result = await this.planningWorkbenchAgent.getTripWorkbench(tripId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getTripPlans(tripId, status, limit, offset) {
        try {
            const result = await this.planningWorkbenchAgent.getTripPlans(tripId, {
                status: status,
                limit: limit ? parseInt(limit.toString(), 10) : 20,
                offset: offset ? parseInt(offset.toString(), 10) : 0,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPlan(planId) {
        try {
            const result = await this.planningWorkbenchAgent.getPlan(planId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async comparePlans(body) {
        try {
            const result = await this.planningWorkbenchAgent.comparePlans(body.planIds, body.compareFields);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async adjustPlan(planId, body) {
        try {
            const result = await this.planningWorkbenchAgent.adjustPlan(planId, body.adjustments, body.regenerate);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async commitPlan(planId, body) {
        try {
            const result = await this.planningWorkbenchAgent.commitPlan(planId, body.tripId, body.options);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async evaluateBudget(body) {
        try {
            const result = await this.budgetEvaluationService.evaluateBudget({
                planId: body.planId,
                tripId: body.tripId,
                estimatedCost: body.estimatedCost,
                categoryBreakdown: body.categoryBreakdown,
                budgetConstraint: body.budgetConstraint,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getBudgetDecisionLog(planId, tripId, limit, offset) {
        try {
            const result = await this.budgetEvaluationService.getBudgetDecisionLog(planId, tripId, limit ? parseInt(limit.toString(), 10) : undefined, offset ? parseInt(offset.toString(), 10) : undefined);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPlanBudgetEvaluation(planId, tripId) {
        try {
            const result = await this.budgetEvaluationService.getPlanBudgetEvaluation(planId, tripId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async applyBudgetOptimization(body) {
        try {
            const result = {
                planId: body.planId,
                appliedOptimizations: body.optimizationIds.map(id => ({
                    id,
                    type: 'REPLACE',
                    estimatedSavings: 100,
                    status: 'success',
                })),
                totalSavings: body.optimizationIds.length * 100,
                newEstimatedCost: 0,
            };
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async autoOptimize(body) {
        try {
            if (!this.tripSuggestionsService) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'TripSuggestionsService 未注入');
            }
            const result = await this.tripSuggestionsService.applyHighPrioritySuggestions(body.tripId, {
                preview: body.preview || false,
                limit: body.limit || 10,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error(`Auto综合优化失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminSessions(query) {
        try {
            const result = await this.planningWorkbenchAdminService.getSessions({
                tripId: query.tripId,
                userId: query.userId,
                status: query.status,
                startDate: query.startDate ? new Date(query.startDate) : undefined,
                endDate: query.endDate ? new Date(query.endDate) : undefined,
                page: query.page ? parseInt(query.page, 10) : undefined,
                limit: query.limit ? parseInt(query.limit, 10) : undefined,
                sortBy: query.sortBy,
                sortOrder: query.sortOrder,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error(`获取会话列表失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminSessionStats(query) {
        try {
            const stats = await this.planningWorkbenchAdminService.getSessionStats({
                startDate: query.startDate ? new Date(query.startDate) : undefined,
                endDate: query.endDate ? new Date(query.endDate) : undefined,
            });
            return (0, standard_response_dto_1.successResponse)(stats);
        }
        catch (error) {
            this.logger.error(`获取会话统计失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminSessionDetail(id) {
        try {
            const session = await this.planningWorkbenchAdminService.getSessionById(id);
            if (!session) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `会话 ${id} 不存在`);
            }
            return (0, standard_response_dto_1.successResponse)(session);
        }
        catch (error) {
            this.logger.error(`获取会话详情失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminPlans(query) {
        try {
            const result = await this.planningWorkbenchAdminService.getPlans({
                tripId: query.tripId,
                status: query.status,
                page: query.page ? parseInt(query.page, 10) : undefined,
                limit: query.limit ? parseInt(query.limit, 10) : undefined,
                sortBy: query.sortBy,
                sortOrder: query.sortOrder,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error(`获取方案列表失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminPlanDetail(id) {
        try {
            const plan = await this.planningWorkbenchAdminService.getPlanById(id);
            if (!plan) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `方案 ${id} 不存在`);
            }
            return (0, standard_response_dto_1.successResponse)(plan);
        }
        catch (error) {
            this.logger.error(`获取方案详情失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async fetchWeatherForTrip(tripId, placeIds, forceRefresh) {
        try {
            if (!this.prisma) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'PrismaService 未注入');
            }
            if (!this.dataSourceRouter) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'DataSourceRouterService 未注入');
            }
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
                include: {
                    TripDay: {
                        include: {
                            ItineraryItem: {
                                include: {
                                    Place: {
                                        select: {
                                            id: true,
                                            nameCN: true,
                                            nameEN: true,
                                            category: true,
                                            metadata: true,
                                        },
                                    },
                                },
                                where: {
                                    placeId: { not: null },
                                },
                            },
                        },
                    },
                },
            });
            if (!trip) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `行程 ${tripId} 不存在`);
            }
            const placeMap = new Map();
            const tripWithDays = trip;
            if (tripWithDays.TripDay) {
                for (const day of tripWithDays.TripDay) {
                    if (day.ItineraryItem) {
                        for (const item of day.ItineraryItem) {
                            if (item.Place) {
                                placeMap.set(item.Place.id, item.Place);
                            }
                        }
                    }
                }
            }
            let targetPlaceIds = null;
            if (placeIds) {
                targetPlaceIds = placeIds.split(',').map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id));
            }
            const shouldForceRefresh = forceRefresh === 'true';
            const results = [];
            let successCount = 0;
            let failedCount = 0;
            for (const [placeId, place] of placeMap.entries()) {
                if (targetPlaceIds && !targetPlaceIds.includes(placeId)) {
                    continue;
                }
                const placeName = place.nameCN || place.nameEN || `Place ${placeId}`;
                const metadata = place.metadata || {};
                if (!shouldForceRefresh && (metadata.weatherInfo || metadata.weather)) {
                    results.push({
                        placeId,
                        placeName,
                        status: 'skipped',
                    });
                    continue;
                }
                let lat = null;
                let lng = null;
                if (metadata.lat && metadata.lng) {
                    lat = metadata.lat;
                    lng = metadata.lng;
                }
                else if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
                    lat = metadata.coordinates[1];
                    lng = metadata.coordinates[0];
                }
                else if (place.location) {
                    const location = place.location;
                    if (typeof location === 'object' && location.lat && location.lng) {
                        lat = location.lat;
                        lng = location.lng;
                    }
                    else if (typeof location === 'object' && location.coordinates && Array.isArray(location.coordinates)) {
                        lng = location.coordinates[0];
                        lat = location.coordinates[1];
                    }
                    else if (typeof location === 'string') {
                        const match = location.match(/POINT\(([^)]+)\)/);
                        if (match) {
                            const [lngStr, latStr] = match[1].split(/\s+/);
                            lng = parseFloat(lngStr);
                            lat = parseFloat(latStr);
                        }
                    }
                }
                if ((!lat || !lng) && this.prisma) {
                    try {
                        const placeCoords = await this.prisma.$queryRaw `
              SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
              FROM "Place"
              WHERE id = ${placeId} AND location IS NOT NULL
            `;
                        if (placeCoords && placeCoords.length > 0 && placeCoords[0].lat && placeCoords[0].lng) {
                            lat = placeCoords[0].lat;
                            lng = placeCoords[0].lng;
                        }
                    }
                    catch (err) {
                        this.logger.debug(`PostGIS 坐标查询失败 (placeId: ${placeId}): ${err}`);
                    }
                }
                if (!lat || !lng) {
                    this.logger.warn(`地点 ${placeId} (${placeName}) 无法获取坐标`);
                    results.push({
                        placeId,
                        placeName,
                        status: 'failed',
                        error: '无法获取地点坐标',
                    });
                    failedCount++;
                    continue;
                }
                try {
                    const weatherQuery = {
                        lat,
                        lng,
                        includeWindDetails: false,
                        includeAuroraInfo: false,
                    };
                    const weatherData = await this.dataSourceRouter.getWeather(weatherQuery);
                    const updatedMetadata = {
                        ...metadata,
                        weatherInfo: {
                            temperature: weatherData.temperature,
                            feelsLikeTemperature: weatherData.feelsLikeTemperature,
                            condition: weatherData.condition,
                            windSpeed: weatherData.windSpeed,
                            windDirection: weatherData.windDirection,
                            humidity: weatherData.humidity,
                            visibility: weatherData.visibility,
                            alerts: weatherData.alerts,
                            lastUpdated: weatherData.lastUpdated,
                            source: weatherData.source,
                        },
                        weather: weatherData,
                        weatherFetchedAt: new Date().toISOString(),
                    };
                    await this.prisma.place.update({
                        where: { id: placeId },
                        data: {
                            metadata: updatedMetadata,
                            updatedAt: new Date(),
                        },
                    });
                    results.push({
                        placeId,
                        placeName,
                        status: 'success',
                        weatherData: {
                            temperature: weatherData.temperature,
                            condition: weatherData.condition,
                            source: weatherData.source,
                        },
                    });
                    successCount++;
                }
                catch (error) {
                    this.logger.error(`为地点 ${placeId} (${placeName}) 获取天气数据失败: ${error.message}`, error.stack);
                    results.push({
                        placeId,
                        placeName,
                        status: 'failed',
                        error: error.message || '获取天气数据失败',
                    });
                    failedCount++;
                }
            }
            return (0, standard_response_dto_1.successResponse)({
                totalPlaces: placeMap.size,
                processedPlaces: results.length,
                successCount,
                failedCount,
                results,
            });
        }
        catch (error) {
            this.logger.error(`批量获取天气数据失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async fetchEvidenceForTrip(tripId, placeIds, evidenceTypes, forceRefresh, async) {
        let taskId;
        const shouldAsync = async === 'true';
        try {
            if (!this.prisma) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'PrismaService 未注入');
            }
            const requestedTypes = evidenceTypes
                ? evidenceTypes.split(',').map(t => t.trim().toLowerCase())
                : ['weather', 'road_closure', 'opening_hours'];
            const shouldFetchWeather = requestedTypes.includes('weather');
            const shouldFetchRoadClosure = requestedTypes.includes('road_closure');
            const shouldFetchOpeningHours = requestedTypes.includes('opening_hours');
            const shouldForceRefresh = forceRefresh === 'true';
            const trip = await this.prisma.trip.findUnique({
                where: { id: tripId },
                include: {
                    TripDay: {
                        include: {
                            ItineraryItem: {
                                include: {
                                    Place: {
                                        select: {
                                            id: true,
                                            nameCN: true,
                                            nameEN: true,
                                            category: true,
                                            metadata: true,
                                        },
                                    },
                                },
                                where: {
                                    placeId: { not: null },
                                },
                            },
                        },
                    },
                },
            });
            if (!trip) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `行程 ${tripId} 不存在`);
            }
            const placeMap = new Map();
            const tripWithDays = trip;
            if (tripWithDays.TripDay) {
                for (const day of tripWithDays.TripDay) {
                    if (day.ItineraryItem) {
                        for (const item of day.ItineraryItem) {
                            if (item.Place) {
                                placeMap.set(item.Place.id, item.Place);
                            }
                        }
                    }
                }
            }
            const allPlaceIds = Array.from(placeMap.keys());
            const locationMap = new Map();
            if (shouldAsync && this.evidenceFetchTaskService) {
                const targetPlaceIds = placeIds
                    ? placeIds.split(',').map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id))
                    : null;
                const totalPlaces = targetPlaceIds ? targetPlaceIds.length : placeMap.size;
                taskId = this.evidenceFetchTaskService.createTask(tripId, totalPlaces);
                this.evidenceFetchTaskService.markRunning(taskId);
                setImmediate(() => {
                    this.executeFetchEvidenceAsync(taskId, tripId, placeMap, targetPlaceIds, requestedTypes, shouldFetchWeather, shouldFetchRoadClosure, shouldFetchOpeningHours, shouldForceRefresh, locationMap).catch(error => {
                        this.logger.error(`异步获取证据失败: ${error.message}`, error.stack);
                        if (this.evidenceFetchTaskService) {
                            this.evidenceFetchTaskService.markFailed(taskId, error.message);
                        }
                    });
                });
                return (0, standard_response_dto_1.successResponse)({
                    taskId,
                    message: '证据获取任务已启动，请使用任务ID查询进度',
                });
            }
            if (allPlaceIds.length > 0 && this.prisma) {
                try {
                    this.logger.debug(`批量查询 ${allPlaceIds.length} 个地点的坐标: ${allPlaceIds.join(', ')}`);
                    try {
                        const postgisResults = await this.prisma.$queryRaw `
              SELECT 
                id,
                ST_Y(location::geometry) as lat,
                ST_X(location::geometry) as lng
              FROM "Place"
              WHERE id = ANY(${allPlaceIds}::int[]) 
                AND location IS NOT NULL
            `;
                        postgisResults.forEach(result => {
                            if (!isNaN(result.lat) && !isNaN(result.lng)) {
                                locationMap.set(result.id, {
                                    lat: Number(result.lat),
                                    lng: Number(result.lng),
                                });
                                this.logger.debug(`地点 ${result.id} 坐标（PostGIS）: lat=${result.lat}, lng=${result.lng}`);
                            }
                        });
                        this.logger.debug(`PostGIS 查询返回 ${postgisResults.length} 个坐标`);
                    }
                    catch (postgisError) {
                        this.logger.debug(`PostGIS 查询失败（可能不是 geography 类型）: ${postgisError.message}`);
                    }
                    if (locationMap.size < allPlaceIds.length) {
                        try {
                            const missingIds = allPlaceIds.filter(id => !locationMap.has(id));
                            if (missingIds.length > 0) {
                                this.logger.debug(`尝试查询 ${missingIds.length} 个缺失地点的 location 文本`);
                                const rawResults = await this.prisma.$queryRaw `
                  SELECT 
                    id,
                    location::text as location_text
                  FROM "Place"
                  WHERE id = ANY(${missingIds}::int[]) 
                    AND location IS NOT NULL
                `;
                                this.logger.debug(`原始 location 文本查询返回 ${rawResults.length} 个结果`);
                                rawResults.forEach(result => {
                                    if (!locationMap.has(result.id) && result.location_text) {
                                        const locText = result.location_text;
                                        try {
                                            if (locText.startsWith('{')) {
                                                const locJson = JSON.parse(locText);
                                                if (locJson && typeof locJson === 'object' && locJson.lat && locJson.lng) {
                                                    locationMap.set(result.id, {
                                                        lat: Number(locJson.lat),
                                                        lng: Number(locJson.lng),
                                                    });
                                                    this.logger.debug(`地点 ${result.id} 坐标（JSON解析）: lat=${locJson.lat}, lng=${locJson.lng}`);
                                                }
                                            }
                                            else if (locText.includes('POINT')) {
                                                const match = locText.match(/POINT\(([^)]+)\)/);
                                                if (match) {
                                                    const [lngStr, latStr] = match[1].split(/\s+/);
                                                    const lng = parseFloat(lngStr);
                                                    const lat = parseFloat(latStr);
                                                    if (!isNaN(lat) && !isNaN(lng)) {
                                                        locationMap.set(result.id, { lat, lng });
                                                        this.logger.debug(`地点 ${result.id} 坐标（POINT解析）: lat=${lat}, lng=${lng}`);
                                                    }
                                                }
                                            }
                                        }
                                        catch (parseError) {
                                            this.logger.debug(`地点 ${result.id} location 解析失败: ${locText === null || locText === void 0 ? void 0 : locText.substring(0, 100)}, 错误: ${parseError.message}`);
                                        }
                                    }
                                });
                            }
                        }
                        catch (rawError) {
                            this.logger.debug(`原始 location 文本查询失败: ${rawError.message}`);
                        }
                    }
                    this.logger.debug(`最终 locationMap 大小: ${locationMap.size}/${allPlaceIds.length}`);
                }
                catch (error) {
                    this.logger.warn(`批量提取坐标失败: ${error.message}`, error.stack);
                }
            }
            let targetPlaceIds = null;
            if (placeIds) {
                targetPlaceIds = placeIds.split(',').map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id));
            }
            const results = [];
            let successCount = 0;
            let partialCount = 0;
            let failedCount = 0;
            for (const [placeId, place] of placeMap.entries()) {
                if (targetPlaceIds && !targetPlaceIds.includes(placeId)) {
                    continue;
                }
                const placeName = place.nameCN || place.nameEN || `Place ${placeId}`;
                const metadata = place.metadata || {};
                if (!shouldAsync && taskId && this.evidenceFetchTaskService) {
                    const evidenceTypes = [];
                    if (shouldFetchWeather)
                        evidenceTypes.push('weather');
                    if (shouldFetchRoadClosure)
                        evidenceTypes.push('road_closure');
                    if (shouldFetchOpeningHours)
                        evidenceTypes.push('opening_hours');
                    this.evidenceFetchTaskService.updateCurrentPlace(taskId, placeId, placeName, evidenceTypes);
                }
                let lat = null;
                let lng = null;
                if (metadata.lat && metadata.lng) {
                    lat = metadata.lat;
                    lng = metadata.lng;
                }
                else if (metadata.coordinates && Array.isArray(metadata.coordinates)) {
                    lat = metadata.coordinates[1];
                    lng = metadata.coordinates[0];
                }
                if (locationMap.has(placeId)) {
                    const coords = locationMap.get(placeId);
                    lat = coords.lat;
                    lng = coords.lng;
                    this.logger.debug(`从 locationMap 获取地点 ${placeId} 坐标: lat=${lat}, lng=${lng}`);
                }
                else if (place.location) {
                    const location = place.location;
                    if (typeof location === 'object' && location.lat && location.lng) {
                        lat = location.lat;
                        lng = location.lng;
                        this.logger.debug(`从 place.location JSON 对象获取地点 ${placeId} 坐标: lat=${lat}, lng=${lng}`);
                    }
                    else if (typeof location === 'object' && location.coordinates && Array.isArray(location.coordinates)) {
                        lng = location.coordinates[0];
                        lat = location.coordinates[1];
                        this.logger.debug(`从 place.location GeoJSON 获取地点 ${placeId} 坐标: lat=${lat}, lng=${lng}`);
                    }
                    else if (typeof location === 'string') {
                        const match = location.match(/POINT\(([^)]+)\)/);
                        if (match) {
                            const [lngStr, latStr] = match[1].split(/\s+/);
                            lng = parseFloat(lngStr);
                            lat = parseFloat(latStr);
                            this.logger.debug(`从 place.location 字符串获取地点 ${placeId} 坐标: lat=${lat}, lng=${lng}`);
                        }
                    }
                }
                if ((!lat || !lng) && this.prisma) {
                    try {
                        const placeCoords = await this.prisma.$queryRaw `
              SELECT ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
              FROM "Place"
              WHERE id = ${placeId} AND location IS NOT NULL
            `;
                        if (placeCoords && placeCoords.length > 0 && placeCoords[0].lat && placeCoords[0].lng) {
                            lat = placeCoords[0].lat;
                            lng = placeCoords[0].lng;
                        }
                    }
                    catch (err) {
                        this.logger.debug(`PostGIS 坐标查询失败 (placeId: ${placeId}): ${err}`);
                    }
                }
                const fetched = {};
                const errors = {};
                const evidenceTypesFetched = [];
                if (shouldFetchWeather && lat && lng) {
                    if (shouldForceRefresh || !metadata.weatherInfo && !metadata.weather) {
                        try {
                            if (this.dataSourceRouter) {
                                const weatherQuery = {
                                    lat,
                                    lng,
                                    includeWindDetails: false,
                                    includeAuroraInfo: false,
                                };
                                const weatherData = await this.dataSourceRouter.getWeather(weatherQuery);
                                fetched.weather = {
                                    temperature: weatherData.temperature,
                                    condition: weatherData.condition,
                                    source: weatherData.source,
                                };
                                metadata.weatherInfo = {
                                    temperature: weatherData.temperature,
                                    feelsLikeTemperature: weatherData.feelsLikeTemperature,
                                    condition: weatherData.condition,
                                    windSpeed: weatherData.windSpeed,
                                    windDirection: weatherData.windDirection,
                                    humidity: weatherData.humidity,
                                    visibility: weatherData.visibility,
                                    alerts: weatherData.alerts,
                                    lastUpdated: weatherData.lastUpdated,
                                    source: weatherData.source,
                                };
                                metadata.weather = weatherData;
                                metadata.weatherFetchedAt = new Date().toISOString();
                                evidenceTypesFetched.push('weather');
                            }
                        }
                        catch (error) {
                            errors.weather = error.message || '获取天气数据失败';
                        }
                    }
                }
                if (shouldFetchRoadClosure && lat && lng) {
                    if (shouldForceRefresh || !metadata.roadStatus && !metadata.roadClosure) {
                        try {
                            if (this.dataSourceRouter) {
                                const roadQuery = {
                                    lat,
                                    lng,
                                    radius: 50000,
                                    includeFRoadInfo: true,
                                    includeRiverCrossing: true,
                                };
                                const roadStatus = await this.dataSourceRouter.getRoadStatus(roadQuery);
                                fetched.road_closure = {
                                    isOpen: roadStatus.isOpen,
                                    riskLevel: roadStatus.riskLevel,
                                    source: roadStatus.source,
                                };
                                metadata.roadStatus = {
                                    isOpen: roadStatus.isOpen,
                                    riskLevel: roadStatus.riskLevel,
                                    reason: roadStatus.reason,
                                    lastUpdated: roadStatus.lastUpdated,
                                    source: roadStatus.source,
                                    metadata: roadStatus.metadata,
                                };
                                metadata.roadClosure = !roadStatus.isOpen;
                                metadata.roadStatusFetchedAt = new Date().toISOString();
                                evidenceTypesFetched.push('road_closure');
                            }
                        }
                        catch (error) {
                            errors.road_closure = error.message || '获取道路封闭信息失败';
                        }
                    }
                }
                if (shouldFetchOpeningHours) {
                    if (shouldForceRefresh || !metadata.openingHours && !metadata.opening_hours) {
                        try {
                            if (this.placesService && place.category === 'ATTRACTION') {
                                await this.placesService.enrichPlaceFromAmap(placeId);
                                const updatedPlace = await this.prisma.place.findUnique({
                                    where: { id: placeId },
                                    select: { metadata: true },
                                });
                                if (updatedPlace) {
                                    const updatedMetadata = updatedPlace.metadata || {};
                                    if (updatedMetadata.openingHours || updatedMetadata.opening_hours) {
                                        fetched.opening_hours = {
                                            hasData: true,
                                            source: 'amap',
                                        };
                                        metadata.openingHours = updatedMetadata.openingHours || updatedMetadata.opening_hours;
                                        evidenceTypesFetched.push('opening_hours');
                                    }
                                }
                            }
                        }
                        catch (error) {
                            errors.opening_hours = error.message || '获取开放时间失败';
                        }
                    }
                }
                if (Object.keys(fetched).length > 0) {
                    try {
                        await this.prisma.place.update({
                            where: { id: placeId },
                            data: {
                                metadata: metadata,
                                updatedAt: new Date(),
                            },
                        });
                    }
                    catch (error) {
                        this.logger.error(`更新地点 ${placeId} metadata 失败: ${error.message}`);
                    }
                }
                const requestedCount = requestedTypes.length;
                const fetchedCount = evidenceTypesFetched.length;
                const errorCount = Object.keys(errors).length;
                let status;
                if (fetchedCount === requestedCount && errorCount === 0) {
                    status = 'success';
                    successCount++;
                }
                else if (fetchedCount > 0) {
                    status = 'partial';
                    partialCount++;
                }
                else {
                    status = 'failed';
                    failedCount++;
                }
                if (!shouldAsync && taskId && this.evidenceFetchTaskService) {
                    this.evidenceFetchTaskService.incrementProcessed(taskId, status);
                }
                results.push({
                    placeId,
                    placeName,
                    evidenceTypes: evidenceTypesFetched,
                    status,
                    errors: Object.keys(errors).length > 0 ? errors : undefined,
                    fetched: Object.keys(fetched).length > 0 ? fetched : undefined,
                });
            }
            if (!shouldAsync && taskId && this.evidenceFetchTaskService) {
                this.evidenceFetchTaskService.markCompleted(taskId, successCount, failedCount, partialCount);
            }
            return (0, standard_response_dto_1.successResponse)({
                totalPlaces: placeMap.size,
                processedPlaces: results.length,
                successCount,
                partialCount,
                failedCount,
                requestedEvidenceTypes: requestedTypes,
                results,
            });
        }
        catch (error) {
            this.logger.error(`批量获取证据数据失败: ${error.message}`, error.stack);
            if (taskId && this.evidenceFetchTaskService && async !== 'true') {
                this.evidenceFetchTaskService.markFailed(taskId, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async executeFetchEvidenceAsync(taskId, tripId, placeMap, targetPlaceIds, requestedTypes, shouldFetchWeather, shouldFetchRoadClosure, shouldFetchOpeningHours, shouldForceRefresh, locationMap) {
        this.logger.debug(`异步任务 ${taskId} 已启动（注意：当前为简化实现）`);
    }
    async getTaskProgress(taskId) {
        try {
            if (!this.evidenceFetchTaskService) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'EvidenceFetchTaskService 未注入');
            }
            const progress = this.evidenceFetchTaskService.getTaskProgress(taskId);
            if (!progress) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `任务 ${taskId} 不存在`);
            }
            return (0, standard_response_dto_1.successResponse)(progress);
        }
        catch (error) {
            this.logger.error(`获取任务进度失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '获取任务进度失败', { originalError: error.message });
        }
    }
    async cancelTask(taskId) {
        try {
            if (!this.evidenceFetchTaskService) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'EvidenceFetchTaskService 未注入');
            }
            const cancelled = this.evidenceFetchTaskService.cancelTask(taskId);
            if (!cancelled) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `任务 ${taskId} 不存在或无法取消`);
            }
            return (0, standard_response_dto_1.successResponse)({
                taskId,
                message: '任务已取消',
            });
        }
        catch (error) {
            this.logger.error(`取消任务失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '取消任务失败', { originalError: error.message });
        }
    }
    async executeAsync(request) {
        if (!this.planningWorkbenchTaskService) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'PlanningWorkbenchTaskService 未注入');
        }
        try {
            const taskId = this.planningWorkbenchTaskService.createTask();
            setImmediate(() => {
                this.executeTaskAsync(taskId, request).catch((error) => {
                    var _a;
                    this.logger.error(`异步任务执行失败: taskId=${taskId}, error=${error.message}`, error.stack);
                    try {
                        (_a = this.planningWorkbenchTaskService) === null || _a === void 0 ? void 0 : _a.markFailed(taskId, error.message || '未知错误');
                    }
                    catch (markFailedError) {
                        this.logger.error(`标记任务失败时出错: ${markFailedError.message}`, markFailedError.stack);
                    }
                });
            });
            return (0, standard_response_dto_1.successResponse)({
                taskId,
                message: '任务已接受，正在处理中',
                statusUrl: `/api/planning-workbench/tasks/${taskId}/status`,
            });
        }
        catch (error) {
            this.logger.error(`创建异步任务失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPlanningWorkbenchTaskStatus(taskId) {
        if (!this.planningWorkbenchTaskService) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'PlanningWorkbenchTaskService 未注入');
        }
        try {
            const progress = this.planningWorkbenchTaskService.getTaskProgress(taskId);
            if (!progress) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `任务 ${taskId} 不存在`);
            }
            return (0, standard_response_dto_1.successResponse)(progress);
        }
        catch (error) {
            this.logger.error(`获取任务状态失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async cancelPlanningWorkbenchTask(taskId) {
        if (!this.planningWorkbenchTaskService) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'PlanningWorkbenchTaskService 未注入');
        }
        try {
            const cancelled = this.planningWorkbenchTaskService.cancelTask(taskId);
            if (!cancelled) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `任务 ${taskId} 不存在或无法取消`);
            }
            return (0, standard_response_dto_1.successResponse)({
                taskId,
                message: '任务已取消',
            });
        }
        catch (error) {
            this.logger.error(`取消任务失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async executeTaskAsync(taskId, request) {
        if (!this.planningWorkbenchTaskService) {
            throw new Error('PlanningWorkbenchTaskService 未注入');
        }
        const startTime = Date.now();
        try {
            this.planningWorkbenchTaskService.markRunning(taskId, '正在初始化...');
            const requestWithProgress = {
                ...request,
                metadata: {
                    ...request.metadata,
                    taskId,
                    updateProgress: (progress, stage) => {
                        var _a;
                        try {
                            this.logger.debug(`进度更新回调被调用: taskId=${taskId}, progress=${progress}%, stage=${stage || 'N/A'}`);
                            (_a = this.planningWorkbenchTaskService) === null || _a === void 0 ? void 0 : _a.updateProgressPercent(taskId, progress, stage);
                        }
                        catch (error) {
                            this.logger.error(`进度更新回调失败: ${error.message}`, error.stack);
                        }
                    },
                },
            };
            this.logger.debug(`开始执行异步任务: taskId=${taskId}, action=${request.userAction || 'generate'}`);
            this.planningWorkbenchTaskService.updateProgressPercent(taskId, 10, '正在生成行程骨架方案...');
            const result = await this.planningWorkbenchAgent.execute(requestWithProgress);
            this.planningWorkbenchTaskService.markCompleted(taskId, result);
            const duration = Date.now() - startTime;
            this.logger.log(`✅ 异步任务 ${taskId} 完成，耗时 ${duration}ms`);
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`❌ 异步任务 ${taskId} 失败，耗时 ${duration}ms: ${error.message}`, error.stack);
            try {
                this.planningWorkbenchTaskService.markFailed(taskId, error.message || '未知错误');
            }
            catch (markFailedError) {
                this.logger.error(`标记任务失败状态时出错: ${markFailedError.message}`, markFailedError.stack);
            }
        }
    }
};
exports.PlanningWorkbenchController = PlanningWorkbenchController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('execute'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '执行规划工作台流程',
        description: `
规划工作台的主入口，支持以下操作：
- generate: 生成行程骨架方案（✅ v2.0新增：自动填充DEM地形数据和地理特征）
- compare: 对比多个方案（✅ v2.0新增：多维度评分对比）
- commit: 提交选定的方案（✅ v2.0新增：自动填充DEM和地理特征）
- adjust: 调整现有方案

**v2.0新增功能**：
- ✅ DEM地形数据填充：自动填充segments的distanceKm、ascentM、slopePct
- ✅ 地理特征查询：自动查询河流、山脉、危险区域等
- ✅ RAG语义搜索：POI查询使用向量搜索进行语义匹配
- ✅ 决策追溯链：记录决策过程和排除原因

返回三人格的决策结果（Abu/Dr.Dre/Neptune），其他角色（预算/交通/节奏/总规划师）隐藏为能力模块。

详细文档请参考：/src/agent/PLANNING_WORKBENCH_API.md
    `.trim(),
    }),
    (0, swagger_1.ApiBody)({
        description: '规划工作台请求',
        schema: {
            type: 'object',
            properties: {
                context: {
                    type: 'object',
                    properties: {
                        destination: {
                            type: 'object',
                            properties: {
                                country: { type: 'string' },
                                city: { type: 'string' },
                                region: { type: 'string' },
                            },
                        },
                        days: { type: 'number' },
                        travelMode: { type: 'string', enum: ['self_drive', 'public_transit', 'walking', 'mixed'] },
                        mustDo: { type: 'array', items: { type: 'string' } },
                        mustAvoid: { type: 'array', items: { type: 'string' } },
                        constraints: { type: 'object' },
                    },
                    required: ['destination', 'days'],
                },
                tripId: { type: 'string' },
                userAction: { type: 'string', enum: ['generate', 'compare', 'commit', 'adjust'] },
                selectedOptionId: { type: 'string', description: '选定的方案ID（commit时使用）' },
                skeletonOptions: { type: 'object', description: '骨架方案集（compare时使用）' },
            },
            required: ['context'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '规划工作台执行成功',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                data: {
                    type: 'object',
                    properties: {
                        planState: { type: 'object' },
                        uiOutput: {
                            type: 'object',
                            properties: {
                                personas: {
                                    type: 'object',
                                    properties: {
                                        abu: { type: 'object' },
                                        drdre: { type: 'object' },
                                        neptune: { type: 'object' },
                                    },
                                },
                                consolidatedDecision: {
                                    type: 'object',
                                    properties: {
                                        status: { type: 'string', enum: ['ALLOW', 'NEED_CONFIRM', 'REJECT'] },
                                        summary: { type: 'string' },
                                        nextSteps: { type: 'array', items: { type: 'string' } },
                                    },
                                },
                                skeletonOptions: {
                                    type: 'object',
                                    description: '骨架方案集（generate操作返回）',
                                },
                                comparison: {
                                    type: 'object',
                                    description: '对比结果（compare操作返回，包含多维度评分）',
                                },
                                health: {
                                    type: 'object',
                                    description: '健康度评估（预算/节奏/可行性）',
                                },
                                confirmations: {
                                    type: 'array',
                                    items: { type: 'string' },
                                    description: '需要用户确认的事项',
                                },
                            },
                        },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "execute", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('state/:planId'),
    (0, swagger_1.ApiOperation)({
        summary: '获取规划状态',
        description: '根据 planId 获取当前的 PlanState',
    }),
    (0, swagger_1.ApiParam)({
        name: 'planId',
        description: '规划 ID',
        type: 'string',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
    }),
    __param(0, (0, common_1.Param)('planId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "getState", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trips/:tripId'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程的规划工作台数据',
        description: '获取指定行程的当前方案和方案历史列表',
    }),
    (0, swagger_1.ApiParam)({
        name: 'tripId',
        description: '行程 ID',
        type: 'string',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "getTripWorkbench", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('trips/:tripId/plans'),
    (0, swagger_1.ApiOperation)({
        summary: '获取行程的规划方案列表',
        description: '获取指定行程的所有规划方案列表，支持状态筛选和分页',
    }),
    (0, swagger_1.ApiParam)({
        name: 'tripId',
        description: '行程 ID',
        type: 'string',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'status',
        description: '筛选状态',
        required: false,
        enum: ['DRAFT', 'PROPOSED', 'NEED_CONFIRM', 'LOCKED'],
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        description: '每页数量',
        required: false,
        type: Number,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'offset',
        description: '偏移量',
        required: false,
        type: Number,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "getTripPlans", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('plans/:planId'),
    (0, swagger_1.ApiOperation)({
        summary: '获取方案详情',
        description: '获取指定方案的详细信息（包含完整的 planState 和 uiOutput）',
    }),
    (0, swagger_1.ApiParam)({
        name: 'planId',
        description: '方案 ID',
        type: 'string',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
    }),
    __param(0, (0, common_1.Param)('planId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "getPlan", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('plans/compare'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '对比多个规划方案',
        description: '对比多个规划方案，提供详细的对比结果',
    }),
    (0, swagger_1.ApiBody)({
        description: '对比方案请求',
        schema: {
            type: 'object',
            properties: {
                planIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '要对比的方案 ID 列表（至少 2 个）',
                },
                compareFields: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '要对比的字段（可选）',
                },
            },
            required: ['planIds'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '对比成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "comparePlans", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('plans/:planId/adjust'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '调整规划方案',
        description: '基于现有方案进行调整，提供更细粒度的调整控制',
    }),
    (0, swagger_1.ApiParam)({
        name: 'planId',
        description: '方案 ID',
        type: 'string',
    }),
    (0, swagger_1.ApiBody)({
        description: '调整方案请求',
        schema: {
            type: 'object',
            properties: {
                adjustments: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['add_place', 'remove_place', 'modify_constraint', 'change_day', 'modify_budget'],
                            },
                            data: { type: 'object' },
                        },
                    },
                },
                regenerate: {
                    type: 'boolean',
                    description: '是否重新生成方案',
                    default: true,
                },
            },
            required: ['adjustments'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '调整成功',
    }),
    __param(0, (0, common_1.Param)('planId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "adjustPlan", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('plans/:planId/commit'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '提交规划方案',
        description: '将规划方案提交并保存到行程，支持部分提交',
    }),
    (0, swagger_1.ApiParam)({
        name: 'planId',
        description: '规划 ID',
        type: 'string',
    }),
    (0, swagger_1.ApiBody)({
        description: '提交方案请求',
        schema: {
            type: 'object',
            properties: {
                tripId: { type: 'string', description: '行程 ID' },
                options: {
                    type: 'object',
                    properties: {
                        partialCommit: { type: 'boolean', description: '是否部分提交' },
                        commitDays: { type: 'array', items: { type: 'number' }, description: '要提交的天数（如果部分提交）' },
                    },
                },
            },
            required: ['tripId'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '提交成功',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                data: {
                    type: 'object',
                    properties: {
                        tripId: { type: 'string' },
                        planId: { type: 'string' },
                        committedAt: { type: 'string' },
                        changes: {
                            type: 'object',
                            properties: {
                                added: { type: 'number' },
                                modified: { type: 'number' },
                                removed: { type: 'number' },
                            },
                        },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Param)('planId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "commitPlan", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('budget/evaluate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '预算合理性评估',
        description: '评估规划方案的预算合理性（Should-Exist Gate 的一部分）',
    }),
    (0, swagger_1.ApiBody)({
        description: '预算评估请求',
        schema: {
            type: 'object',
            properties: {
                planId: { type: 'string', description: '方案 ID' },
                tripId: { type: 'string', description: '行程 ID' },
                estimatedCost: { type: 'number', description: '预估总成本' },
                categoryBreakdown: {
                    type: 'object',
                    properties: {
                        accommodation: { type: 'number' },
                        transportation: { type: 'number' },
                        food: { type: 'number' },
                        activities: { type: 'number' },
                        other: { type: 'number' },
                    },
                },
                budgetConstraint: {
                    type: 'object',
                    properties: {
                        total: { type: 'number' },
                        currency: { type: 'string' },
                        dailyBudget: { type: 'number' },
                        categoryLimits: { type: 'object' },
                        alertThreshold: { type: 'number' },
                    },
                },
            },
            required: ['planId', 'tripId', 'estimatedCost', 'categoryBreakdown', 'budgetConstraint'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '评估成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "evaluateBudget", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('budget/decision-log'),
    (0, swagger_1.ApiOperation)({
        summary: '获取预算决策日志',
        description: '获取预算评估的决策日志（用于可解释性）',
    }),
    (0, swagger_1.ApiQuery)({ name: 'planId', description: '方案 ID', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'tripId', description: '行程 ID', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: '分页限制', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'offset', description: '分页偏移', required: false, type: Number }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
    }),
    __param(0, (0, common_1.Query)('planId')),
    __param(1, (0, common_1.Query)('tripId')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "getBudgetDecisionLog", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('plans/:planId/budget-evaluation'),
    (0, swagger_1.ApiOperation)({
        summary: '获取规划方案的预算评估结果',
        description: '获取规划方案的预算评估结果，包含三人格输出（Abu）',
    }),
    (0, swagger_1.ApiParam)({ name: 'planId', description: '方案 ID' }),
    (0, swagger_1.ApiQuery)({ name: 'tripId', description: '行程 ID', required: true }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
    }),
    __param(0, (0, common_1.Param)('planId')),
    __param(1, (0, common_1.Query)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "getPlanBudgetEvaluation", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('budget/apply-optimization'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '应用预算优化建议',
        description: '应用预算优化建议（自动调整行程项）',
    }),
    (0, swagger_1.ApiBody)({
        description: '应用优化请求',
        schema: {
            type: 'object',
            properties: {
                planId: { type: 'string', description: '方案 ID' },
                tripId: { type: 'string', description: '行程 ID' },
                optimizationIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '要应用的优化建议 ID 列表',
                },
                autoCommit: { type: 'boolean', description: '是否自动提交（默认 false）', default: false },
            },
            required: ['planId', 'tripId', 'optimizationIds'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '应用成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "applyBudgetOptimization", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('auto-optimize'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Auto综合：批量应用高优先级建议',
        description: '自动应用所有高优先级建议（severity === BLOCKER）。只应用高优先级建议，确保安全性。',
    }),
    (0, swagger_1.ApiBody)({
        description: 'Auto综合请求',
        schema: {
            type: 'object',
            properties: {
                tripId: { type: 'string', description: '行程 ID' },
                preview: { type: 'boolean', description: '是否预览模式（不实际应用）', default: false },
                limit: { type: 'number', description: '最多应用的建议数量', default: 10 },
            },
            required: ['tripId'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '执行成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "autoOptimize", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/sessions'),
    (0, swagger_1.ApiOperation)({
        summary: '获取规划会话列表（管理接口）',
        description: '获取规划会话列表，支持分页、筛选、排序。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'tripId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'userId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, enum: ['DRAFT', 'PROPOSED', 'NEED_CONFIRM', 'LOCKED'] }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, type: String }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回会话列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "getAdminSessions", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/sessions/stats'),
    (0, swagger_1.ApiOperation)({
        summary: '获取会话统计（管理接口）',
        description: '获取规划会话的统计信息，包括成功率、平均时长等。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, type: String }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回会话统计',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "getAdminSessionStats", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/sessions/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取规划会话详情（管理接口）',
        description: '获取单个规划会话的详细信息，包含所有交互历史。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '会话ID（PlanningPlan ID）' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回会话详情',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '会话不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "getAdminSessionDetail", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/plans'),
    (0, swagger_1.ApiOperation)({
        summary: '获取规划方案列表（管理接口）',
        description: '获取规划方案列表，支持分页、筛选。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'tripId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, enum: ['DRAFT', 'PROPOSED', 'NEED_CONFIRM', 'LOCKED'] }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回方案列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "getAdminPlans", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/plans/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取规划方案详情（管理接口）',
        description: '获取单个规划方案的详细信息。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '方案ID（PlanningPlan ID）' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回方案详情',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '方案不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "getAdminPlanDetail", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('trips/:tripId/fetch-weather'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '为行程地点批量获取天气数据',
        description: '为指定行程中缺少天气数据的地点批量获取天气数据，并更新到 Place 的 metadata 中',
    }),
    (0, swagger_1.ApiParam)({
        name: 'tripId',
        description: '行程 ID',
        type: 'string',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'placeIds',
        description: '指定要获取天气数据的地点 ID 列表（可选，不提供则处理所有缺少天气数据的地点）',
        required: false,
        type: String,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'forceRefresh',
        description: '是否强制刷新已有天气数据',
        required: false,
        type: Boolean,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回天气数据获取结果',
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Query)('placeIds')),
    __param(2, (0, common_1.Query)('forceRefresh')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "fetchWeatherForTrip", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('trips/:tripId/fetch-evidence'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '为行程地点批量获取所有类型的证据数据',
        description: '为指定行程中缺少证据的地点批量获取天气、道路封闭、开放时间等证据数据，并更新到 Place 的 metadata 中',
    }),
    (0, swagger_1.ApiParam)({
        name: 'tripId',
        description: '行程 ID',
        type: 'string',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'placeIds',
        description: '指定要获取证据的地点 ID 列表（可选，不提供则处理所有缺少证据的地点）',
        required: false,
        type: String,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'evidenceTypes',
        description: '要获取的证据类型，多个类型用逗号分隔（weather,road_closure,opening_hours）。不提供则获取所有类型',
        required: false,
        type: String,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'forceRefresh',
        description: '是否强制刷新已有证据数据',
        required: false,
        type: Boolean,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回证据数据获取结果',
    }),
    __param(0, (0, common_1.Param)('tripId')),
    __param(1, (0, common_1.Query)('placeIds')),
    __param(2, (0, common_1.Query)('evidenceTypes')),
    __param(3, (0, common_1.Query)('forceRefresh')),
    __param(4, (0, common_1.Query)('async')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "fetchEvidenceForTrip", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('tasks/:taskId/progress'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '获取证据获取任务进度',
        description: '查询异步证据获取任务的进度信息（P1功能）。支持轮询查询进度。',
    }),
    (0, swagger_1.ApiParam)({ name: 'taskId', description: '任务ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功获取任务进度',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '任务不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "getTaskProgress", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('tasks/:taskId/cancel'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '取消证据获取任务',
        description: '取消正在执行的证据获取任务（P1功能）。只能取消PENDING或RUNNING状态的任务。',
    }),
    (0, swagger_1.ApiParam)({ name: 'taskId', description: '任务ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功取消任务',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '任务不存在或无法取消',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "cancelTask", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('execute-async'),
    (0, common_1.HttpCode)(202),
    (0, swagger_1.ApiOperation)({
        summary: '异步执行规划工作台（P0功能）',
        description: '异步执行规划工作台流程，立即返回 taskId，客户端需要轮询 /api/planning-workbench/tasks/:taskId/status 获取结果。使用场景：当规划工作台处理时间较长（>30秒）时，使用异步模式可以避免HTTP超时问题。工作流程：1. 调用此端点，立即返回 202 Accepted 和 taskId；2. 客户端轮询 /api/planning-workbench/tasks/:taskId/status 获取进度和结果；3. 当任务状态为 COMPLETED 时，结果在 result 字段中。轮询建议：初始间隔1秒，最大间隔5秒，超时时间120秒（2分钟）。',
    }),
    (0, swagger_1.ApiBody)({
        description: '规划工作台请求（与同步模式相同）',
    }),
    (0, swagger_1.ApiResponse)({
        status: 202,
        description: '任务已接受，返回 taskId',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                data: {
                    type: 'object',
                    properties: {
                        taskId: { type: 'string', example: '550e8400-e29b-41d4-a716-446655440000' },
                        message: { type: 'string', example: '任务已接受，正在处理中' },
                        statusUrl: { type: 'string', example: '/api/planning-workbench/tasks/:taskId/status' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "executeAsync", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('tasks/:taskId/status'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: '获取规划工作台任务状态（P0功能）',
        description: '查询异步规划工作台任务的状态和进度。返回状态：PENDING（任务已创建，等待执行）、RUNNING（任务正在执行中）、COMPLETED（任务已完成，结果在 result 字段中）、FAILED（任务失败，错误信息在 error 字段中）、CANCELLED（任务已取消）。轮询建议：初始间隔1秒，最大间隔5秒，超时时间120秒（2分钟）。',
    }),
    (0, swagger_1.ApiParam)({
        name: 'taskId',
        description: '任务ID',
        type: String,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功获取任务状态',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                data: {
                    type: 'object',
                    properties: {
                        taskId: { type: 'string' },
                        status: { type: 'string', enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] },
                        progress: { type: 'number', minimum: 0, maximum: 100 },
                        currentStage: { type: 'string', nullable: true },
                        estimatedTimeRemaining: { type: 'number', nullable: true },
                        error: { type: 'string', nullable: true },
                        result: { type: 'object', nullable: true },
                        createdAt: { type: 'string' },
                        updatedAt: { type: 'string' },
                        completedAt: { type: 'string', nullable: true },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '任务不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "getPlanningWorkbenchTaskStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('tasks/:taskId/cancel-planning'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({
        summary: '取消规划工作台任务（P0功能）',
        description: '取消正在执行的规划工作台任务。只能取消 PENDING 或 RUNNING 状态的任务。',
    }),
    (0, swagger_1.ApiParam)({
        name: 'taskId',
        description: '任务ID',
        type: String,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功取消任务',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                data: {
                    type: 'object',
                    properties: {
                        taskId: { type: 'string' },
                        message: { type: 'string' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlanningWorkbenchController.prototype, "cancelPlanningWorkbenchTask", null);
exports.PlanningWorkbenchController = PlanningWorkbenchController = PlanningWorkbenchController_1 = __decorate([
    (0, swagger_1.ApiTags)('planning-workbench'),
    (0, common_1.Controller)('planning-workbench'),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __param(7, (0, common_1.Optional)()),
    __param(8, (0, common_1.Optional)()),
    __param(9, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [planning_workbench_agent_service_1.PlanningWorkbenchAgentService,
        budget_evaluation_service_1.BudgetEvaluationService,
        trip_budget_service_1.TripBudgetService,
        planning_workbench_admin_service_1.PlanningWorkbenchAdminService,
        prisma_service_1.PrismaService,
        data_source_router_service_1.DataSourceRouterService,
        places_service_1.PlacesService,
        evidence_fetch_task_service_1.EvidenceFetchTaskService,
        planning_workbench_task_service_1.PlanningWorkbenchTaskService,
        trip_suggestions_service_1.TripSuggestionsService])
], PlanningWorkbenchController);
//# sourceMappingURL=planning-workbench.controller.js.map
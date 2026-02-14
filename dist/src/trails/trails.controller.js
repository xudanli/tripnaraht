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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrailsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const trails_service_1 = require("./trails.service");
const create_trail_dto_1 = require("./dto/create-trail.dto");
const update_trail_dto_1 = require("./dto/update-trail.dto");
const trail_support_services_service_1 = require("./services/trail-support-services.service");
const smart_trail_planner_service_1 = require("./services/smart-trail-planner.service");
const trail_tracking_service_1 = require("./services/trail-tracking.service");
const trail_recommendation_dto_1 = require("./dto/trail-recommendation.dto");
let TrailsController = class TrailsController {
    constructor(trailsService, supportServicesService, smartPlannerService, trackingService) {
        this.trailsService = trailsService;
        this.supportServicesService = supportServicesService;
        this.smartPlannerService = smartPlannerService;
        this.trackingService = trackingService;
    }
    create(createTrailDto) {
        return this.trailsService.create(createTrailDto);
    }
    findAll(placeId, difficulty, minDistance, maxDistance, source) {
        const filters = {};
        if (placeId) {
            filters.placeId = parseInt(placeId, 10);
        }
        if (difficulty) {
            filters.difficulty = difficulty;
        }
        if (minDistance) {
            filters.minDistance = parseFloat(minDistance);
        }
        if (maxDistance) {
            filters.maxDistance = parseFloat(maxDistance);
        }
        if (source) {
            filters.source = source;
        }
        return this.trailsService.findAll(filters);
    }
    findOne(id) {
        return this.trailsService.findOne(id);
    }
    update(id, updateTrailDto) {
        return this.trailsService.update(id, updateTrailDto);
    }
    remove(id) {
        return this.trailsService.remove(id);
    }
    recommendForPlaces(dto) {
        return this.trailsService.recommendTrailsForPlaces(dto.placeIds, {
            maxDistance: dto.maxDistance,
            preferOffRoad: dto.preferOffRoad,
            maxDifficulty: dto.maxDifficulty,
        });
    }
    findPlacesAlong(id, radiusKm) {
        return this.trailsService.findPlacesAlongTrail(id, radiusKm ? parseFloat(radiusKm) : 3);
    }
    splitIntoSegments(id, maxSegmentLengthKm) {
        return this.trailsService.splitTrailIntoSegments(id, maxSegmentLengthKm ? parseFloat(maxSegmentLengthKm) : undefined);
    }
    getSupportServices(id) {
        return this.supportServicesService.recommendSupportServices(id);
    }
    async checkSuitability(id, body) {
        return this.trailsService.checkTrailSuitability(id, body);
    }
    async smartPlan(body) {
        return this.smartPlannerService.planSmartRoute(body);
    }
    async startTracking(body) {
        return this.trackingService.startTracking(body.trailId, body.itineraryItemId);
    }
    async addTrackingPoint(sessionId, point) {
        return this.trackingService.addTrackingPoint(sessionId, {
            timestamp: new Date().toISOString(),
            ...point,
        });
    }
    async stopTracking(sessionId) {
        return this.trackingService.stopTracking(sessionId);
    }
    async getTrackingSession(sessionId) {
        const session = this.trackingService.getTrackingSession(sessionId);
        if (!session) {
            throw new common_1.NotFoundException('追踪会话不存在');
        }
        return session;
    }
};
exports.TrailsController = TrailsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '创建徒步路线' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: '创建成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '关联的Place不存在' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_trail_dto_1.CreateTrailDto]),
    __metadata("design:returntype", void 0)
], TrailsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '查询徒步路线列表' }),
    (0, swagger_1.ApiQuery)({ name: 'placeId', required: false, description: '关联的Place ID（起点、终点或途经点）' }),
    (0, swagger_1.ApiQuery)({ name: 'difficulty', required: false, description: '难度等级（EXTREME, HARD, MODERATE, EASY）' }),
    (0, swagger_1.ApiQuery)({ name: 'minDistance', required: false, description: '最小距离（公里）' }),
    (0, swagger_1.ApiQuery)({ name: 'maxDistance', required: false, description: '最大距离（公里）' }),
    (0, swagger_1.ApiQuery)({ name: 'source', required: false, description: '数据来源（alltrails, gpx, manual等）' }),
    __param(0, (0, common_1.Query)('placeId')),
    __param(1, (0, common_1.Query)('difficulty')),
    __param(2, (0, common_1.Query)('minDistance')),
    __param(3, (0, common_1.Query)('maxDistance')),
    __param(4, (0, common_1.Query)('source')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], TrailsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '根据ID查询徒步路线' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '查询成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线不存在' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], TrailsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '更新徒步路线' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '更新成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线不存在' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_trail_dto_1.UpdateTrailDto]),
    __metadata("design:returntype", void 0)
], TrailsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '删除徒步路线' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '删除成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线不存在' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '路线已被使用，无法删除' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], TrailsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('recommend-for-places'),
    (0, swagger_1.ApiOperation)({
        summary: '根据多个景点推荐徒步路线',
        description: '找到能够串联这些景点的Trail，优先推荐小众步道'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '推荐成功' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [trail_recommendation_dto_1.RecommendTrailsForPlacesDto]),
    __metadata("design:returntype", void 0)
], TrailsController.prototype, "recommendForPlaces", null);
__decorate([
    (0, common_1.Get)(':id/places-along'),
    (0, swagger_1.ApiOperation)({
        summary: '识别Trail沿途的景点',
        description: '查找轨迹沿途指定半径内的景点、观景台等'
    }),
    (0, swagger_1.ApiQuery)({ name: 'radiusKm', required: false, description: '搜索半径（公里），默认3km' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('radiusKm')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", void 0)
], TrailsController.prototype, "findPlacesAlong", null);
__decorate([
    (0, common_1.Get)(':id/split-segments'),
    (0, swagger_1.ApiOperation)({
        summary: '拆分长徒步路线为多个分段',
        description: '将长路线拆分成适合单日游玩的分段行程'
    }),
    (0, swagger_1.ApiQuery)({ name: 'maxSegmentLengthKm', required: false, description: '每段最大长度（公里）' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('maxSegmentLengthKm')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String]),
    __metadata("design:returntype", void 0)
], TrailsController.prototype, "splitIntoSegments", null);
__decorate([
    (0, common_1.Get)(':id/support-services'),
    (0, swagger_1.ApiOperation)({
        summary: '推荐徒步路线配套服务',
        description: '根据路线难度和特点推荐装备、保险、补给点、应急服务等'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '推荐成功' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], TrailsController.prototype, "getSupportServices", null);
__decorate([
    (0, common_1.Post)(':id/check-suitability'),
    (0, swagger_1.ApiOperation)({
        summary: '检查Trail是否适合用户的体力配置',
        description: '根据用户的体力配置（PacingConfig）检查Trail是否适合'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '检查成功' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], TrailsController.prototype, "checkSuitability", null);
__decorate([
    (0, common_1.Post)('smart-plan'),
    (0, swagger_1.ApiOperation)({
        summary: '智能路线规划',
        description: '根据用户体力和偏好，自动规划最优的景点+轨迹组合。系统会自动评估每个Trail的适合性，根据体力限制自动拆分到多天，优先推荐匹配度高且适合用户体力的路线。'
    }),
    (0, swagger_1.ApiBody)({
        description: '智能路线规划请求',
        schema: {
            type: 'object',
            required: ['placeIds', 'pacingConfig'],
            properties: {
                placeIds: {
                    type: 'array',
                    items: { type: 'number' },
                    description: '目标景点ID列表',
                    example: [1, 2, 3],
                },
                pacingConfig: {
                    type: 'object',
                    required: ['max_daily_hp', 'walk_speed_factor'],
                    properties: {
                        max_daily_hp: { type: 'number', description: '每日最大HP上限', example: 100 },
                        walk_speed_factor: { type: 'number', description: '步行速度系数（1.0=标准）', example: 1.0 },
                        terrain_filter: { type: 'string', description: '地形限制', example: 'ALL' },
                    },
                },
                preferences: {
                    type: 'object',
                    properties: {
                        maxTotalDistanceKm: { type: 'number', description: '最大总距离（公里）', example: 30 },
                        maxSegmentDistanceKm: { type: 'number', description: '最大单段距离（公里）', example: 15 },
                        preferredDifficulty: { type: 'string', description: '优先难度等级', example: 'MODERATE' },
                        preferOffRoad: { type: 'boolean', description: '是否优先非公路步道', example: true },
                        allowSplit: { type: 'boolean', description: '是否允许拆分长路线', example: true },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '规划成功，返回推荐的Trail组合、总体评估和建议的行程安排' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrailsController.prototype, "smartPlan", null);
__decorate([
    (0, common_1.Post)('tracking/start'),
    (0, swagger_1.ApiOperation)({
        summary: '开始实时轨迹追踪',
        description: '开始追踪用户位置，与计划轨迹对比。返回sessionId用于后续添加追踪点和结束追踪。'
    }),
    (0, swagger_1.ApiBody)({
        description: '开始追踪请求',
        schema: {
            type: 'object',
            required: ['trailId'],
            properties: {
                trailId: { type: 'number', description: 'Trail ID', example: 1 },
                itineraryItemId: { type: 'string', description: '关联的行程项ID（可选）', example: 'xxx' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '追踪开始，返回sessionId' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TrailsController.prototype, "startTracking", null);
__decorate([
    (0, common_1.Post)('tracking/:sessionId/point'),
    (0, swagger_1.ApiOperation)({
        summary: '添加追踪点',
        description: '添加当前位置点，返回与计划轨迹的偏差（米）。系统会自动更新统计信息（总距离、爬升、速度等）。'
    }),
    (0, swagger_1.ApiParam)({ name: 'sessionId', description: '追踪会话ID', example: 'track_1234567890_abc123' }),
    (0, swagger_1.ApiBody)({
        description: '追踪点数据',
        schema: {
            type: 'object',
            required: ['latitude', 'longitude'],
            properties: {
                latitude: { type: 'number', description: '纬度', example: 27.5 },
                longitude: { type: 'number', description: '经度', example: 114.2 },
                elevation: { type: 'number', description: '海拔（米，可选）', example: 1200 },
                accuracy: { type: 'number', description: '精度（米，可选）', example: 10 },
                speed: { type: 'number', description: '速度（米/秒，可选）', example: 1.2 },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '添加成功，返回偏差距离（米）' }),
    __param(0, (0, common_1.Param)('sessionId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TrailsController.prototype, "addTrackingPoint", null);
__decorate([
    (0, common_1.Post)('tracking/:sessionId/stop'),
    (0, swagger_1.ApiOperation)({
        summary: '结束追踪',
        description: '结束追踪会话，返回完整统计信息（总距离、爬升、平均速度、最大速度、持续时间等）'
    }),
    (0, swagger_1.ApiParam)({ name: 'sessionId', description: '追踪会话ID', example: 'track_1234567890_abc123' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '追踪结束，返回完整统计信息' }),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrailsController.prototype, "stopTracking", null);
__decorate([
    (0, common_1.Get)('tracking/:sessionId'),
    (0, swagger_1.ApiOperation)({
        summary: '获取追踪会话',
        description: '获取当前追踪会话的状态和统计信息（包括所有轨迹点、实时统计等）'
    }),
    (0, swagger_1.ApiParam)({ name: 'sessionId', description: '追踪会话ID', example: 'track_1234567890_abc123' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '追踪会话不存在' }),
    __param(0, (0, common_1.Param)('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TrailsController.prototype, "getTrackingSession", null);
exports.TrailsController = TrailsController = __decorate([
    (0, swagger_1.ApiTags)('徒步路线'),
    (0, common_1.Controller)('trails'),
    __metadata("design:paramtypes", [trails_service_1.TrailsService,
        trail_support_services_service_1.TrailSupportServicesService,
        smart_trail_planner_service_1.SmartTrailPlannerService,
        trail_tracking_service_1.TrailTrackingService])
], TrailsController);
//# sourceMappingURL=trails.controller.js.map
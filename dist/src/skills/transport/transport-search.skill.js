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
var TransportSearchSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransportSearchSkill = void 0;
const common_1 = require("@nestjs/common");
const transport_routing_service_1 = require("../../transport/transport-routing.service");
const entity_resolution_service_1 = require("../../places/services/entity-resolution.service");
const skill_decorator_1 = require("../decorators/skill.decorator");
let TransportSearchSkill = TransportSearchSkill_1 = class TransportSearchSkill {
    constructor(transportRoutingService, entityResolutionService) {
        this.transportRoutingService = transportRoutingService;
        this.entityResolutionService = entityResolutionService;
        this.logger = new common_1.Logger(TransportSearchSkill_1.name);
        this.metadata = {
            name: 'transport.search',
            description: '搜索两点之间的交通路线',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
            inputSchema: {
                required: ['origin', 'destination'],
            },
        };
        this.logger.log(`[TransportSearchSkill] 已初始化`);
    }
    async execute(input) {
        this.logger.debug(`执行 transport.search: origin=${typeof input.origin === 'string' ? input.origin : `${input.origin.lat},${input.origin.lng}`}, destination=${typeof input.destination === 'string' ? input.destination : `${input.destination.lat},${input.destination.lng}`}`);
        try {
            if (!this.transportRoutingService) {
                throw new Error('TransportRoutingService 未注入');
            }
            let originLat;
            let originLng;
            let destLat;
            let destLng;
            if (typeof input.origin === 'string') {
                if (!this.entityResolutionService) {
                    throw new Error('transport.search 需要 EntityResolutionService 来解析字符串地址，但服务未注入。请使用坐标格式或确保 EntityResolutionService 已配置。');
                }
                try {
                    const originResult = await this.entityResolutionService.resolveEntities(input.origin, [], undefined, undefined, 1);
                    if (!originResult.results ||
                        originResult.results.length === 0 ||
                        !originResult.results[0].lat ||
                        !originResult.results[0].lng) {
                        throw new Error(`无法解析起点地址: "${input.origin}"。请提供更详细的地址信息或使用坐标格式。`);
                    }
                    originLat = originResult.results[0].lat;
                    originLng = originResult.results[0].lng;
                    this.logger.debug(`地理编码起点: "${input.origin}" -> (${originLat}, ${originLng})`);
                }
                catch (error) {
                    this.logger.error(`地理编码起点失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
                    throw new Error(`无法解析起点地址: "${input.origin}"。错误: ${error === null || error === void 0 ? void 0 : error.message}`);
                }
            }
            else {
                originLat = input.origin.lat;
                originLng = input.origin.lng;
            }
            if (typeof input.destination === 'string') {
                if (!this.entityResolutionService) {
                    throw new Error('transport.search 需要 EntityResolutionService 来解析字符串地址，但服务未注入。请使用坐标格式或确保 EntityResolutionService 已配置。');
                }
                try {
                    const destResult = await this.entityResolutionService.resolveEntities(input.destination, [], undefined, undefined, 1);
                    if (!destResult.results ||
                        destResult.results.length === 0 ||
                        !destResult.results[0].lat ||
                        !destResult.results[0].lng) {
                        throw new Error(`无法解析终点地址: "${input.destination}"。请提供更详细的地址信息或使用坐标格式。`);
                    }
                    destLat = destResult.results[0].lat;
                    destLng = destResult.results[0].lng;
                    this.logger.debug(`地理编码终点: "${input.destination}" -> (${destLat}, ${destLng})`);
                }
                catch (error) {
                    this.logger.error(`地理编码终点失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
                    throw new Error(`无法解析终点地址: "${input.destination}"。错误: ${error === null || error === void 0 ? void 0 : error.message}`);
                }
            }
            else {
                destLat = input.destination.lat;
                destLng = input.destination.lng;
            }
            const recommendation = await this.transportRoutingService.planRoute(originLat, originLng, destLat, destLng, {
                budgetSensitivity: 'MEDIUM',
                timeSensitivity: 'MEDIUM',
                hasLuggage: false,
                hasElderly: false,
                isMovingDay: false,
                isRaining: false,
                hasLimitedMobility: false,
            });
            const options = recommendation.options.map(opt => ({
                mode: opt.mode,
                duration_minutes: opt.durationMinutes,
                distance_meters: opt.distanceMeters || opt.distance_meters || opt.walkDistance || 0,
                steps: opt.steps || [],
            }));
            return {
                evidence_id: `transport_${Date.now()}_${originLat}_${originLng}_${destLat}_${destLng}`,
                origin: input.origin,
                destination: input.destination,
                options,
                best_option: options[0],
            };
        }
        catch (error) {
            this.logger.error(`transport.search 失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
};
exports.TransportSearchSkill = TransportSearchSkill;
exports.TransportSearchSkill = TransportSearchSkill = TransportSearchSkill_1 = __decorate([
    (0, skill_decorator_1.Skill)({
        name: 'transport.search',
        description: '搜索两点之间的交通路线',
        version: '1.0.0',
        category: 'trip',
        toolGroup: 'DOMAIN',
    }),
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [transport_routing_service_1.TransportRoutingService,
        entity_resolution_service_1.EntityResolutionService])
], TransportSearchSkill);
//# sourceMappingURL=transport-search.skill.js.map
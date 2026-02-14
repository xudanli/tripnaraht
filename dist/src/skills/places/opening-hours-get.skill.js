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
var OpeningHoursGetSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpeningHoursGetSkill = void 0;
const common_1 = require("@nestjs/common");
const places_service_1 = require("../../places/places.service");
const skill_decorator_1 = require("../decorators/skill.decorator");
let OpeningHoursGetSkill = OpeningHoursGetSkill_1 = class OpeningHoursGetSkill {
    constructor(placesService) {
        this.placesService = placesService;
        this.logger = new common_1.Logger(OpeningHoursGetSkill_1.name);
        this.metadata = {
            name: 'opening_hours.get',
            description: '获取 POI 的开放时间',
            version: '1.0.0',
            category: 'trip',
            toolGroup: 'DOMAIN',
            inputSchema: {
                required: ['poi_ids'],
            },
        };
        this.logger.log(`[OpeningHoursGetSkill] 已初始化`);
    }
    async execute(input) {
        this.logger.debug(`执行 opening_hours.get: poi_ids=${input.poi_ids.join(', ')}`);
        try {
            if (!this.placesService) {
                throw new Error('PlacesService 未注入');
            }
            const placesService = this.placesService;
            const results = await Promise.allSettled(input.poi_ids.map(async (poiId) => {
                var _a, _b, _c, _d;
                try {
                    const placeIdNum = parseInt(poiId, 10);
                    let openingHours = null;
                    let isOpenNow = false;
                    if (!isNaN(placeIdNum)) {
                        try {
                            const place = await placesService.findOne(placeIdNum);
                            if (place) {
                                const metadata = place.metadata || {};
                                openingHours = metadata.openingHours || metadata.opening_hours;
                                isOpenNow = (_b = (_a = place.status) === null || _a === void 0 ? void 0 : _a.isOpen) !== null && _b !== void 0 ? _b : false;
                            }
                            else {
                                try {
                                    await placesService.enrichPlaceFromAmap(placeIdNum);
                                    const updatedPlace = await placesService.findOne(placeIdNum);
                                    if (updatedPlace) {
                                        const metadata = updatedPlace.metadata || {};
                                        openingHours = metadata.openingHours || metadata.opening_hours;
                                        isOpenNow = (_d = (_c = updatedPlace.status) === null || _c === void 0 ? void 0 : _c.isOpen) !== null && _d !== void 0 ? _d : false;
                                    }
                                }
                                catch (enrichError) {
                                    this.logger.warn(`无法通过 enrichPlaceFromAmap 获取地点 ${poiId} 的详细信息: ${enrichError === null || enrichError === void 0 ? void 0 : enrichError.message}`);
                                }
                            }
                        }
                        catch (error) {
                            this.logger.warn(`无法获取地点 ${poiId} 的详细信息: ${error === null || error === void 0 ? void 0 : error.message}`);
                        }
                    }
                    return {
                        poi_id: poiId,
                        opening_hours: openingHours,
                        is_open_now: isOpenNow,
                        evidence_id: `opening_hours_${poiId}_${Date.now()}`,
                    };
                }
                catch (error) {
                    this.logger.warn(`获取 POI ${poiId} 的开放时间失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                    return {
                        poi_id: poiId,
                        opening_hours: undefined,
                        is_open_now: undefined,
                        evidence_id: `opening_hours_${poiId}_error`,
                    };
                }
            }));
            const opening_hours = results.map((result, index) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                }
                else {
                    return {
                        poi_id: input.poi_ids[index],
                        opening_hours: undefined,
                        is_open_now: undefined,
                        evidence_id: `opening_hours_${input.poi_ids[index]}_error`,
                    };
                }
            });
            return {
                opening_hours,
            };
        }
        catch (error) {
            this.logger.error(`opening_hours.get 失败: ${error === null || error === void 0 ? void 0 : error.message}`, error === null || error === void 0 ? void 0 : error.stack);
            throw error;
        }
    }
};
exports.OpeningHoursGetSkill = OpeningHoursGetSkill;
exports.OpeningHoursGetSkill = OpeningHoursGetSkill = OpeningHoursGetSkill_1 = __decorate([
    (0, skill_decorator_1.Skill)({
        name: 'opening_hours.get',
        description: '获取 POI 的开放时间',
        version: '1.0.0',
        category: 'trip',
        toolGroup: 'DOMAIN',
    }),
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [places_service_1.PlacesService])
], OpeningHoursGetSkill);
//# sourceMappingURL=opening-hours-get.skill.js.map
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
var RouteOptimizationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteOptimizationService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const itinerary_verify_skill_1 = require("../../../../skills/itinerary/itinerary-verify.skill");
const transport_search_skill_1 = require("../../../../skills/transport/transport-search.skill");
const opening_hours_get_skill_1 = require("../../../../skills/places/opening-hours-get.skill");
const dem_get_profile_skill_1 = require("../../../../skills/dem/dem-get-profile.skill");
const geo_check_hazard_zones_skill_1 = require("../../../../skills/geo/geo-check-hazard-zones.skill");
let RouteOptimizationService = RouteOptimizationService_1 = class RouteOptimizationService {
    constructor(itineraryVerifySkill, transportSearchSkill, openingHoursSkill, demGetProfileSkill, geoCheckHazardZonesSkill) {
        this.itineraryVerifySkill = itineraryVerifySkill;
        this.transportSearchSkill = transportSearchSkill;
        this.openingHoursSkill = openingHoursSkill;
        this.demGetProfileSkill = demGetProfileSkill;
        this.geoCheckHazardZonesSkill = geoCheckHazardZonesSkill;
        this.logger = new common_1.Logger(RouteOptimizationService_1.name);
        this.CITY_COORDINATES = {
            '北京': { lat: 39.9042, lng: 116.4074 },
            '上海': { lat: 31.2304, lng: 121.4737 },
            '广州': { lat: 23.1291, lng: 113.2644 },
            '深圳': { lat: 22.5431, lng: 114.0579 },
            '杭州': { lat: 30.2741, lng: 120.1551 },
            '南京': { lat: 32.0603, lng: 118.7969 },
            '苏州': { lat: 31.2989, lng: 120.5853 },
            '成都': { lat: 30.5728, lng: 104.0668 },
            '重庆': { lat: 29.4316, lng: 106.9123 },
            '武汉': { lat: 30.5928, lng: 114.3055 },
            '西安': { lat: 34.3416, lng: 108.9398 },
            '天津': { lat: 39.3434, lng: 117.3616 },
            '东京': { lat: 35.6762, lng: 139.6503 },
            '大阪': { lat: 34.6937, lng: 135.5023 },
            '京都': { lat: 35.0116, lng: 135.7681 },
        };
        this.LANDMARK_CITY_MAP = {
            '故宫': '北京', '天安门': '北京', '长城': '北京', '颐和园': '北京',
            '外滩': '上海', '东方明珠': '上海', '豫园': '上海',
            '西湖': '杭州', '灵隐寺': '杭州', '雷峰塔': '杭州', '梦想小镇': '杭州',
            '夫子庙': '南京', '中山陵': '南京',
            '东京塔': '东京', '浅草寺': '东京', '秋叶原': '东京',
            '大阪城': '大阪', '道顿堀': '大阪',
            '清水寺': '京都', '伏见稻荷': '京都', '金阁寺': '京都',
        };
        this.logger.log('[RouteOptimizationService] 初始化完成');
        this.logger.debug(`Skills 注入状态: ItineraryVerify=${!!itineraryVerifySkill}, TransportSearch=${!!transportSearchSkill}, OpeningHours=${!!openingHoursSkill}, DemGetProfile=${!!demGetProfileSkill}, GeoCheckHazardZones=${!!geoCheckHazardZonesSkill}`);
    }
    async optimizeRoute(ctx, request) {
        const startTime = Date.now();
        const evidenceId = `route_evidence_${(0, uuid_1.v4)().slice(0, 8)}`;
        this.logger.debug(`[路线优化] 开始优化: tripId=${ctx.tripId}`);
        this.currentContext = ctx;
        this.currentRequest = request;
        let demData;
        if (this.demGetProfileSkill) {
            try {
                const polyline = this.extractPolylineFromContext(ctx);
                if (polyline.length >= 2) {
                    demData = await this.demGetProfileSkill.execute({
                        polyline,
                        samples: 100,
                    });
                    this.logger.debug(`[路线优化] DEM 数据获取成功: 累计爬升=${demData.cumulativeAscent}m, 最大坡度=${demData.maxSlope}%`);
                }
            }
            catch (error) {
                this.logger.warn(`[路线优化] DEM 数据获取失败: ${error}`);
            }
        }
        const hardGates = await this.evaluateHardGates(ctx);
        const softScores = this.calculateSoftScores(ctx, demData);
        const keyFeatures = this.extractKeyFeatures(ctx, hardGates);
        let rawVerification;
        if (this.itineraryVerifySkill) {
            try {
                const itinerary = this.convertToItinerary(ctx);
                const verifyResult = await this.itineraryVerifySkill.execute({
                    itinerary,
                    research_data: {},
                });
                rawVerification = {
                    verified: verifyResult.verified,
                    issues: verifyResult.issues,
                    summary: verifyResult.summary,
                };
                this.mergeVerificationIssues(hardGates, verifyResult, ctx);
            }
            catch (error) {
                this.logger.warn(`[路线优化] itinerary.verify 调用失败: ${error}`);
            }
        }
        const deduplicatedGates = this.deduplicateHardGates(hardGates);
        let candidateRoutes;
        if (request === null || request === void 0 ? void 0 : request.generate_candidate_routes) {
            candidateRoutes = await this.generateCandidateRoutes(ctx, request, demData);
        }
        const alternatives = (request === null || request === void 0 ? void 0 : request.generate_alternatives) !== false
            ? this.generateAlternatives(ctx, deduplicatedGates, softScores)
            : [];
        const conclusion = this.generateConclusion(deduplicatedGates, softScores, keyFeatures.night_segments);
        const nextSteps = this.determineNextSteps(conclusion, alternatives, keyFeatures.night_segments);
        const processingTime = Date.now() - startTime;
        const evidence = {
            evidence_id: evidenceId,
            generated_at: new Date().toISOString(),
            trip_id: ctx.tripId,
            conclusion,
            hard_gates: deduplicatedGates,
            soft_scores: softScores,
            key_features: keyFeatures,
            alternatives,
            candidate_routes: candidateRoutes,
            data_timestamps: this.generateDataTimestamps(),
            next_steps: nextSteps,
            raw_verification: rawVerification,
        };
        this.trackMetrics(evidence, processingTime);
        this.logger.debug(`[路线优化] 完成: evidenceId=${evidenceId}, approved=${conclusion.route_approved}`);
        this.currentContext = undefined;
        this.currentRequest = undefined;
        return evidence;
    }
    async evaluateHardGates(ctx) {
        const results = [];
        for (const day of ctx.days) {
            const timeConflicts = this.detectTimeConflicts(day);
            results.push(...timeConflicts);
            const geoIssues = this.detectGeoImpossible(day, ctx);
            results.push(...geoIssues);
            const transferIssues = this.detectTransferBufferIssues(day);
            results.push(...transferIssues);
            const transportIssues = await this.verifyTransportReachability(day);
            results.push(...transportIssues);
            const openingHoursIssues = await this.verifyOpeningHours(day);
            results.push(...openingHoursIssues);
        }
        const safetyIssues = await this.checkSafetyHazards(ctx);
        results.push(...safetyIssues);
        const missingData = this.detectMissingData(ctx);
        results.push(...missingData);
        return results;
    }
    async verifyTransportReachability(day) {
        const results = [];
        if (!this.transportSearchSkill) {
            this.logger.debug('[路线优化] TransportSearchSkill 未注入，跳过可达性验证');
            return results;
        }
        const itemsWithLocation = day.items.filter(item => item.location).sort((a, b) => {
            return this.parseTimeToMinutes(a.startTime || '00:00') - this.parseTimeToMinutes(b.startTime || '00:00');
        });
        if (itemsWithLocation.length < 2) {
            return results;
        }
        for (let i = 0; i < itemsWithLocation.length - 1; i++) {
            const current = itemsWithLocation[i];
            const next = itemsWithLocation[i + 1];
            if (!current.location || !next.location)
                continue;
            try {
                const transportResult = await this.transportSearchSkill.execute({
                    origin: { lat: current.location.lat, lng: current.location.lng },
                    destination: { lat: next.location.lat, lng: next.location.lng },
                    mode: 'mixed',
                });
                const nameCurrent = this.getItemName(current);
                const nameNext = this.getItemName(next);
                const itemIdCurrent = current.itemId || '';
                const itemIdNext = next.itemId || '';
                if (!transportResult.options || transportResult.options.length === 0) {
                    results.push({
                        rule: 'REACHABILITY',
                        result: 'FAIL',
                        severity: 'ERROR',
                        detail: `第${day.dayNumber}天「${nameCurrent}」→「${nameNext}」无可用交通方式`,
                        suggestion: '请检查两个地点之间是否有公共交通或其他交通方式',
                        day: day.dayNumber,
                        item_id: itemIdNext,
                        affected_items: [itemIdCurrent, itemIdNext].filter(id => id),
                        evidence_ref: transportResult.evidence_id,
                    });
                }
                else {
                    const bestOption = transportResult.best_option;
                    if (bestOption) {
                        const currentEndTime = current.endTime
                            ? this.parseTimeToMinutes(current.endTime)
                            : this.parseTimeToMinutes(current.startTime || '00:00') + (current.duration || 60);
                        const nextStartTime = this.parseTimeToMinutes(next.startTime || '00:00');
                        const availableGap = nextStartTime - currentEndTime;
                        if (bestOption.duration_minutes > availableGap) {
                            results.push({
                                rule: 'TRANSFER_BUFFER',
                                result: availableGap < bestOption.duration_minutes * 0.8 ? 'FAIL' : 'PASS',
                                severity: availableGap < bestOption.duration_minutes * 0.5 ? 'ERROR' : 'WARNING',
                                detail: `第${day.dayNumber}天「${nameCurrent}」→「${nameNext}」：最快交通需要 ${bestOption.duration_minutes} 分钟（${bestOption.mode}），但只预留了 ${availableGap} 分钟`,
                                suggestion: `建议将「${nameNext}」推迟 ${bestOption.duration_minutes - availableGap + 15} 分钟开始`,
                                day: day.dayNumber,
                                item_id: itemIdNext,
                                affected_items: [itemIdCurrent, itemIdNext].filter(id => id),
                                evidence_ref: transportResult.evidence_id,
                            });
                        }
                        else {
                            this.logger.debug(`[路线优化] 第${day.dayNumber}天 ${nameCurrent} → ${nameNext} 可达，最快 ${bestOption.duration_minutes} 分钟（${bestOption.mode}）`);
                        }
                    }
                }
            }
            catch (error) {
                this.logger.warn(`[路线优化] 交通验证失败: ${error === null || error === void 0 ? void 0 : error.message}`);
                const nameCurrent = this.getItemName(current);
                const nameNext = this.getItemName(next);
                const itemIdCurrent = current.itemId || '';
                const itemIdNext = next.itemId || '';
                results.push({
                    rule: 'DATA_MISSING',
                    result: 'PASS',
                    severity: 'WARNING',
                    detail: `第${day.dayNumber}天「${nameCurrent}」→「${nameNext}」交通数据获取失败`,
                    suggestion: '建议手动确认交通方式',
                    day: day.dayNumber,
                    item_id: itemIdNext,
                    affected_items: [itemIdCurrent, itemIdNext].filter(id => id),
                });
            }
        }
        return results;
    }
    async verifyOpeningHours(day) {
        const results = [];
        if (!this.openingHoursSkill) {
            this.logger.debug('[路线优化] OpeningHoursGetSkill 未注入，跳过开放时间验证');
            return results;
        }
        const poiItems = day.items.filter(item => item.poiId);
        if (poiItems.length === 0) {
            return results;
        }
        try {
            const poiIds = poiItems.map(item => item.poiId);
            const openingHoursResult = await this.openingHoursSkill.execute({
                poi_ids: poiIds,
            });
            for (const item of poiItems) {
                const hoursInfo = openingHoursResult.opening_hours.find(h => h.poi_id === item.poiId);
                const itemName = this.getItemName(item);
                const itemId = item.itemId || '';
                if (!hoursInfo || !hoursInfo.opening_hours) {
                    results.push({
                        rule: 'OPENING_HOURS',
                        result: 'PASS',
                        severity: 'WARNING',
                        detail: `第${day.dayNumber}天「${itemName}」缺少开放时间数据`,
                        suggestion: '请确认该地点在计划时间是否开放',
                        day: day.dayNumber,
                        item_id: itemId,
                        affected_items: itemId ? [itemId] : undefined,
                    });
                    continue;
                }
                if (hoursInfo.is_open_now === false) {
                    this.logger.debug(`[路线优化] 第${day.dayNumber}天「${itemName}」当前可能未营业`);
                }
                if (typeof hoursInfo.opening_hours === 'string') {
                    const plannedTime = item.startTime;
                    if (plannedTime) {
                        const hoursStr = hoursInfo.opening_hours.toLowerCase();
                        if (hoursStr.includes('休息') || hoursStr.includes('关闭') || hoursStr.includes('closed')) {
                            results.push({
                                rule: 'OPENING_HOURS',
                                result: 'FAIL',
                                severity: 'ERROR',
                                detail: `第${day.dayNumber}天「${itemName}」在 ${day.date} 可能不开放`,
                                suggestion: `开放时间：${hoursInfo.opening_hours}`,
                                day: day.dayNumber,
                                item_id: itemId,
                                affected_items: itemId ? [itemId] : undefined,
                                evidence_ref: hoursInfo.evidence_id,
                            });
                        }
                    }
                }
            }
        }
        catch (error) {
            this.logger.warn(`[路线优化] 开放时间验证失败: ${error === null || error === void 0 ? void 0 : error.message}`);
        }
        return results;
    }
    detectTimeConflicts(day) {
        const results = [];
        const items = day.items.filter(item => item.startTime).sort((a, b) => {
            return this.parseTimeToMinutes(a.startTime) - this.parseTimeToMinutes(b.startTime);
        });
        for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
                const itemA = items[i];
                const itemB = items[j];
                const startA = this.parseTimeToMinutes(itemA.startTime);
                const endA = itemA.endTime
                    ? this.parseTimeToMinutes(itemA.endTime)
                    : startA + (itemA.duration || 60);
                const startB = this.parseTimeToMinutes(itemB.startTime);
                const endB = itemB.endTime
                    ? this.parseTimeToMinutes(itemB.endTime)
                    : startB + (itemB.duration || 60);
                if (!(endA <= startB || endB <= startA)) {
                    const overlapMinutes = Math.min(endA, endB) - Math.max(startA, startB);
                    const nameA = this.getItemName(itemA);
                    const nameB = this.getItemName(itemB);
                    const itemIdA = itemA.itemId || '';
                    const itemIdB = itemB.itemId || '';
                    results.push({
                        rule: 'TIME_CONFLICT',
                        result: 'FAIL',
                        severity: 'ERROR',
                        detail: `第${day.dayNumber}天「${nameA}」与「${nameB}」时间重叠 ${overlapMinutes} 分钟`,
                        suggestion: `建议调整其中一个活动的时间，或移除冲突的活动`,
                        day: day.dayNumber,
                        item_id: itemIdA,
                        affected_items: [itemIdA, itemIdB].filter(id => id),
                    });
                }
            }
        }
        return results;
    }
    detectGeoImpossible(day, ctx) {
        var _a;
        const results = [];
        const citiesInDay = new Map();
        for (const item of day.items) {
            const city = this.detectCityForItem(item);
            if (city) {
                if (!citiesInDay.has(city)) {
                    citiesInDay.set(city, []);
                }
                citiesInDay.get(city).push(this.getItemName(item));
            }
        }
        const cities = Array.from(citiesInDay.keys());
        const mainCity = (_a = (ctx.destinationName || ctx.destination || '').match(/(北京|上海|广州|深圳|杭州|南京|苏州|成都|重庆|武汉|西安|天津|东京|大阪|京都)/)) === null || _a === void 0 ? void 0 : _a[1];
        for (let i = 0; i < cities.length; i++) {
            for (let j = i + 1; j < cities.length; j++) {
                const city1 = cities[i];
                const city2 = cities[j];
                const distance = this.calculateCityDistance(city1, city2);
                if (distance > 500) {
                    const severity = distance > 1000 ? 'ERROR' : 'WARNING';
                    const wrongCity = mainCity && city1 !== mainCity ? city1 : city2;
                    const wrongItems = citiesInDay.get(wrongCity) || [];
                    const wrongItemIds = [];
                    for (const item of day.items) {
                        const itemCity = this.detectCityForItem(item);
                        if (itemCity === wrongCity) {
                            if (item.itemId) {
                                wrongItemIds.push(item.itemId);
                            }
                        }
                    }
                    results.push({
                        rule: 'GEO_IMPOSSIBLE',
                        result: distance > 1000 ? 'FAIL' : 'PASS',
                        severity,
                        detail: `第${day.dayNumber}天同时包含 ${city1} 和 ${city2} 的景点，相距约 ${Math.round(distance)} 公里`,
                        suggestion: distance > 1000
                            ? `建议立即删除「${wrongItems.join('、')}」，这是${wrongCity}的景点，无法在同一天完成`
                            : `建议将不同城市的景点安排到不同天`,
                        day: day.dayNumber,
                        item_id: wrongItemIds[0] || undefined,
                        affected_items: wrongItemIds,
                    });
                }
            }
        }
        return results;
    }
    detectTransferBufferIssues(day) {
        const results = [];
        const items = day.items.filter(item => item.startTime && item.location).sort((a, b) => {
            return this.parseTimeToMinutes(a.startTime) - this.parseTimeToMinutes(b.startTime);
        });
        for (let i = 0; i < items.length - 1; i++) {
            const current = items[i];
            const next = items[i + 1];
            if (current.location && next.location) {
                const distance = this.calculateDistance(current.location.lat, current.location.lng, next.location.lat, next.location.lng);
                const estimatedTravelTime = Math.max(15, distance * 1.5);
                const currentEndTime = current.endTime
                    ? this.parseTimeToMinutes(current.endTime)
                    : this.parseTimeToMinutes(current.startTime) + (current.duration || 60);
                const nextStartTime = this.parseTimeToMinutes(next.startTime);
                const gap = nextStartTime - currentEndTime;
                if (gap < estimatedTravelTime && distance > 5) {
                    const nameCurrent = this.getItemName(current);
                    const nameNext = this.getItemName(next);
                    const itemIdCurrent = current.itemId || '';
                    const itemIdNext = next.itemId || '';
                    results.push({
                        rule: 'TRANSFER_BUFFER',
                        result: gap < 15 ? 'FAIL' : 'PASS',
                        severity: gap < 15 ? 'ERROR' : 'WARNING',
                        detail: `第${day.dayNumber}天「${nameCurrent}」到「${nameNext}」距离 ${Math.round(distance)}km，但只预留了 ${gap} 分钟`,
                        suggestion: `建议至少预留 ${Math.round(estimatedTravelTime)} 分钟的交通时间`,
                        day: day.dayNumber,
                        item_id: itemIdNext,
                        affected_items: [itemIdCurrent, itemIdNext].filter(id => id),
                    });
                }
            }
        }
        return results;
    }
    translateFieldName(field) {
        const fieldNameMap = {
            'items.location': '活动地点',
            'items.startTime': '开始时间',
            'items.endTime': '结束时间',
            'date': '日期',
            'destination': '目的地',
            'startDate': '出发日期',
            'endDate': '结束日期',
            'days': '行程天数',
        };
        const dayMatch = field.match(/^day(\d+)\./);
        const dayPrefix = dayMatch ? `第${dayMatch[1]}天的` : '';
        const fieldName = field.replace(/^day\d+\./, '');
        const translation = fieldNameMap[fieldName];
        if (translation)
            return `${dayPrefix}${translation}`;
        if (fieldName.includes('location'))
            return `${dayPrefix}地点信息`;
        if (fieldName.includes('time') || fieldName.includes('Time'))
            return `${dayPrefix}时间信息`;
        return field;
    }
    translateFieldNames(fields) {
        return fields.map(f => this.translateFieldName(f)).join('、');
    }
    detectMissingData(ctx) {
        const results = [];
        const criticalFields = [];
        const partialFields = [];
        if (!ctx.startDate)
            criticalFields.push('startDate');
        if (!ctx.endDate)
            criticalFields.push('endDate');
        if (!ctx.destination && !ctx.destinationName)
            criticalFields.push('destination');
        if (!ctx.days || ctx.days.length === 0)
            criticalFields.push('days');
        for (const day of ctx.days) {
            if (!day.date) {
                partialFields.push(`day${day.dayNumber}.date`);
            }
            const itemsWithoutTime = day.items.filter(item => !item.startTime);
            if (itemsWithoutTime.length > day.items.length * 0.5) {
                partialFields.push(`day${day.dayNumber}.items.startTime`);
            }
            const itemsWithoutLocation = day.items.filter(item => !item.location);
            if (itemsWithoutLocation.length > day.items.length * 0.7) {
                partialFields.push(`day${day.dayNumber}.items.location`);
            }
        }
        if (criticalFields.length > 0) {
            results.push({
                rule: 'DATA_MISSING',
                result: 'FAIL',
                severity: 'ERROR',
                detail: `缺少关键数据，无法生成可靠路线: ${this.translateFieldNames(criticalFields)}`,
                suggestion: '请补充完整的行程数据（起始日期、结束日期、目的地）',
            });
        }
        if (partialFields.length > 0 && criticalFields.length === 0) {
            results.push({
                rule: 'DATA_MISSING',
                result: 'PASS',
                severity: 'WARNING',
                detail: `部分数据不完整（${this.translateFieldNames(partialFields)}），建议补充后获得更准确的优化`,
                suggestion: '补充完整的地点和时间信息可以获得更精准的路线优化建议',
            });
        }
        const qualityScore = this.calculateDataQualityScore(ctx, criticalFields, partialFields);
        if (qualityScore < 0.5 && criticalFields.length === 0) {
            results.push({
                rule: 'DATA_MISSING',
                result: 'PASS',
                severity: 'WARNING',
                detail: `数据质量较低（质量分数: ${(qualityScore * 100).toFixed(0)}%），建议补充数据`,
                suggestion: '建议补充完整的行程数据以获得更准确的优化建议',
            });
        }
        return results;
    }
    calculateDataQualityScore(ctx, criticalFields, partialFields) {
        let score = 1.0;
        if (criticalFields.length > 0) {
            return 0;
        }
        const totalFields = ctx.days.length * 3;
        const missingRatio = partialFields.length / Math.max(totalFields, 1);
        score -= missingRatio * 0.5;
        let totalItems = 0;
        let itemsWithCompleteData = 0;
        for (const day of ctx.days) {
            for (const item of day.items) {
                totalItems++;
                if (item.startTime && item.location && item.name) {
                    itemsWithCompleteData++;
                }
            }
        }
        if (totalItems > 0) {
            const completenessRatio = itemsWithCompleteData / totalItems;
            score = score * 0.5 + completenessRatio * 0.5;
        }
        return Math.max(0, Math.min(1, score));
    }
    calculateSoftScores(ctx, demData) {
        const fatigueScore = this.calculateFatigueScore(ctx, demData);
        const paceScore = this.calculatePaceScore(ctx);
        const experienceScore = this.calculateExperienceScore(ctx);
        const efficiencyScore = this.calculateEfficiencyScore(ctx);
        const weights = { fatigue: 0.3, pace: 0.25, experience: 0.25, efficiency: 0.2 };
        const overall = fatigueScore.score * weights.fatigue +
            paceScore.score * weights.pace +
            experienceScore.score * weights.experience +
            efficiencyScore.score * weights.efficiency;
        return {
            fatigue: fatigueScore,
            pace: paceScore,
            experience: experienceScore,
            efficiency: efficiencyScore,
            overall: Math.round(overall),
        };
    }
    calculateFatigueScore(ctx, demData) {
        let totalScore = 100;
        const issues = [];
        if (demData) {
            const fatigueFromDEM = this.calculateFatigueFromDEM(demData, ctx);
            totalScore = fatigueFromDEM.score;
            issues.push(...fatigueFromDEM.issues);
        }
        else {
            const fatigueFromDuration = this.calculateFatigueFromDuration(ctx);
            totalScore = fatigueFromDuration.score;
            issues.push(...fatigueFromDuration.issues);
        }
        return {
            dimension: 'FATIGUE',
            score: Math.max(0, Math.round(totalScore)),
            threshold: 70,
            exceeded: totalScore < 70,
            weight: 0.3,
            detail: issues.length > 0 ? issues.join('；') : '活动强度适中',
            suggestion: totalScore < 70 ? '建议减少每日活动数量或缩短活动时间，或选择更平缓的路线' : undefined,
        };
    }
    calculateFatigueFromDEM(demData, ctx) {
        const issues = [];
        let fatigueScore = 100;
        const cumulativeAscent = demData.cumulativeAscent || 0;
        const maxSlope = demData.maxSlope || 0;
        const fatigueIndex = demData.fatigueIndex || 0;
        const cumulativeAscentWeight = 0.4;
        const maxSlopeWeight = 0.3;
        const fatigueIndexWeight = 0.3;
        const normalizedAscent = Math.min(cumulativeAscent / 1000, 1);
        const ascentPenalty = normalizedAscent > 0.5
            ? (normalizedAscent - 0.5) * 2 * 30
            : 0;
        if (cumulativeAscent > 500) {
            issues.push(`累计爬升 ${cumulativeAscent.toFixed(0)}m`);
        }
        const normalizedSlope = Math.min(maxSlope / 15, 1);
        const slopePenalty = normalizedSlope > 0.67
            ? (normalizedSlope - 0.67) * 3 * 20
            : 0;
        if (maxSlope > 10) {
            issues.push(`最大坡度 ${maxSlope.toFixed(1)}%`);
        }
        const normalizedFatigue = Math.min(fatigueIndex / 70, 1);
        const fatiguePenalty = normalizedFatigue > 0.71
            ? (normalizedFatigue - 0.71) * 3.45 * 25
            : 0;
        if (fatigueIndex > 50) {
            issues.push(`疲劳指数 ${fatigueIndex.toFixed(0)}`);
        }
        const weightedFatiguePenalty = ascentPenalty * cumulativeAscentWeight +
            slopePenalty * maxSlopeWeight +
            fatiguePenalty * fatigueIndexWeight;
        fatigueScore = Math.max(0, 100 - weightedFatiguePenalty);
        const durationFatigue = this.calculateDurationFatigue(ctx);
        fatigueScore = Math.min(fatigueScore, durationFatigue.score);
        if (durationFatigue.issues.length > 0) {
            issues.push(...durationFatigue.issues);
        }
        return {
            score: fatigueScore,
            issues,
        };
    }
    calculateFatigueFromDuration(ctx) {
        const issues = [];
        let fatigueScore = 100;
        for (const day of ctx.days) {
            const totalDuration = day.items.reduce((sum, item) => sum + (item.duration || 60), 0);
            if (totalDuration > 600) {
                const penalty = Math.min(30, (totalDuration - 600) / 10);
                fatigueScore -= penalty;
                issues.push(`第${day.dayNumber}天活动时长 ${Math.round(totalDuration / 60)} 小时`);
            }
            if (day.items.length > 6) {
                const penalty = (day.items.length - 6) * 5;
                fatigueScore -= penalty;
                if (!issues.some(i => i.includes(`第${day.dayNumber}天`))) {
                    issues.push(`第${day.dayNumber}天活动数量 ${day.items.length} 个`);
                }
            }
        }
        return {
            score: Math.max(0, fatigueScore),
            issues,
        };
    }
    calculateDurationFatigue(ctx) {
        const issues = [];
        let fatigueScore = 100;
        for (const day of ctx.days) {
            const totalDuration = day.items.reduce((sum, item) => sum + (item.duration || 60), 0);
            if (totalDuration > 600) {
                const penalty = Math.min(30, (totalDuration - 600) / 10);
                fatigueScore -= penalty;
                issues.push(`第${day.dayNumber}天活动时长 ${Math.round(totalDuration / 60)} 小时`);
            }
            if (day.items.length > 6) {
                const penalty = (day.items.length - 6) * 5;
                fatigueScore -= penalty;
                if (!issues.some(i => i.includes(`第${day.dayNumber}天`))) {
                    issues.push(`第${day.dayNumber}天活动数量 ${day.items.length} 个`);
                }
            }
        }
        return {
            score: Math.max(0, fatigueScore),
            issues,
        };
    }
    calculatePaceScore(ctx) {
        let score = 100;
        const issues = [];
        for (const day of ctx.days) {
            const morningItems = day.items.filter(item => {
                const time = this.parseTimeToMinutes(item.startTime || '12:00');
                return time < 720;
            });
            const afternoonItems = day.items.filter(item => {
                const time = this.parseTimeToMinutes(item.startTime || '12:00');
                return time >= 720 && time < 1080;
            });
            if (morningItems.length === 0 && day.items.length > 2) {
                score -= 10;
            }
            if (afternoonItems.length === 0 && day.items.length > 2) {
                score -= 10;
            }
            const hasMeal = day.items.some(item => {
                var _a, _b;
                return item.type === 'RESTAURANT' ||
                    ((_a = item.name) === null || _a === void 0 ? void 0 : _a.includes('餐')) ||
                    ((_b = item.name) === null || _b === void 0 ? void 0 : _b.includes('食'));
            });
            if (!hasMeal && day.items.length > 3) {
                score -= 15;
                issues.push(`第${day.dayNumber}天未安排用餐`);
            }
        }
        return {
            dimension: 'PACE',
            score: Math.max(0, score),
            threshold: 70,
            exceeded: score < 70,
            weight: 0.25,
            detail: issues.length > 0 ? issues.join('；') : '节奏安排合理',
            suggestion: score < 70 ? '建议添加用餐和休息时间，均匀分配活动' : undefined,
        };
    }
    calculateExperienceScore(ctx) {
        let score = 80;
        const avgActivities = ctx.days.reduce((sum, d) => sum + d.items.length, 0) / ctx.days.length;
        if (avgActivities >= 3 && avgActivities <= 5) {
            score += 10;
        }
        const daysWithTheme = ctx.days.filter(d => d.theme).length;
        score += daysWithTheme / ctx.days.length * 10;
        return {
            dimension: 'EXPERIENCE',
            score: Math.min(100, score),
            threshold: 70,
            exceeded: score < 70,
            weight: 0.25,
            detail: `平均每天 ${avgActivities.toFixed(1)} 个活动`,
        };
    }
    calculateEfficiencyScore(ctx) {
        const completeness = ctx.completeness || 0;
        return {
            dimension: 'EFFICIENCY',
            score: Math.round(completeness),
            threshold: 60,
            exceeded: completeness < 60,
            weight: 0.2,
            detail: `行程完成度 ${completeness}%`,
            suggestion: completeness < 60 ? '建议继续完善行程细节' : undefined,
        };
    }
    extractKeyFeatures(ctx, hardGates) {
        const citiesInvolved = new Set();
        let maxDailyDistance = 0;
        let maxDailyActivityMinutes = 0;
        const crossCitySegments = [];
        for (const day of ctx.days) {
            let dailyDistance = 0;
            let dailyActivityMinutes = 0;
            const dayCities = new Set();
            for (const item of day.items) {
                dailyActivityMinutes += item.duration || 60;
                const city = this.detectCityForItem(item);
                if (city) {
                    citiesInvolved.add(city);
                    dayCities.add(city);
                }
            }
            maxDailyActivityMinutes = Math.max(maxDailyActivityMinutes, dailyActivityMinutes);
            const daysCitiesArr = Array.from(dayCities);
            if (daysCitiesArr.length > 1) {
                for (let i = 0; i < daysCitiesArr.length - 1; i++) {
                    const distance = this.calculateCityDistance(daysCitiesArr[i], daysCitiesArr[i + 1]);
                    if (distance > 100) {
                        crossCitySegments.push({
                            day: day.dayNumber,
                            from_city: daysCitiesArr[i],
                            to_city: daysCitiesArr[i + 1],
                            distance_km: Math.round(distance),
                            estimated_travel_minutes: Math.round(distance / 5),
                        });
                    }
                }
            }
        }
        const nightSegments = this.detectNightSegments(ctx);
        const noRescueSegments = this.detectNoRescueSegments(ctx);
        return {
            total_days: ctx.durationDays,
            total_activities: ctx.days.reduce((sum, d) => sum + d.items.length, 0),
            cities_involved: Array.from(citiesInvolved),
            max_daily_distance_km: maxDailyDistance,
            max_daily_activity_minutes: maxDailyActivityMinutes,
            cross_city_segments: crossCitySegments.length > 0 ? crossCitySegments : undefined,
            night_segments: nightSegments.length > 0 ? nightSegments : undefined,
            no_rescue_segments: noRescueSegments.length > 0 ? noRescueSegments : undefined,
            time_conflicts: hardGates.filter(g => g.rule === 'TIME_CONFLICT').length,
            missing_data: hardGates.filter(g => g.rule === 'DATA_MISSING').map(g => g.detail),
        };
    }
    generateAlternatives(ctx, hardGates, softScores) {
        const alternatives = [];
        let priorityCounter = 1;
        for (const gate of hardGates) {
            if (gate.result === 'FAIL') {
                switch (gate.rule) {
                    case 'TIME_CONFLICT':
                        alternatives.push({
                            id: `alt_${(0, uuid_1.v4)().slice(0, 8)}`,
                            strategy: 'ADJUST_TIME',
                            priority: priorityCounter++,
                            description: `调整时间解决冲突: ${gate.detail}`,
                            impact: {
                                time_change_minutes: 30,
                            },
                            confidence: 0.9,
                        });
                        break;
                    case 'GEO_IMPOSSIBLE':
                        alternatives.push({
                            id: `alt_${(0, uuid_1.v4)().slice(0, 8)}`,
                            strategy: 'REMOVE_POI',
                            priority: priorityCounter++,
                            description: `移除不属于本次行程的景点`,
                            impact: {
                                removed_items: gate.affected_items,
                            },
                            confidence: 0.95,
                        });
                        alternatives.push({
                            id: `alt_${(0, uuid_1.v4)().slice(0, 8)}`,
                            strategy: 'CHANGE_DAY',
                            priority: priorityCounter++,
                            description: `将跨城市景点移到单独的一天`,
                            impact: {},
                            confidence: 0.7,
                        });
                        break;
                    case 'TRANSFER_BUFFER':
                        alternatives.push({
                            id: `alt_${(0, uuid_1.v4)().slice(0, 8)}`,
                            strategy: 'ADD_BUFFER',
                            priority: priorityCounter++,
                            description: `增加换乘缓冲时间`,
                            impact: {
                                time_change_minutes: 30,
                            },
                            confidence: 0.85,
                        });
                        break;
                }
            }
        }
        if (softScores.fatigue.exceeded) {
            alternatives.push({
                id: `alt_${(0, uuid_1.v4)().slice(0, 8)}`,
                strategy: 'REMOVE_POI',
                priority: priorityCounter++,
                description: '减少活动数量以降低疲劳度',
                impact: {},
                confidence: 0.7,
            });
        }
        return alternatives.slice(0, 5);
    }
    generateConclusion(hardGates, softScores, nightSegments) {
        const failedGates = hardGates.filter(g => g.result === 'FAIL');
        const errorGates = hardGates.filter(g => g.severity === 'ERROR');
        const highRiskNightActivities = (nightSegments === null || nightSegments === void 0 ? void 0 : nightSegments.filter(s => s.risk_level === 'HIGH')) || [];
        const hasHighRiskNight = highRiskNightActivities.length > 0;
        const routeApproved = failedGates.length === 0;
        const adjustmentRequired = errorGates.length > 0 || softScores.overall < 60 || hasHighRiskNight;
        let executabilityScore = 100;
        executabilityScore -= failedGates.length * 20;
        executabilityScore -= (100 - softScores.overall) * 0.3;
        executabilityScore -= highRiskNightActivities.length * 10;
        executabilityScore = Math.max(0, Math.min(100, executabilityScore));
        const rejectionReasons = [...failedGates.map(g => g.detail)];
        if (hasHighRiskNight) {
            rejectionReasons.push(`存在 ${highRiskNightActivities.length} 个凌晨时段的活动安排`);
        }
        return {
            route_approved: routeApproved,
            rejection_reasons: rejectionReasons,
            adjustment_required: adjustmentRequired,
            executability_score: Math.round(executabilityScore),
            confidence: routeApproved ? (hasHighRiskNight ? 0.8 : 0.9) : 0.7,
        };
    }
    determineNextSteps(conclusion, alternatives, nightSegments) {
        var _a;
        const steps = [];
        const highRiskNightActivities = (nightSegments === null || nightSegments === void 0 ? void 0 : nightSegments.filter(s => s.risk_level === 'HIGH')) || [];
        const hasHighRiskNight = highRiskNightActivities.length > 0;
        if (conclusion.route_approved && !conclusion.adjustment_required) {
            steps.push({
                action: 'APPLY',
                message: '行程可执行，可以直接使用',
                requires_user_confirmation: false,
            });
        }
        else if (hasHighRiskNight) {
            steps.push({
                action: 'AUTO_FIX',
                message: `建议调整 ${highRiskNightActivities.length} 个凌晨时段的活动时间`,
                requires_user_confirmation: true,
            });
            for (const segment of highRiskNightActivities.slice(0, 3)) {
                steps.push({
                    action: 'ADJUST',
                    message: segment.description || '调整活动时间',
                    requires_user_confirmation: true,
                });
            }
        }
        else if (conclusion.adjustment_required && alternatives.length > 0) {
            steps.push({
                action: 'AUTO_FIX',
                alternative_id: alternatives[0].id,
                message: `建议应用: ${alternatives[0].description}`,
                requires_user_confirmation: true,
            });
            if (alternatives.length > 1) {
                steps.push({
                    action: 'CONFIRM',
                    message: `还有 ${alternatives.length - 1} 个替代方案可选`,
                    requires_user_confirmation: true,
                });
            }
        }
        else {
            steps.push({
                action: 'REJECT',
                message: ((_a = conclusion.rejection_reasons) === null || _a === void 0 ? void 0 : _a.join('；')) || '行程存在问题',
                requires_user_confirmation: false,
            });
        }
        return steps;
    }
    mergeVerificationIssues(hardGates, verifyResult, ctx) {
        for (const issue of verifyResult.issues) {
            const issueDay = issue.day ? parseInt(issue.day.split('-')[2] || '0', 10) : undefined;
            if (issue.type === 'TIME_WINDOW_OVERLAP') {
                const extractActivityNames = (text) => {
                    const names = [];
                    const format1 = text.match(/「([^」]+)」/g) || [];
                    format1.forEach(a => {
                        const name = a.replace(/「|」/g, '').trim();
                        if (name && name.length > 0) {
                            names.push(name);
                        }
                    });
                    const format2Match = text.match(/时间窗重叠[：:]\s*([^和]+)\s+和\s+([^的]+)/);
                    if (format2Match && format2Match.length >= 3) {
                        const name1 = format2Match[1].trim();
                        const name2 = format2Match[2].trim();
                        if (name1 && name1.length > 0 && !name1.includes('时间窗重叠')) {
                            names.push(name1);
                        }
                        if (name2 && name2.length > 0 && !name2.includes('时间窗重叠')) {
                            names.push(name2);
                        }
                    }
                    return names;
                };
                const issueNames = extractActivityNames(issue.message);
                const issueNamesSet = new Set(issueNames);
                const issueNamesSorted = [...issueNamesSet].sort();
                this.logger.debug(`[去重] TIME_WINDOW_OVERLAP 问题: ${issue.message}`);
                this.logger.debug(`[去重] 提取的活动名称: ${JSON.stringify(issueNamesSorted)}`);
                const hasTimeConflict = hardGates.some(g => {
                    if (g.rule !== 'TIME_CONFLICT')
                        return false;
                    if (g.day !== issueDay)
                        return false;
                    const gNames = extractActivityNames(g.detail);
                    const gNamesSet = new Set(gNames);
                    const gNamesSorted = [...gNamesSet].sort();
                    this.logger.debug(`[去重] 比较 TIME_CONFLICT: ${g.detail}`);
                    this.logger.debug(`[去重] 提取的活动名称: ${JSON.stringify(gNamesSorted)}`);
                    if (gNamesSet.size >= 2 && issueNamesSet.size >= 2) {
                        if (gNamesSet.size === 2 && issueNamesSet.size === 2) {
                            if (gNamesSorted[0] === issueNamesSorted[0] &&
                                gNamesSorted[1] === issueNamesSorted[1]) {
                                this.logger.debug(`[去重] ✅ 匹配成功: 相同的活动对`);
                                return true;
                            }
                        }
                        const commonNames = [...gNamesSet].filter(name => issueNamesSet.has(name));
                        if (commonNames.length >= 2) {
                            this.logger.debug(`[去重] ✅ 匹配成功: ${commonNames.length} 个共同活动`);
                            return true;
                        }
                    }
                    if (g.affected_items && g.affected_items.length > 0 && issue.item_id) {
                        if (g.affected_items.includes(issue.item_id)) {
                            this.logger.debug(`[去重] ✅ 匹配成功: affected_items 包含 issue.item_id`);
                            return true;
                        }
                    }
                    return false;
                });
                if (hasTimeConflict) {
                    continue;
                }
            }
            const issueRule = this.mapIssueTypeToRule(issue.type);
            let issueItemIds = [];
            if (issueRule === 'TIME_CONFLICT' && issue.message) {
                const activityPattern = /「([^」]+)」/g;
                const matches = issue.message.matchAll(activityPattern);
                for (const match of matches) {
                    const activityName = match[1];
                    if (activityName.startsWith('活动 ')) {
                        const shortId = activityName.replace('活动 ', '');
                        for (const day of ctx.days) {
                            const foundItem = day.items.find(i => {
                                const itemId = i.itemId || '';
                                const itemShortId = itemId.length > 8 ? itemId.slice(-6) : itemId;
                                return itemShortId === shortId;
                            });
                            if (foundItem && foundItem.itemId) {
                                issueItemIds.push(foundItem.itemId);
                                break;
                            }
                        }
                    }
                    else {
                        for (const day of ctx.days) {
                            const foundItem = day.items.find(i => {
                                const itemName = i.name || '';
                                return itemName === activityName || itemName.includes(activityName);
                            });
                            if (foundItem && foundItem.itemId) {
                                issueItemIds.push(foundItem.itemId);
                                break;
                            }
                        }
                    }
                }
            }
            else if (issue.item_id) {
                issueItemIds = [issue.item_id];
            }
            const exists = hardGates.some(g => {
                if (g.rule !== issueRule)
                    return false;
                if (g.day !== issueDay)
                    return false;
                const extractActivityNames = (text) => {
                    const names = [];
                    const format1 = text.match(/「([^」]+)」/g) || [];
                    format1.forEach(a => names.push(a.replace(/「|」/g, '').trim()));
                    const format2Match = text.match(/时间窗重叠[：:]\s*([^和]+)\s+和\s+([^的]+)/);
                    if (format2Match && format2Match.length >= 3) {
                        names.push(format2Match[1].trim());
                        names.push(format2Match[2].trim());
                    }
                    return names.filter(n => n && n.length > 0 && !n.includes('时间窗重叠'));
                };
                const gNames = extractActivityNames(g.detail);
                const issueNames = extractActivityNames(issue.message);
                const gNamesSet = new Set(gNames);
                const issueNamesSet = new Set(issueNames);
                if (gNamesSet.size >= 2 && issueNamesSet.size >= 2) {
                    const commonNames = [...gNamesSet].filter(name => issueNamesSet.has(name));
                    if (commonNames.length >= 2) {
                        return true;
                    }
                    if (gNamesSet.size === 2 && issueNamesSet.size === 2) {
                        const gArray = [...gNamesSet].sort();
                        const issueArray = [...issueNamesSet].sort();
                        if (gArray[0] === issueArray[0] && gArray[1] === issueArray[1]) {
                            return true;
                        }
                    }
                }
                const gItems = g.affected_items || (g.item_id ? [g.item_id] : []);
                if (gItems.length > 0 && issueItemIds.length > 0) {
                    const gItemsSet = new Set(gItems);
                    const issueItemsSet = new Set(issueItemIds);
                    const intersection = [...gItemsSet].filter(id => issueItemsSet.has(id));
                    if (intersection.length >= 2) {
                        return true;
                    }
                }
                return false;
            });
            if (!exists) {
                let improvedMessage = issue.message;
                const activityPattern = /活动\s*([a-f0-9]{6})/gi;
                const matches = improvedMessage.matchAll(activityPattern);
                for (const match of matches) {
                    const shortId = match[1];
                    for (const day of ctx.days) {
                        const foundItem = day.items.find(i => {
                            const itemId = i.itemId || '';
                            const itemShortId = itemId.length > 8 ? itemId.slice(-6) : itemId;
                            return itemShortId === shortId;
                        });
                        if (foundItem && foundItem.name && foundItem.name.trim() !== '') {
                            if (!foundItem.name.startsWith('活动 ') &&
                                foundItem.name !== '未命名活动' &&
                                foundItem.name !== '活动（名称缺失）') {
                                improvedMessage = improvedMessage.replace(new RegExp(`活动\\s*${shortId}`, 'gi'), foundItem.name);
                            }
                        }
                    }
                }
                hardGates.push({
                    rule: this.mapIssueTypeToRule(issue.type),
                    result: issue.severity === 'ERROR' ? 'FAIL' : 'PASS',
                    severity: issue.severity,
                    detail: improvedMessage,
                    suggestion: issue.suggestion,
                    item_id: issue.item_id,
                    affected_items: issue.item_id ? [issue.item_id] : undefined,
                    day: issue.day ? parseInt(issue.day.split('-')[2] || '0', 10) : undefined,
                });
            }
        }
    }
    deduplicateHardGates(hardGates) {
        const seen = new Set();
        const deduplicated = [];
        for (const gate of hardGates) {
            const affectedItems = gate.affected_items || (gate.item_id ? [gate.item_id] : []);
            const sortedItems = [...affectedItems].sort();
            let normalizedKey;
            if (gate.rule === 'TIME_CONFLICT') {
                const activities = gate.detail.match(/「([^」]+)」/g) || [];
                const activityNames = activities.map(a => a.replace(/「|」/g, '').trim()).sort();
                if (activityNames.length >= 2) {
                    normalizedKey = `TIME_CONFLICT_${gate.day || 0}_${activityNames.join(',')}`;
                }
                else {
                    normalizedKey = `TIME_CONFLICT_${gate.day || 0}_${sortedItems.join(',')}`;
                }
            }
            else {
                normalizedKey = `${gate.rule}_${gate.day || 0}_${sortedItems.join(',')}`;
            }
            if (!seen.has(normalizedKey)) {
                seen.add(normalizedKey);
                deduplicated.push(gate);
            }
            else {
                const existingIndex = deduplicated.findIndex(g => {
                    const existingItems = g.affected_items || (g.item_id ? [g.item_id] : []);
                    const existingSorted = [...existingItems].sort();
                    if (g.rule === 'TIME_CONFLICT') {
                        const existingActivities = g.detail.match(/「([^」]+)」/g) || [];
                        const existingNames = existingActivities.map(a => a.replace(/「|」/g, '').trim()).sort();
                        const gateActivities = gate.detail.match(/「([^」]+)」/g) || [];
                        const gateNames = gateActivities.map(a => a.replace(/「|」/g, '').trim()).sort();
                        if (existingNames.length >= 2 && gateNames.length >= 2) {
                            const existingSet = new Set(existingNames);
                            const gateSet = new Set(gateNames);
                            if (existingSet.size === gateSet.size && [...existingSet].every(name => gateSet.has(name))) {
                                return g.day === gate.day;
                            }
                        }
                        let existingKey;
                        if (existingNames.length >= 2) {
                            existingKey = `TIME_CONFLICT_${g.day || 0}_${existingNames.join(',')}`;
                        }
                        else {
                            existingKey = `TIME_CONFLICT_${g.day || 0}_${existingSorted.join(',')}`;
                        }
                        return existingKey === normalizedKey;
                    }
                    else {
                        const existingKey = `${g.rule}_${g.day || 0}_${existingSorted.join(',')}`;
                        return existingKey === normalizedKey;
                    }
                });
                if (existingIndex >= 0) {
                    const existing = deduplicated[existingIndex];
                    if (gate.severity === 'ERROR' && existing.severity === 'WARNING') {
                        existing.severity = 'ERROR';
                        existing.result = 'FAIL';
                    }
                    if (gate.detail.length > existing.detail.length ||
                        (!gate.detail.includes('活动 ') && existing.detail.includes('活动 '))) {
                        existing.detail = gate.detail;
                    }
                }
            }
        }
        return deduplicated;
    }
    mapIssueTypeToRule(type) {
        const mapping = {
            'OPENING_HOURS_CONFLICT': 'OPENING_HOURS',
            'TRANSFER_BUFFER_INSUFFICIENT': 'TRANSFER_BUFFER',
            'REACHABILITY_ISSUE': 'REACHABILITY',
            'FATIGUE_THRESHOLD_EXCEEDED': 'SAFETY',
            'TIME_WINDOW_OVERLAP': 'TIME_CONFLICT',
        };
        return mapping[type] || 'DATA_MISSING';
    }
    convertToItinerary(ctx) {
        return {
            request_id: ctx.tripId,
            days: ctx.days.map(day => ({
                date: day.date,
                items: day.items.map(item => ({
                    id: item.itemId,
                    type: (item.type || 'POI'),
                    start_window: item.startTime || '',
                    end_window: item.endTime || '',
                    location_ref: {
                        place_id: item.poiId || '',
                        name: item.name,
                    },
                    evidence_refs: [],
                    verified: false,
                    metadata: {
                        duration_minutes: item.duration,
                    },
                })),
            })),
            metadata: {
                total_days: ctx.durationDays,
            },
        };
    }
    generateDataTimestamps() {
        const timestamps = [
            {
                data_source: 'trip_context',
                retrieved_at: new Date().toISOString(),
                expiration_policy: {
                    type: 'FIXED_DURATION',
                    duration_hours: 24,
                },
                is_expired: false,
            },
        ];
        if (this.transportSearchSkill) {
            timestamps.push({
                data_source: 'transport.search',
                retrieved_at: new Date().toISOString(),
                expiration_policy: {
                    type: 'FIXED_DURATION',
                    duration_hours: 1,
                },
                is_expired: false,
            });
        }
        if (this.openingHoursSkill) {
            timestamps.push({
                data_source: 'opening_hours.get',
                retrieved_at: new Date().toISOString(),
                expiration_policy: {
                    type: 'FIXED_DURATION',
                    duration_hours: 24,
                },
                is_expired: false,
            });
        }
        return timestamps;
    }
    trackMetrics(evidence, processingTime) {
        const metrics = {
            request_id: evidence.evidence_id,
            executable: evidence.conclusion.route_approved,
            hard_gate_hits: evidence.hard_gates.filter(g => g.result === 'FAIL').length,
            soft_score_average: evidence.soft_scores.overall,
            alternatives_generated: evidence.alternatives.length,
            processing_time_ms: processingTime,
            data_completeness: 1 - (evidence.key_features.missing_data.length / 10),
        };
        this.logger.log(`[RouteOptimization] Metrics: ${JSON.stringify(metrics)}`);
    }
    getItemName(item) {
        var _a;
        let name = item.name || item.placeName || item.title || item.nameCN || ((_a = item.place) === null || _a === void 0 ? void 0 : _a.name) || '';
        const itemId = item.itemId || item.id || '';
        const isPlaceholderName = name && (name.startsWith('活动 ') ||
            name.startsWith('活动（名称缺失）') ||
            name === '未命名活动' ||
            name === '活动（名称缺失）');
        if ((!name || name.trim() === '' || isPlaceholderName) && this.currentContext && itemId) {
            for (const day of this.currentContext.days) {
                const foundItem = day.items.find(i => i.itemId === itemId);
                if (foundItem && foundItem.name && foundItem.name.trim() !== '') {
                    if (!foundItem.name.startsWith('活动 ') &&
                        foundItem.name !== '未命名活动' &&
                        foundItem.name !== '活动（名称缺失）') {
                        name = foundItem.name;
                        break;
                    }
                }
            }
        }
        if (!name || name.trim() === '' || isPlaceholderName) {
            if (itemId) {
                const shortId = itemId.length > 8 ? itemId.slice(-6) : itemId;
                return `活动 ${shortId}`;
            }
            return '活动（名称缺失）';
        }
        return name;
    }
    getItemNameOrId(item) {
        const name = this.getItemName(item);
        const itemId = item.itemId || item.id || '';
        return { name, itemId };
    }
    async checkSafetyHazards(ctx) {
        const results = [];
        if (!this.geoCheckHazardZonesSkill) {
            this.logger.debug('[路线优化] GeoCheckHazardZonesSkill 未注入，跳过安全风险检查');
            return results;
        }
        try {
            const route = this.extractPolylineFromContext(ctx);
            if (route.length < 2) {
                return results;
            }
            const countryCode = this.inferCountryCode(ctx);
            if (!countryCode) {
                this.logger.debug('[路线优化] 无法推断国家代码，跳过安全风险检查');
                return results;
            }
            const currentMonth = ctx.startDate
                ? new Date(ctx.startDate).getMonth() + 1
                : new Date().getMonth() + 1;
            const hazardResult = await this.geoCheckHazardZonesSkill.execute({
                route,
                countryCode,
                month: currentMonth,
                minLevel: 'MEDIUM',
                bufferRadius: 1000,
            });
            if (hazardResult.riskAssessment.hasHighRisk) {
                const highRiskZones = hazardResult.hazardZones.filter(z => z.level === 'HIGH');
                results.push({
                    rule: 'SAFETY',
                    result: 'FAIL',
                    severity: 'ERROR',
                    detail: `路线经过 ${highRiskZones.length} 个高风险区域：${highRiskZones.map(z => z.type).join('、')}`,
                    suggestion: '建议调整路线避开高风险区域，或选择其他时间段出行',
                    evidence_ref: `hazard_zones_${hazardResult.riskAssessment.highRiskCount}`,
                });
            }
            if (hazardResult.riskAssessment.hasMediumRisk && !hazardResult.riskAssessment.hasHighRisk) {
                const mediumRiskZones = hazardResult.hazardZones.filter(z => z.level === 'MEDIUM');
                results.push({
                    rule: 'SAFETY',
                    result: 'PASS',
                    severity: 'WARNING',
                    detail: `路线经过 ${mediumRiskZones.length} 个中等风险区域：${mediumRiskZones.map(z => z.type).join('、')}`,
                    suggestion: '建议关注天气和路况信息，做好安全准备',
                    evidence_ref: `hazard_zones_${hazardResult.riskAssessment.mediumRiskCount}`,
                });
            }
            this.logger.debug(`[路线优化] 安全风险检查完成: 高风险=${hazardResult.riskAssessment.highRiskCount}, 中等风险=${hazardResult.riskAssessment.mediumRiskCount}`);
        }
        catch (error) {
            this.logger.warn(`[路线优化] 安全风险检查失败: ${error}`);
        }
        return results;
    }
    extractPolylineFromContext(ctx) {
        const route = [];
        for (const day of ctx.days) {
            for (const item of day.items) {
                if (item.location && item.location.lat && item.location.lng) {
                    route.push({
                        lat: item.location.lat,
                        lng: item.location.lng,
                    });
                }
            }
        }
        const deduplicated = [];
        for (let i = 0; i < route.length; i++) {
            if (i === 0 ||
                route[i].lat !== route[i - 1].lat ||
                route[i].lng !== route[i - 1].lng) {
                deduplicated.push(route[i]);
            }
        }
        return deduplicated;
    }
    inferCountryCode(ctx) {
        const destination = ctx.destinationName || ctx.destination;
        if (typeof destination === 'string') {
            const countryMap = {
                '中国': 'CN',
                '日本': 'JP',
                '美国': 'US',
                '英国': 'GB',
                '法国': 'FR',
                '德国': 'DE',
                '意大利': 'IT',
                '西班牙': 'ES',
                '澳大利亚': 'AU',
                '加拿大': 'CA',
                '韩国': 'KR',
                '泰国': 'TH',
                '新加坡': 'SG',
                '马来西亚': 'MY',
                '印度尼西亚': 'ID',
                '越南': 'VN',
                '菲律宾': 'PH',
            };
            for (const [name, code] of Object.entries(countryMap)) {
                if (destination.includes(name)) {
                    return code;
                }
            }
        }
        const cities = ctx.days.flatMap(day => day.items.map(item => item.cityName || day.city)).filter(Boolean);
        if (cities.length > 0) {
            const cityCountryMap = {
                '北京': 'CN', '上海': 'CN', '广州': 'CN', '深圳': 'CN', '杭州': 'CN',
                '东京': 'JP', '大阪': 'JP', '京都': 'JP',
                '纽约': 'US', '洛杉矶': 'US', '旧金山': 'US',
                '伦敦': 'GB', '巴黎': 'FR', '柏林': 'DE', '罗马': 'IT', '马德里': 'ES',
            };
            for (const city of cities) {
                if (cityCountryMap[city]) {
                    return cityCountryMap[city];
                }
            }
        }
        return undefined;
    }
    parseTimeToMinutes(time) {
        if (typeof time === 'number')
            return time;
        if (time instanceof Date)
            return time.getHours() * 60 + time.getMinutes();
        if (typeof time === 'string') {
            if (time.includes('T')) {
                const d = new Date(time);
                return d.getHours() * 60 + d.getMinutes();
            }
            const [h, m] = time.split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
        }
        return 0;
    }
    detectCityForItem(item) {
        if (item.cityName)
            return item.cityName;
        const name = this.getItemName(item);
        for (const [landmark, city] of Object.entries(this.LANDMARK_CITY_MAP)) {
            if (name.includes(landmark)) {
                return city;
            }
        }
        if (item.address) {
            for (const city of Object.keys(this.CITY_COORDINATES)) {
                if (item.address.includes(city)) {
                    return city;
                }
            }
        }
        return null;
    }
    calculateCityDistance(city1, city2) {
        const coord1 = this.CITY_COORDINATES[city1];
        const coord2 = this.CITY_COORDINATES[city2];
        if (!coord1 || !coord2)
            return 0;
        return this.calculateDistance(coord1.lat, coord1.lng, coord2.lat, coord2.lng);
    }
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRad(deg) {
        return deg * (Math.PI / 180);
    }
    detectNightSegments(ctx) {
        const segments = [];
        for (const day of ctx.days) {
            const dayDate = day.date ? new Date(day.date) : new Date(ctx.startDate);
            for (const item of day.items) {
                if (!item.startTime || !item.endTime)
                    continue;
                const startTime = this.parseTimeToMinutes(item.startTime);
                const endTime = this.parseTimeToMinutes(item.endTime);
                const nightStart = 18 * 60;
                const nightEnd = 6 * 60;
                let riskLevel = 'LOW';
                let isNightSegment = false;
                if (startTime >= 0 && startTime < nightEnd) {
                    isNightSegment = true;
                    riskLevel = 'HIGH';
                }
                else if (startTime >= nightStart) {
                    isNightSegment = true;
                    riskLevel = 'MEDIUM';
                }
                else if (endTime > 0 && endTime < nightEnd && startTime >= nightEnd && startTime < nightStart) {
                    isNightSegment = true;
                    riskLevel = 'MEDIUM';
                }
                if (isNightSegment) {
                    const startDateTime = new Date(dayDate);
                    startDateTime.setHours(Math.floor(startTime / 60), startTime % 60, 0, 0);
                    const endDateTime = new Date(dayDate);
                    endDateTime.setHours(Math.floor(endTime / 60), endTime % 60, 0, 0);
                    if (endTime < startTime) {
                        endDateTime.setDate(endDateTime.getDate() + 1);
                    }
                    segments.push({
                        day: day.dayNumber,
                        start: startDateTime.toISOString(),
                        end: endDateTime.toISOString(),
                        risk_level: riskLevel,
                        description: `第${day.dayNumber}天「${this.getItemName(item)}」在夜间时段（${this.formatTime(startTime)}-${this.formatTime(endTime)}）`,
                    });
                }
            }
        }
        return segments || [];
    }
    detectNoRescueSegments(ctx) {
        const segments = [];
        for (const day of ctx.days) {
            const dayDate = day.date ? new Date(day.date) : new Date(ctx.startDate);
            const itemsWithLocation = day.items.filter(item => item.location && item.startTime && item.endTime);
            if (itemsWithLocation.length < 2)
                continue;
            let segmentStart = null;
            let segmentEnd = null;
            let segmentDistance = 0;
            for (let i = 0; i < itemsWithLocation.length; i++) {
                const item = itemsWithLocation[i];
                const city = this.detectCityForItem(item);
                if (!city || !item.location)
                    continue;
                const cityCenter = this.CITY_COORDINATES[city];
                if (!cityCenter)
                    continue;
                const distanceToCity = this.calculateDistance(item.location.lat, item.location.lng, cityCenter.lat, cityCenter.lng);
                if (distanceToCity > 20) {
                    if (!segmentStart) {
                        segmentStart = item;
                        segmentDistance = distanceToCity;
                    }
                    else {
                        segmentEnd = item;
                        segmentDistance = Math.max(segmentDistance, distanceToCity);
                    }
                }
                else {
                    if (segmentStart && segmentEnd) {
                        const riskLevel = segmentDistance > 50 ? 'HIGH' :
                            segmentDistance > 30 ? 'MEDIUM' : 'LOW';
                        const startTime = this.parseTimeToMinutes(segmentStart.startTime);
                        const endTime = this.parseTimeToMinutes(segmentEnd.endTime);
                        const startDateTime = new Date(dayDate);
                        startDateTime.setHours(Math.floor(startTime / 60), startTime % 60, 0, 0);
                        const endDateTime = new Date(dayDate);
                        endDateTime.setHours(Math.floor(endTime / 60), endTime % 60, 0, 0);
                        segments.push({
                            day: day.dayNumber,
                            start: startDateTime.toISOString(),
                            end: endDateTime.toISOString(),
                            distance_km: Math.round(segmentDistance),
                            risk_level: riskLevel,
                            description: `第${day.dayNumber}天连续活动距离城市中心 ${Math.round(segmentDistance)}km，救援支持有限`,
                        });
                        segmentStart = null;
                        segmentEnd = null;
                        segmentDistance = 0;
                    }
                }
            }
            if (segmentStart && segmentEnd) {
                const riskLevel = segmentDistance > 50 ? 'HIGH' :
                    segmentDistance > 30 ? 'MEDIUM' : 'LOW';
                const startTime = this.parseTimeToMinutes(segmentStart.startTime);
                const endTime = this.parseTimeToMinutes(segmentEnd.endTime);
                const startDateTime = new Date(dayDate);
                startDateTime.setHours(Math.floor(startTime / 60), startTime % 60, 0, 0);
                const endDateTime = new Date(dayDate);
                endDateTime.setHours(Math.floor(endTime / 60), endTime % 60, 0, 0);
                segments.push({
                    day: day.dayNumber,
                    start: startDateTime.toISOString(),
                    end: endDateTime.toISOString(),
                    distance_km: Math.round(segmentDistance),
                    risk_level: riskLevel,
                    description: `第${day.dayNumber}天连续活动距离城市中心 ${Math.round(segmentDistance)}km，救援支持有限`,
                });
            }
        }
        return segments || [];
    }
    formatTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
    async generateCandidateRoutes(ctx, request, demData) {
        const config = request.candidate_route_config || {};
        const strategies = config.strategies || ['COMPACT', 'BALANCED', 'RELAXED'];
        const samplesPerStrategy = config.samples_per_strategy || 2;
        const routes = [];
        let successful = 0;
        let failed = 0;
        for (const strategy of strategies) {
            for (let sample = 0; sample < samplesPerStrategy; sample++) {
                try {
                    const strategyWeights = this.getStrategyWeights(strategy);
                    const strategySoftScores = this.calculateSoftScoresWithWeights(ctx, strategyWeights, demData);
                    const description = this.generateRouteDescription(ctx, strategy, strategySoftScores);
                    const keyFeatures = {
                        total_duration_minutes: ctx.days.reduce((sum, day) => sum + day.items.reduce((s, item) => s + (item.duration || 60), 0), 0),
                        total_distance_km: 0,
                        activity_count: ctx.days.reduce((sum, day) => sum + day.items.length, 0),
                        fatigue_score: strategySoftScores.fatigue.score,
                        pace_score: strategySoftScores.pace.score,
                    };
                    routes.push({
                        id: `candidate_${strategy}_${sample}_${Date.now()}`,
                        strategy: strategy,
                        score: strategySoftScores.overall,
                        description,
                        key_features: keyFeatures,
                    });
                    successful++;
                }
                catch (error) {
                    this.logger.warn(`[路线优化] 生成候选路线失败 (${strategy}, sample ${sample}): ${error}`);
                    failed++;
                }
            }
        }
        const bestRoute = routes.length > 0
            ? routes.reduce((best, current) => current.score > best.score ? current : best)
            : undefined;
        return {
            routes,
            best_route_id: bestRoute === null || bestRoute === void 0 ? void 0 : bestRoute.id,
            statistics: {
                total_generated: routes.length,
                successful,
                failed,
            },
        };
    }
    getStrategyWeights(strategy) {
        switch (strategy) {
            case 'COMPACT':
                return { fatigue: 0.2, pace: 0.3, experience: 0.3, efficiency: 0.2 };
            case 'BALANCED':
                return { fatigue: 0.3, pace: 0.25, experience: 0.25, efficiency: 0.2 };
            case 'RELAXED':
                return { fatigue: 0.4, pace: 0.3, experience: 0.2, efficiency: 0.1 };
            default:
                return { fatigue: 0.3, pace: 0.25, experience: 0.25, efficiency: 0.2 };
        }
    }
    calculateSoftScoresWithWeights(ctx, weights, demData) {
        const fatigueScore = this.calculateFatigueScore(ctx, demData);
        const paceScore = this.calculatePaceScore(ctx);
        const experienceScore = this.calculateExperienceScore(ctx);
        const efficiencyScore = this.calculateEfficiencyScore(ctx);
        const overall = fatigueScore.score * weights.fatigue +
            paceScore.score * weights.pace +
            experienceScore.score * weights.experience +
            efficiencyScore.score * weights.efficiency;
        return {
            fatigue: { ...fatigueScore, weight: weights.fatigue },
            pace: { ...paceScore, weight: weights.pace },
            experience: { ...experienceScore, weight: weights.experience },
            efficiency: { ...efficiencyScore, weight: weights.efficiency },
            overall: Math.round(overall),
        };
    }
    generateRouteDescription(ctx, strategy, softScores) {
        const strategyNames = {
            'COMPACT': '紧凑型',
            'BALANCED': '均衡型',
            'RELAXED': '松弛型',
        };
        const strategyName = strategyNames[strategy] || strategy;
        const totalActivities = ctx.days.reduce((sum, day) => sum + day.items.length, 0);
        const avgDailyActivities = Math.round(totalActivities / ctx.durationDays);
        return `${strategyName}路线：共 ${totalActivities} 个活动，平均每天 ${avgDailyActivities} 个。` +
            `疲劳评分 ${softScores.fatigue.score}/100，节奏评分 ${softScores.pace.score}/100，` +
            `综合评分 ${softScores.overall}/100。`;
    }
};
exports.RouteOptimizationService = RouteOptimizationService;
exports.RouteOptimizationService = RouteOptimizationService = RouteOptimizationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [itinerary_verify_skill_1.ItineraryVerifySkill,
        transport_search_skill_1.TransportSearchSkill,
        opening_hours_get_skill_1.OpeningHoursGetSkill,
        dem_get_profile_skill_1.DemGetProfileSkill,
        geo_check_hazard_zones_skill_1.GeoCheckHazardZonesSkill])
], RouteOptimizationService);
//# sourceMappingURL=route-optimization.service.js.map
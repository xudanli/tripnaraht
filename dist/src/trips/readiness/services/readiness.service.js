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
var ReadinessService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const trust_metrics_service_1 = require("./trust-metrics.service");
const readiness_checker_1 = require("../engine/readiness-checker");
const facts_to_readiness_compiler_1 = require("../compilers/facts-to-readiness.compiler");
const readiness_to_constraints_compiler_1 = require("../compilers/readiness-to-constraints.compiler");
const pack_storage_service_1 = require("../storage/pack-storage.service");
const geo_facts_service_1 = require("./geo-facts.service");
function addDays(date, days) {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
let ReadinessService = ReadinessService_1 = class ReadinessService {
    constructor(prisma, readinessChecker, factsCompiler, constraintsCompiler, packStorage, geoFactsService, trustMetricsService) {
        this.prisma = prisma;
        this.readinessChecker = readinessChecker;
        this.factsCompiler = factsCompiler;
        this.constraintsCompiler = constraintsCompiler;
        this.packStorage = packStorage;
        this.geoFactsService = geoFactsService;
        this.trustMetricsService = trustMetricsService;
        this.logger = new common_1.Logger(ReadinessService_1.name);
    }
    extractTripContext(state) {
        var _a;
        const destination = state.context.destination;
        const startDate = state.context.startDate;
        const endDate = startDate
            ? addDays(startDate, state.context.durationDays - 1)
            : undefined;
        const activities = [];
        const activitySet = new Set();
        for (const date in state.candidatesByDate) {
            const candidates = state.candidatesByDate[date];
            for (const candidate of candidates) {
                if (candidate.type === 'tour') {
                    activitySet.add('tour');
                }
                if (candidate.type === 'nature') {
                    activitySet.add('hiking');
                }
                if (candidate.type === 'sightseeing') {
                    activitySet.add('sightseeing');
                }
                const name = (candidate.name.en || candidate.name.zh || '').toLowerCase();
                if (name.includes('snowmobile') || name.includes('雪地摩托')) {
                    activitySet.add('snowmobile');
                }
                if (name.includes('dog') && (name.includes('sled') || name.includes('拉'))) {
                    activitySet.add('dog_sled');
                }
                if (name.includes('boat') || name.includes('船')) {
                    activitySet.add('boat_tour');
                }
                if (name.includes('hiking') || name.includes('徒步')) {
                    activitySet.add('hiking');
                }
                if (name.includes('wildlife') || name.includes('野生动物')) {
                    activitySet.add('wildlife');
                }
                if (name.includes('ice') && name.includes('cave')) {
                    activitySet.add('ice_cave');
                }
            }
        }
        let season;
        if (startDate) {
            const month = new Date(startDate + 'T00:00:00Z').getUTCMonth() + 1;
            if (month >= 12 || month <= 2) {
                season = 'winter';
            }
            else if (month >= 6 && month <= 8) {
                season = 'summer';
            }
            else {
                season = 'shoulder';
            }
        }
        const isTightSchedule = state.context.durationDays <= 3;
        const hasTightConnections = false;
        return {
            traveler: {
                nationality: 'CN',
                budgetLevel: ((_a = state.context.budget) === null || _a === void 0 ? void 0 : _a.style) || 'medium',
                riskTolerance: state.context.preferences.riskTolerance || 'medium',
                relianceOnPhone: true,
            },
            trip: {
                startDate,
                endDate,
            },
            itinerary: {
                countries: [destination],
                activities: Array.from(activitySet).length > 0 ? Array.from(activitySet) : undefined,
                season,
                isTightSchedule,
                hasTightConnections,
            },
        };
    }
    generateDisclaimer(findings, lang = 'en') {
        const dataSources = [];
        const lastReviewedDates = [];
        const userActionRequired = [];
        for (const finding of findings) {
            dataSources.push(finding.packId);
            if (finding.packVersion) {
            }
        }
        for (const finding of findings) {
            for (const item of [...finding.blockers, ...finding.must]) {
                if (item.category === 'entry_transit') {
                    if (lang === 'zh') {
                        userActionRequired.push('签证要求');
                    }
                    else {
                        userActionRequired.push('Visa requirements');
                    }
                }
                if (item.category === 'health_insurance') {
                    if (lang === 'zh') {
                        userActionRequired.push('保险覆盖范围');
                    }
                    else {
                        userActionRequired.push('Insurance coverage');
                    }
                }
            }
        }
        const uniqueUserActions = Array.from(new Set(userActionRequired));
        const message = lang === 'zh'
            ? '本检查结果仅供参考，实际要求以官方机构（如大使馆、移民局、旅游局）的最新政策为准。建议在出发前再次确认关键信息（如签证、保险、健康证明等）。'
            : 'This readiness check result is for reference only. Actual requirements are subject to the latest policies from official authorities (e.g., embassies, immigration offices, tourism boards). Please reconfirm critical information (e.g., visas, insurance, health certificates) before departure.';
        return {
            message,
            dataSources: dataSources.length > 0 ? dataSources : undefined,
            userActionRequired: uniqueUserActions.length > 0 ? uniqueUserActions : undefined,
        };
    }
    async checkFromPacks(packs, context, lang = 'en') {
        const result = await this.readinessChecker.checkMultipleDestinations(packs, context, lang);
        return {
            ...result,
            disclaimer: this.generateDisclaimer(result.findings, lang),
        };
    }
    async checkFromPackIds(packIds, context) {
        const packs = [];
        for (const id of packIds) {
            const pack = await this.packStorage.loadPack(id);
            if (pack) {
                packs.push(pack);
            }
        }
        if (packs.length === 0) {
            this.logger.warn(`No packs loaded from ids: ${packIds.join(', ')}`);
        }
        return this.readinessChecker.checkMultipleDestinations(packs, context);
    }
    async checkFromDestination(destinationId, context, options) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        let enhancedContext = context;
        if ((options === null || options === void 0 ? void 0 : options.enhanceWithGeo) && (options === null || options === void 0 ? void 0 : options.geoLat) && (options === null || options === void 0 ? void 0 : options.geoLng) && this.geoFactsService) {
            try {
                const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(options.geoLat, options.geoLng);
                enhancedContext = {
                    ...context,
                    geo: {
                        rivers: {
                            nearRiver: geoFeatures.rivers.nearRiver,
                            nearestRiverDistanceM: (_a = geoFeatures.rivers.nearestRiverDistanceM) !== null && _a !== void 0 ? _a : undefined,
                            riverCrossingCount: geoFeatures.rivers.riverCrossingCount,
                            riverDensityScore: geoFeatures.rivers.riverDensityScore,
                        },
                        mountains: {
                            inMountain: geoFeatures.mountains.inMountain,
                            mountainElevationAvg: (_b = geoFeatures.mountains.mountainElevationAvg) !== null && _b !== void 0 ? _b : undefined,
                            terrainComplexity: geoFeatures.terrainComplexity,
                        },
                        roads: {
                            nearRoad: geoFeatures.roads.nearRoad,
                            roadDensityScore: geoFeatures.roads.roadDensityScore,
                        },
                        coastlines: {
                            nearCoastline: geoFeatures.coastlines.nearCoastline,
                            isCoastalArea: geoFeatures.coastlines.isCoastalArea,
                        },
                        pois: {
                            topPickupPoints: geoFeatures.pois.topPickupPoints.map(p => ({
                                category: p.category,
                                score: p.score,
                            })),
                            hasHarbour: geoFeatures.pois.hasHarbour,
                            trailAccessPoints: geoFeatures.pois.trailAccessPoints.map(t => ({
                                poi_id: t.trailheadId,
                                category: 'TRAILHEAD',
                            })),
                            hasEVCharger: ((_c = geoFeatures.pois.supply) === null || _c === void 0 ? void 0 : _c.hasEVCharger) || false,
                            hasFerryTerminal: geoFeatures.pois.topPickupPoints.some(p => p.category === 'FERRY_TERMINAL' || p.category === 'PIER_DOCK'),
                        },
                        altitude_m: (_e = (_d = geoFeatures.pois.xizang) === null || _d === void 0 ? void 0 : _d.avgAltitudeM) !== null && _e !== void 0 ? _e : undefined,
                        fuelDensity: (_g = (_f = geoFeatures.pois.xizang) === null || _f === void 0 ? void 0 : _f.fuelDensity) !== null && _g !== void 0 ? _g : undefined,
                        checkpointCount: (_j = (_h = geoFeatures.pois.xizang) === null || _h === void 0 ? void 0 : _h.checkpointCount) !== null && _j !== void 0 ? _j : undefined,
                        mountainPassCount: (_l = (_k = geoFeatures.pois.xizang) === null || _k === void 0 ? void 0 : _k.mountainPassCount) !== null && _l !== void 0 ? _l : undefined,
                        oxygenStationCount: (_o = (_m = geoFeatures.pois.xizang) === null || _m === void 0 ? void 0 : _m.oxygenStationCount) !== null && _o !== void 0 ? _o : undefined,
                        latitude: options.geoLat,
                    },
                };
            }
            catch (error) {
                this.logger.warn(`Failed to enhance context with geo features: ${error}`);
            }
        }
        const lang = (options === null || options === void 0 ? void 0 : options.lang) || 'en';
        let pack = await this.packStorage.findPackByDestination(destinationId);
        if (pack) {
            this.logger.debug(`Found pack by exact destinationId: ${destinationId} -> ${pack.packId}`);
            const result = await this.readinessChecker.checkMultipleDestinations([pack], enhancedContext, lang);
            let trustMetrics;
            if (this.trustMetricsService) {
                try {
                    const tempResult = {
                        ...result,
                        disclaimer: this.generateDisclaimer(result.findings, lang),
                    };
                    trustMetrics = this.trustMetricsService.calculateTrustMetrics(tempResult, lang);
                }
                catch (error) {
                    this.logger.warn(`计算信任指标失败: ${error}`);
                }
            }
            return {
                ...result,
                disclaimer: this.generateDisclaimer(result.findings, lang),
                trustMetrics,
            };
        }
        const parts = destinationId.split('-');
        const countryCode = parts[0];
        const cityOrRegion = parts.slice(1).join('-');
        if (cityOrRegion) {
            pack = await this.packStorage.findPackByCity(cityOrRegion, countryCode);
            if (pack) {
                this.logger.debug(`Found pack by city: ${cityOrRegion} -> ${pack.packId}`);
                const result = await this.readinessChecker.checkMultipleDestinations([pack], enhancedContext, lang);
                let trustMetrics;
                if (this.trustMetricsService) {
                    try {
                        const tempResult = {
                            ...result,
                            disclaimer: this.generateDisclaimer(result.findings, lang),
                        };
                        trustMetrics = this.trustMetricsService.calculateTrustMetrics(tempResult, lang);
                    }
                    catch (error) {
                        this.logger.warn(`计算信任指标失败: ${error}`);
                    }
                }
                return {
                    ...result,
                    disclaimer: this.generateDisclaimer(result.findings, lang),
                    trustMetrics,
                };
            }
            const cityNameVariants = [
                cityOrRegion,
                cityOrRegion.charAt(0).toUpperCase() + cityOrRegion.slice(1).toLowerCase(),
                cityOrRegion.toLowerCase(),
                cityOrRegion.toUpperCase(),
            ];
            for (const variant of cityNameVariants) {
                pack = await this.packStorage.findPackByCity(variant, countryCode);
                if (pack) {
                    this.logger.debug(`Found pack by city variant: ${variant} -> ${pack.packId}`);
                    const result = await this.readinessChecker.checkMultipleDestinations([pack], enhancedContext, lang);
                    let trustMetrics;
                    if (this.trustMetricsService) {
                        try {
                            const tempResult = {
                                ...result,
                                disclaimer: this.generateDisclaimer(result.findings, lang),
                            };
                            trustMetrics = this.trustMetricsService.calculateTrustMetrics(tempResult, lang);
                        }
                        catch (error) {
                            this.logger.warn(`计算信任指标失败: ${error}`);
                        }
                    }
                    return {
                        ...result,
                        disclaimer: this.generateDisclaimer(result.findings, lang),
                        trustMetrics,
                    };
                }
            }
        }
        if (cityOrRegion) {
            const regionPacks = await this.packStorage.findPacksByRegion(cityOrRegion);
            if (regionPacks.length > 0) {
                this.logger.debug(`Found ${regionPacks.length} pack(s) by region: ${cityOrRegion}`);
                const result = await this.readinessChecker.checkMultipleDestinations(regionPacks, enhancedContext, lang);
                let trustMetrics;
                if (this.trustMetricsService) {
                    try {
                        const tempResult = {
                            ...result,
                            disclaimer: this.generateDisclaimer(result.findings, lang),
                        };
                        trustMetrics = this.trustMetricsService.calculateTrustMetrics(tempResult, lang);
                    }
                    catch (error) {
                        this.logger.warn(`计算信任指标失败: ${error}`);
                    }
                }
                return {
                    ...result,
                    disclaimer: this.generateDisclaimer(result.findings, lang),
                    trustMetrics,
                };
            }
            const regionVariants = [
                cityOrRegion,
                cityOrRegion.charAt(0).toUpperCase() + cityOrRegion.slice(1).toLowerCase(),
                cityOrRegion.toLowerCase(),
                cityOrRegion.toUpperCase(),
            ];
            for (const variant of regionVariants) {
                const variantPacks = await this.packStorage.findPacksByRegion(variant);
                if (variantPacks.length > 0) {
                    this.logger.debug(`Found ${variantPacks.length} pack(s) by region variant: ${variant}`);
                    const result = await this.readinessChecker.checkMultipleDestinations(variantPacks, enhancedContext, lang);
                    return {
                        ...result,
                        disclaimer: this.generateDisclaimer(result.findings, lang),
                    };
                }
            }
        }
        if ((options === null || options === void 0 ? void 0 : options.geoLat) && (options === null || options === void 0 ? void 0 : options.geoLng)) {
            pack = await this.packStorage.findNearestPack(options.geoLat, options.geoLng, 50);
            if (pack) {
                this.logger.debug(`Found pack by coordinates: (${options.geoLat}, ${options.geoLng}) -> ${pack.packId}`);
                const result = await this.readinessChecker.checkMultipleDestinations([pack], enhancedContext, lang);
                return {
                    ...result,
                    disclaimer: this.generateDisclaimer(result.findings, lang),
                };
            }
        }
        if (countryCode) {
            const packs = await this.packStorage.findPacksByCountry(countryCode);
            if (packs.length > 0) {
                this.logger.debug(`Found ${packs.length} pack(s) by country: ${countryCode}`);
                const result = await this.readinessChecker.checkMultipleDestinations(packs, enhancedContext, lang);
                let trustMetrics;
                if (this.trustMetricsService) {
                    try {
                        const tempResult = {
                            ...result,
                            disclaimer: this.generateDisclaimer(result.findings, lang),
                        };
                        trustMetrics = this.trustMetricsService.calculateTrustMetrics(tempResult, lang);
                    }
                    catch (error) {
                        this.logger.warn(`计算信任指标失败: ${error}`);
                    }
                }
                return {
                    ...result,
                    disclaimer: this.generateDisclaimer(result.findings, lang),
                    trustMetrics,
                };
            }
        }
        this.logger.warn(`No pack found for destination: ${destinationId}`);
        return {
            findings: [],
            summary: {
                totalBlockers: 0,
                totalMust: 0,
                totalShould: 0,
                totalOptional: 0,
                totalRisks: 0,
            },
            disclaimer: this.generateDisclaimer([], lang),
        };
    }
    async checkFromCountryFacts(countryCodes, context, lang = 'en') {
        const findings = [];
        for (const countryCode of countryCodes) {
            const profile = await this.prisma.countryProfile.findUnique({
                where: { isoCode: countryCode.toUpperCase() },
            });
            if (!profile) {
                this.logger.warn(`Country profile not found: ${countryCode}`);
                continue;
            }
            const facts = {
                isoCode: profile.isoCode,
                nameCN: profile.nameCN,
                nameEN: profile.nameEN || undefined,
                currencyCode: profile.currencyCode || undefined,
                currencyName: profile.currencyName || undefined,
                paymentType: profile.paymentType || undefined,
                paymentInfo: profile.paymentInfo,
                powerInfo: profile.powerInfo,
                emergency: profile.emergency,
                visaForCN: profile.visaForCN,
                exchangeRateToCNY: profile.exchangeRateToCNY || undefined,
                exchangeRateToUSD: profile.exchangeRateToUSD || undefined,
            };
            const finding = this.factsCompiler.compile(facts, context);
            findings.push(finding);
        }
        const summary = {
            totalBlockers: findings.reduce((sum, f) => sum + f.blockers.length, 0),
            totalMust: findings.reduce((sum, f) => sum + f.must.length, 0),
            totalShould: findings.reduce((sum, f) => sum + f.should.length, 0),
            totalOptional: findings.reduce((sum, f) => sum + f.optional.length, 0),
            totalRisks: findings.reduce((sum, f) => sum + f.risks.length, 0),
        };
        return {
            findings,
            summary,
            disclaimer: this.generateDisclaimer(findings, lang),
        };
    }
    async check(packs, countryCodes, context, lang = 'en') {
        const packFindings = await this.checkFromPacks(packs, context, lang);
        const factsFindings = await this.checkFromCountryFacts(countryCodes, context, lang);
        const allFindings = [...packFindings.findings, ...factsFindings.findings];
        const summary = {
            totalBlockers: allFindings.reduce((sum, f) => sum + f.blockers.length, 0),
            totalMust: allFindings.reduce((sum, f) => sum + f.must.length, 0),
            totalShould: allFindings.reduce((sum, f) => sum + f.should.length, 0),
            totalOptional: allFindings.reduce((sum, f) => sum + f.optional.length, 0),
            totalRisks: allFindings.reduce((sum, f) => sum + f.risks.length, 0),
        };
        let trustMetrics;
        if (this.trustMetricsService) {
            try {
                const tempResult = {
                    findings: allFindings,
                    summary,
                    disclaimer: this.generateDisclaimer(allFindings, lang),
                };
                trustMetrics = this.trustMetricsService.calculateTrustMetrics(tempResult, lang);
            }
            catch (error) {
                this.logger.warn(`计算信任指标失败: ${error}`);
            }
        }
        return {
            findings: allFindings,
            summary,
            disclaimer: this.generateDisclaimer(allFindings, lang),
            trustMetrics,
        };
    }
    async getConstraints(result) {
        return this.constraintsCompiler.compile(result);
    }
    async getTasks(result) {
        return this.constraintsCompiler.extractTasks(result);
    }
    async getGeoFactsForDestination(destinationId) {
        var _a, _b;
        const destinationCoords = {
            'IS': { lat: 64.9631, lng: -19.0208 },
            'CN-XZ': { lat: 29.6500, lng: 91.1000 },
            'NO': { lat: 60.4720, lng: 8.4689 },
            'NZ': { lat: -40.9006, lng: 174.8860 },
        };
        const coords = destinationCoords[destinationId];
        if (!coords || !this.geoFactsService) {
            return null;
        }
        try {
            const geoFeatures = await this.geoFactsService.getGeoFeaturesForPoint(coords.lat, coords.lng, {
                densityBufferKm: 50,
                poiRadiusKm: 100,
            });
            return {
                latitude: coords.lat,
                longitude: coords.lng,
                rivers: {
                    ...geoFeatures.rivers,
                    nearestRiverDistanceM: (_a = geoFeatures.rivers.nearestRiverDistanceM) !== null && _a !== void 0 ? _a : undefined,
                },
                mountains: {
                    ...geoFeatures.mountains,
                    mountainElevationAvg: (_b = geoFeatures.mountains.mountainElevationAvg) !== null && _b !== void 0 ? _b : undefined,
                },
                roads: geoFeatures.roads,
                coastlines: geoFeatures.coastlines,
                pois: geoFeatures.pois,
            };
        }
        catch (error) {
            this.logger.warn(`Failed to get geo facts for ${destinationId}: ${error.message}`);
            return null;
        }
    }
    mapCategoryToPersona(category) {
        switch (category) {
            case 'safety_critical':
            case 'safety_hazards':
            case 'entry_transit':
            case 'health_insurance':
                return 'ABU';
            case 'gear_packing':
            case 'activities_bookings':
                return 'DR_DRE';
            case 'logistics':
            case 'logistics_critical':
                return 'NEPTUNE';
            default:
                return 'ABU';
        }
    }
    generateDecisionLogEntries(result, requestId) {
        var _a, _b, _c, _d, _e, _f;
        const entries = [];
        const timestamp = new Date().toISOString();
        for (const finding of result.findings) {
            for (const blocker of finding.blockers) {
                const explanation = typeof blocker.message === 'string'
                    ? blocker.message
                    : ((_a = blocker.message) === null || _a === void 0 ? void 0 : _a.zh) || ((_b = blocker.message) === null || _b === void 0 ? void 0 : _b.en) || '';
                entries.push({
                    request_id: requestId,
                    step: 'GATE_EVAL',
                    actor: 'Gatekeeper',
                    inputs_summary: `准备度检查：规则 ${blocker.id} (${blocker.category})`,
                    outputs_summary: `BLOCK: ${explanation.substring(0, 100)}${explanation.length > 100 ? '...' : ''}`,
                    evidence_refs: ((_c = blocker.evidence) === null || _c === void 0 ? void 0 : _c.map((e) => e.sourceId)) || [],
                    timestamp,
                    metadata: {
                        ruleId: blocker.id,
                        category: blocker.category,
                        severity: blocker.severity,
                        level: blocker.level,
                        userDecision: blocker.userDecision,
                    },
                });
            }
            for (const must of finding.must) {
                const explanation = typeof must.message === 'string'
                    ? must.message
                    : ((_d = must.message) === null || _d === void 0 ? void 0 : _d.zh) || ((_e = must.message) === null || _e === void 0 ? void 0 : _e.en) || '';
                entries.push({
                    request_id: requestId,
                    step: 'GATE_EVAL',
                    actor: 'Gatekeeper',
                    inputs_summary: `准备度检查：规则 ${must.id} (${must.category})`,
                    outputs_summary: `ADJUST: ${explanation.substring(0, 100)}${explanation.length > 100 ? '...' : ''}`,
                    evidence_refs: ((_f = must.evidence) === null || _f === void 0 ? void 0 : _f.map((e) => e.sourceId)) || [],
                    timestamp,
                    metadata: {
                        ruleId: must.id,
                        category: must.category,
                        severity: must.severity,
                        level: must.level,
                        userDecision: must.userDecision,
                    },
                });
            }
        }
        return entries;
    }
};
exports.ReadinessService = ReadinessService;
exports.ReadinessService = ReadinessService = ReadinessService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(6, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        readiness_checker_1.ReadinessChecker,
        facts_to_readiness_compiler_1.FactsToReadinessCompiler,
        readiness_to_constraints_compiler_1.ReadinessToConstraintsCompiler,
        pack_storage_service_1.PackStorageService,
        geo_facts_service_1.GeoFactsService,
        trust_metrics_service_1.TrustMetricsService])
], ReadinessService);
//# sourceMappingURL=readiness.service.js.map
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
var PhysicalRealityRetrievalService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhysicalRealityRetrievalService = void 0;
const common_1 = require("@nestjs/common");
const chunk_retrieval_service_1 = require("../../../rag/services/chunk-retrieval.service");
const physical_reality_quality_monitor_service_1 = require("./physical-reality-quality-monitor.service");
let PhysicalRealityRetrievalService = PhysicalRealityRetrievalService_1 = class PhysicalRealityRetrievalService {
    constructor(chunkRetrievalService, qualityMonitor) {
        this.chunkRetrievalService = chunkRetrievalService;
        this.qualityMonitor = qualityMonitor;
        this.logger = new common_1.Logger(PhysicalRealityRetrievalService_1.name);
    }
    async retrievePhysicalRealityData(region, options) {
        if (!this.chunkRetrievalService) {
            this.logger.warn('ChunkRetrievalService not available, returning empty data');
            return {
                roadStates: [],
                ferryStates: [],
                weatherWindows: [],
            };
        }
        const limit = (options === null || options === void 0 ? void 0 : options.limit) || 20;
        const month = options === null || options === void 0 ? void 0 : options.month;
        const queries = this.buildQueries(region, month);
        const [roadResults, ferryResults, weatherResults] = await Promise.all([
            this.retrieveRoadStates(region, queries.roadQuery, limit),
            this.retrieveFerryStates(region, queries.ferryQuery, limit),
            this.retrieveWeatherWindows(region, queries.weatherQuery, limit),
        ]);
        return {
            roadStates: roadResults,
            ferryStates: ferryResults,
            weatherWindows: weatherResults,
        };
    }
    buildQueries(region, month) {
        const regionNames = {
            iceland: '冰岛',
            alps: '阿尔卑斯',
            greenland: '格陵兰',
            svalbard: '斯瓦尔巴',
            'faroe-islands': '法罗群岛',
            argentina: '阿根廷',
            lofoten: '罗弗敦群岛',
            'new-zealand-south-island': '新西兰南岛',
        };
        const regionName = regionNames[region] || region;
        let roadQuery = `${regionName} 道路状态 F-road 开放 季节性`;
        let ferryQuery = `${regionName} 渡轮 时刻表 班次`;
        let weatherQuery = `${regionName} 天气 最佳旅行时间 天气窗口`;
        if (month) {
            const monthNames = ['', '1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
            const monthName = monthNames[month];
            roadQuery += ` ${monthName}`;
            ferryQuery += ` ${monthName}`;
            weatherQuery += ` ${monthName}`;
        }
        return { roadQuery, ferryQuery, weatherQuery };
    }
    async retrieveRoadStates(region, query, limit) {
        var _a, _b;
        if (!this.chunkRetrievalService) {
            return [];
        }
        const startTime = Date.now();
        try {
            const results = await this.chunkRetrievalService.retrieve({
                query,
                limit,
                type: 'road_status',
                useHybridSearch: true,
                useReranking: false,
            });
            const latency = Date.now() - startTime;
            (_a = this.qualityMonitor) === null || _a === void 0 ? void 0 : _a.recordRetrieval(latency, true);
            return results
                .map((result) => this.parseRoadState(result))
                .filter((state) => state !== null);
        }
        catch (error) {
            const latency = Date.now() - startTime;
            (_b = this.qualityMonitor) === null || _b === void 0 ? void 0 : _b.recordRetrieval(latency, false);
            this.logger.error(`Failed to retrieve road states for ${region}:`, error);
            return [];
        }
    }
    async retrieveFerryStates(region, query, limit) {
        var _a, _b;
        if (!this.chunkRetrievalService) {
            return [];
        }
        const startTime = Date.now();
        try {
            const results = await this.chunkRetrievalService.retrieve({
                query,
                limit,
                type: 'ferry_schedules',
                useHybridSearch: true,
                useReranking: false,
            });
            const latency = Date.now() - startTime;
            (_a = this.qualityMonitor) === null || _a === void 0 ? void 0 : _a.recordRetrieval(latency, true);
            return results
                .map((result) => this.parseFerryState(result))
                .filter((state) => state !== null);
        }
        catch (error) {
            const latency = Date.now() - startTime;
            (_b = this.qualityMonitor) === null || _b === void 0 ? void 0 : _b.recordRetrieval(latency, false);
            this.logger.error(`Failed to retrieve ferry states for ${region}:`, error);
            return [];
        }
    }
    async retrieveWeatherWindows(region, query, limit) {
        var _a, _b;
        if (!this.chunkRetrievalService) {
            return [];
        }
        const startTime = Date.now();
        try {
            const results = await this.chunkRetrievalService.retrieve({
                query,
                limit,
                type: 'weather_windows',
                useHybridSearch: true,
                useReranking: false,
            });
            const latency = Date.now() - startTime;
            (_a = this.qualityMonitor) === null || _a === void 0 ? void 0 : _a.recordRetrieval(latency, true);
            return results
                .map((result) => this.parseWeatherWindow(result))
                .filter((window) => window !== null);
        }
        catch (error) {
            const latency = Date.now() - startTime;
            (_b = this.qualityMonitor) === null || _b === void 0 ? void 0 : _b.recordRetrieval(latency, false);
            this.logger.error(`Failed to retrieve weather windows for ${region}:`, error);
            return [];
        }
    }
    parseRoadState(result) {
        try {
            const metadata = result.metadata || {};
            const content = result.content || '';
            const roadId = metadata.roadId;
            if (!roadId) {
                const extractedId = this.extractRoadId(content);
                if (!extractedId) {
                    this.logger.debug(`Skipping road state: no roadId found in metadata or content`);
                    return null;
                }
            }
            const roadName = this.extractRoadName(content) || roadId;
            const status = this.extractRoadStatus(content, metadata);
            const seasonMonths = this.extractSeasonMonths(content);
            const seasonOpenFrom = (seasonMonths === null || seasonMonths === void 0 ? void 0 : seasonMonths.from) || metadata.seasonOpenFrom;
            const seasonOpenTo = (seasonMonths === null || seasonMonths === void 0 ? void 0 : seasonMonths.to) || metadata.seasonOpenTo;
            const requires4x4 = this.extractRequires4x4(content, metadata);
            const hazards = this.extractHazards(content, metadata);
            const coordinatesRaw = metadata.coordinates || this.extractCoordinates(content, metadata);
            const coordinates = coordinatesRaw && 'start' in coordinatesRaw
                ? coordinatesRaw
                : coordinatesRaw && 'center' in coordinatesRaw
                    ? undefined
                    : undefined;
            return {
                roadId: roadId || this.extractRoadId(content),
                roadName,
                status,
                seasonOpenFrom,
                seasonOpenTo,
                requires4x4,
                hazards,
                coordinates,
                metadata: {
                    ...metadata,
                    sourceFile: result.sourceFile,
                    similarity: result.similarity,
                },
            };
        }
        catch (error) {
            this.logger.warn(`Failed to parse road state:`, error);
            return null;
        }
    }
    parseFerryState(result) {
        try {
            const metadata = result.metadata || {};
            const content = result.content || '';
            const routeId = metadata.routeId || this.extractRouteId(content);
            const routeName = this.extractRouteName(content);
            if (!routeId) {
                return null;
            }
            return {
                routeId,
                routeName: routeName || routeId,
                from: this.extractFromPort(content, metadata),
                to: this.extractToPort(content, metadata),
                status: this.extractFerryStatus(content, metadata),
                seasonOpenFrom: this.extractSeasonOpenFrom(content, metadata),
                seasonOpenTo: this.extractSeasonOpenTo(content, metadata),
                schedule: this.extractSchedule(content, metadata),
                booking: this.extractBooking(content, metadata),
                metadata: {
                    ...metadata,
                    sourceFile: result.sourceFile,
                    similarity: result.similarity,
                },
            };
        }
        catch (error) {
            this.logger.warn(`Failed to parse ferry state:`, error);
            return null;
        }
    }
    parseWeatherWindow(result) {
        try {
            const metadata = result.metadata || {};
            const content = result.content || '';
            const regionId = metadata.regionId || this.extractRegionId(content);
            const regionName = this.extractRegionName(content);
            if (!regionId) {
                return null;
            }
            const coordinatesRaw = this.extractCoordinates(content, metadata);
            const weatherCoordinates = coordinatesRaw && 'center' in coordinatesRaw
                ? coordinatesRaw
                : coordinatesRaw && 'start' in coordinatesRaw
                    ? { center: { lat: (coordinatesRaw.start.lat + coordinatesRaw.end.lat) / 2, lng: (coordinatesRaw.start.lng + coordinatesRaw.end.lng) / 2 } }
                    : undefined;
            return {
                regionId,
                regionName: regionName || regionId,
                bestWindows: this.extractBestWindows(content, metadata),
                riskLevels: this.extractRiskLevels(content, metadata),
                extremeEvents: this.extractExtremeEvents(content, metadata),
                coordinates: weatherCoordinates,
                metadata: {
                    ...metadata,
                    sourceFile: result.sourceFile,
                    similarity: result.similarity,
                },
            };
        }
        catch (error) {
            this.logger.warn(`Failed to parse weather window:`, error);
            return null;
        }
    }
    extractRoadId(content) {
        const patterns = [
            /道路ID[:\s]+([^\n]+)/i,
            /roadId[:\s]+([^\n\s]+)/i,
            /F-?(\d+)/i,
        ];
        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        return null;
    }
    extractRoadName(content) {
        const patterns = [
            /道路名称[:\s]+([^\n]+)/i,
            /道路名称（英文）[:\s]+([^\n]+)/i,
            /roadName[:\s]+([^\n]+)/i,
        ];
        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        return null;
    }
    extractRoadStatus(content, metadata) {
        const statusLower = content.toLowerCase();
        if (statusLower.includes('当前状态: closed') || statusLower.includes('currentstatus: closed')) {
            return 'CLOSED';
        }
        if (statusLower.includes('当前状态: open') || statusLower.includes('currentstatus: open')) {
            if (statusLower.includes('seasonal') || statusLower.includes('季节性') || statusLower.includes('开放季节')) {
                return 'SEASONAL';
            }
            return 'OPEN';
        }
        if (statusLower.includes('状态: closed') || statusLower.includes('status: closed')) {
            return 'CLOSED';
        }
        if (statusLower.includes('状态: seasonal') || statusLower.includes('状态: 季节性')) {
            return 'SEASONAL';
        }
        if (statusLower.includes('状态: restricted') || statusLower.includes('状态: 限制')) {
            return 'RESTRICTED';
        }
        if (statusLower.includes('状态: open') || statusLower.includes('状态: 开放')) {
            return 'OPEN';
        }
        if (statusLower.includes('closed') || statusLower.includes('关闭'))
            return 'CLOSED';
        if (statusLower.includes('seasonal') || statusLower.includes('季节性') || statusLower.includes('开放季节'))
            return 'SEASONAL';
        if (statusLower.includes('restricted') || statusLower.includes('限制'))
            return 'RESTRICTED';
        return 'OPEN';
    }
    extractSeasonMonths(content) {
        const patterns = [
            /开放季节[:\s]+[^（]*（(\d+)[-–](\d+)月）/i,
            /openMonths[:\s]*\[[\s]*(\d+)[\s,]*[\s,]*(\d+)/i,
            /开放月份[:\s]*(\d+)[-–](\d+)/i,
        ];
        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
                const from = parseInt(match[1]);
                const to = parseInt(match[2]);
                if (from >= 1 && from <= 12 && to >= 1 && to <= 12) {
                    return { from, to };
                }
            }
        }
        const monthArrayMatch = content.match(/\[[\s]*(\d+)[\s,]+(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
        if (monthArrayMatch) {
            const months = [
                parseInt(monthArrayMatch[1]),
                parseInt(monthArrayMatch[2]),
                parseInt(monthArrayMatch[3]),
                parseInt(monthArrayMatch[4]),
            ].filter(m => m >= 1 && m <= 12);
            if (months.length >= 2) {
                return { from: Math.min(...months), to: Math.max(...months) };
            }
        }
        return null;
    }
    extractSeasonOpenFrom(content, metadata) {
        const seasonMonths = this.extractSeasonMonths(content);
        return (seasonMonths === null || seasonMonths === void 0 ? void 0 : seasonMonths.from) || metadata.seasonOpenFrom;
    }
    extractSeasonOpenTo(content, metadata) {
        const seasonMonths = this.extractSeasonMonths(content);
        return (seasonMonths === null || seasonMonths === void 0 ? void 0 : seasonMonths.to) || metadata.seasonOpenTo;
    }
    extractRequires4x4(content, metadata) {
        const contentLower = content.toLowerCase();
        return (contentLower.includes('4x4') ||
            contentLower.includes('四驱') ||
            contentLower.includes('越野') ||
            contentLower.includes('需要4x4') ||
            contentLower.includes('必须4x4') ||
            contentLower.includes('vehicletype: 4x4') ||
            contentLower.includes('车辆类型: 4x4'));
    }
    extractHazards(content, metadata) {
        if (metadata.hazards && Array.isArray(metadata.hazards)) {
            return metadata.hazards.map((h) => ({
                type: h.type || 'unknown',
                severity: h.severity || 'medium',
                description: h.description || '',
            }));
        }
        const hazards = [];
        const hazardLines = content.match(/危险[:\s]*\n((?:  [^\n]+\n?)+)/i);
        if (hazardLines) {
            const lines = hazardLines[1].split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) {
                    const parts = trimmed.split(':');
                    if (parts.length >= 2) {
                        hazards.push({
                            type: parts[0].trim(),
                            severity: parts[1].includes('high') || parts[1].includes('高') ? 'high' : 'medium',
                            description: parts.slice(1).join(':').trim(),
                        });
                    }
                }
            }
        }
        return hazards.length > 0 ? hazards : undefined;
    }
    extractCoordinates(content, metadata) {
        if (metadata.coordinates) {
            if (metadata.coordinates.start && metadata.coordinates.end) {
                return metadata.coordinates;
            }
            if (metadata.coordinates.center) {
                return metadata.coordinates;
            }
        }
        return undefined;
    }
    extractRouteId(content) {
        const patterns = [
            /路线ID[:\s]+([^\n]+)/i,
            /routeId[:\s]+([^\n\s]+)/i,
        ];
        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        return null;
    }
    extractRouteName(content) {
        const patterns = [
            /路线名称[:\s]+([^\n]+)/i,
            /路线名称（英文）[:\s]+([^\n]+)/i,
            /routeName[:\s]+([^\n]+)/i,
        ];
        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        return null;
    }
    extractFromPort(content, metadata) {
        if (metadata.from) {
            return {
                name: metadata.from.name || '',
                coordinates: metadata.from.coordinates || { lat: 0, lng: 0 },
            };
        }
        const fromMatch = content.match(/出发港口[:\s]+([^\n]+)/i);
        const name = fromMatch ? fromMatch[1].trim() : '';
        return {
            name,
            coordinates: { lat: 0, lng: 0 },
        };
    }
    extractToPort(content, metadata) {
        if (metadata.to) {
            return {
                name: metadata.to.name || '',
                coordinates: metadata.to.coordinates || { lat: 0, lng: 0 },
            };
        }
        const toMatch = content.match(/到达港口[:\s]+([^\n]+)/i);
        const name = toMatch ? toMatch[1].trim() : '';
        return {
            name,
            coordinates: { lat: 0, lng: 0 },
        };
    }
    extractFerryStatus(content, metadata) {
        const contentLower = content.toLowerCase();
        if (contentLower.includes('cancelled') || contentLower.includes('取消') || contentLower.includes('停运')) {
            return 'CANCELLED';
        }
        if (contentLower.includes('seasonal') || contentLower.includes('季节性') || contentLower.includes('夏季时刻表') || contentLower.includes('冬季时刻表')) {
            return 'SEASONAL';
        }
        return 'RUNNING';
    }
    extractSchedule(content, metadata) {
        if (metadata.schedule) {
            return metadata.schedule;
        }
        const schedule = {};
        const summerMatch = content.match(/夏季时刻表[:\s]+([^\n]+)/i);
        if (summerMatch) {
            schedule.summer = {
                frequency: summerMatch[1].trim(),
                sailings: [],
            };
        }
        const winterMatch = content.match(/冬季时刻表[:\s]+([^\n]+)/i);
        if (winterMatch) {
            schedule.winter = {
                frequency: winterMatch[1].trim(),
                sailings: [],
            };
        }
        return Object.keys(schedule).length > 0 ? schedule : undefined;
    }
    extractBooking(content, metadata) {
        if (metadata.booking) {
            return {
                required: metadata.booking.required || false,
                recommended: metadata.booking.recommended || false,
            };
        }
        const contentLower = content.toLowerCase();
        const required = contentLower.includes('需要预订: 是') || contentLower.includes('required: true');
        const recommended = contentLower.includes('建议预订: 是') || contentLower.includes('recommended: true');
        if (required || recommended) {
            return { required, recommended };
        }
        return undefined;
    }
    extractRegionId(content) {
        const patterns = [
            /区域ID[:\s]+([^\n]+)/i,
            /regionId[:\s]+([^\n\s]+)/i,
        ];
        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        return null;
    }
    extractRegionName(content) {
        const patterns = [
            /区域名称[:\s]+([^\n]+)/i,
            /区域名称（英文）[:\s]+([^\n]+)/i,
            /regionName[:\s]+([^\n]+)/i,
        ];
        for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        return null;
    }
    extractBestWindows(content, metadata) {
        if (metadata.bestWindows && Array.isArray(metadata.bestWindows)) {
            return metadata.bestWindows;
        }
        const windows = [];
        const windowMatches = content.match(/最佳旅行窗口[:\s]*\n((?:  [^\n]+\n?)+)/i);
        if (windowMatches) {
            const lines = windowMatches[1].split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) {
                    const periodMatch = trimmed.match(/([^（]+)（(\d+)[-–](\d+)月）[:\s]+(.+)/);
                    if (periodMatch) {
                        const from = parseInt(periodMatch[2]);
                        const to = parseInt(periodMatch[3]);
                        const months = [];
                        for (let m = from; m <= to; m++) {
                            months.push(m);
                        }
                        windows.push({
                            months,
                            period: periodMatch[1].trim(),
                            description: periodMatch[4].trim(),
                        });
                    }
                }
            }
        }
        return windows.length > 0 ? windows : undefined;
    }
    extractRiskLevels(content, metadata) {
        if (metadata.riskLevels && Array.isArray(metadata.riskLevels)) {
            return metadata.riskLevels;
        }
        return undefined;
    }
    extractExtremeEvents(content, metadata) {
        if (metadata.extremeEvents && Array.isArray(metadata.extremeEvents)) {
            return metadata.extremeEvents;
        }
        return undefined;
    }
};
exports.PhysicalRealityRetrievalService = PhysicalRealityRetrievalService;
exports.PhysicalRealityRetrievalService = PhysicalRealityRetrievalService = PhysicalRealityRetrievalService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [chunk_retrieval_service_1.ChunkRetrievalService,
        physical_reality_quality_monitor_service_1.PhysicalRealityQualityMonitorService])
], PhysicalRealityRetrievalService);
//# sourceMappingURL=physical-reality-retrieval.service.js.map
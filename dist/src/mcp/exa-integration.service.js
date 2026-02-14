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
var ExaIntegrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExaIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const exa_service_1 = require("./exa.service");
const redis_service_1 = require("../redis/redis.service");
const exa_monitoring_service_1 = require("./exa-monitoring.service");
let ExaIntegrationService = ExaIntegrationService_1 = class ExaIntegrationService {
    constructor(exaService, redisService, monitoring) {
        this.exaService = exaService;
        this.redisService = redisService;
        this.monitoring = monitoring;
        this.logger = new common_1.Logger(ExaIntegrationService_1.name);
        if (!exaService) {
            this.logger.warn('ExaService not available, Exa integration will be disabled');
        }
    }
    async searchRealTimeRisks(countryCode, routeName, month, year = new Date().getFullYear()) {
        var _a, _b, _c;
        if (!this.exaService) {
            this.logger.debug('ExaService not available, skipping real-time risk search');
            return { hasRisk: false };
        }
        const cacheKey = `exa:risk:${countryCode}:${routeName}:${month}:${year}`;
        if (this.redisService) {
            try {
                const cached = await this.redisService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`Using cached risk info for ${countryCode} ${routeName}`);
                    return JSON.parse(cached);
                }
            }
            catch (error) {
                this.logger.warn('Failed to get cached risk info:', error);
            }
        }
        const startTime = Date.now();
        try {
            const query = this.buildRiskSearchQuery(countryCode, routeName, month, year);
            const result = await this.exaService.webSearch(query, {
                numResults: 5,
                useAutoprompt: true,
            });
            const responseTime = Date.now() - startTime;
            await ((_a = this.monitoring) === null || _a === void 0 ? void 0 : _a.recordCall({
                timestamp: Date.now(),
                toolName: 'web_search_exa',
                success: true,
                responseTime,
                resultCount: ((_b = result === null || result === void 0 ? void 0 : result.content) === null || _b === void 0 ? void 0 : _b.length) || 0,
            }));
            const riskInfo = this.parseRiskSearchResult(result, countryCode, routeName, month);
            if (this.redisService && riskInfo.hasRisk) {
                try {
                    await this.redisService.set(cacheKey, JSON.stringify(riskInfo), 3600);
                }
                catch (error) {
                    this.logger.warn('Failed to cache risk info:', error);
                }
            }
            return riskInfo;
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            await ((_c = this.monitoring) === null || _c === void 0 ? void 0 : _c.recordCall({
                timestamp: Date.now(),
                toolName: 'web_search_exa',
                success: false,
                responseTime,
                error: error.message,
            }));
            this.logger.warn(`Exa risk search failed: ${error.message}, falling back to structured data`);
            return { hasRisk: false };
        }
    }
    async searchDestinationStatus(destination, category, month, year = new Date().getFullYear()) {
        if (!this.exaService) {
            this.logger.debug('ExaService not available, skipping destination status search');
            return { isOpen: true };
        }
        const cacheKey = `exa:destination:${destination}:${category}:${month}:${year}`;
        if (this.redisService) {
            try {
                const cached = await this.redisService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`Using cached destination status for ${destination}`);
                    return JSON.parse(cached);
                }
            }
            catch (error) {
                this.logger.warn('Failed to get cached destination status:', error);
            }
        }
        try {
            const query = `${destination} ${category} ${year}年${month}月 开放 状态`;
            const result = await this.exaService.webSearch(query, {
                numResults: 3,
                useAutoprompt: true,
            });
            const statusInfo = this.parseDestinationStatusResult(result);
            if (this.redisService) {
                try {
                    await this.redisService.set(cacheKey, JSON.stringify(statusInfo), 21600);
                }
                catch (error) {
                    this.logger.warn('Failed to cache destination status:', error);
                }
            }
            return statusInfo;
        }
        catch (error) {
            this.logger.warn(`Exa destination status search failed: ${error.message}`);
            return { isOpen: true };
        }
    }
    buildRiskSearchQuery(countryCode, routeName, month, year) {
        const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        const monthName = monthNames[month - 1];
        return `${countryCode} ${routeName} ${year}年${monthName} 封闭 风险 安全 禁止通行`;
    }
    parseRiskSearchResult(result, countryCode, routeName, month) {
        if (!result || !result.content || !result.content[0]) {
            return { hasRisk: false };
        }
        const content = result.content[0];
        if (content.type !== 'text') {
            return { hasRisk: false };
        }
        let text;
        try {
            const parsed = JSON.parse(content.text);
            if (parsed.results && parsed.results.length > 0) {
                text = parsed.results.map((r) => r.text || r.title || '').join(' ');
            }
            else {
                text = content.text;
            }
        }
        catch {
            text = content.text;
        }
        const lowerText = text.toLowerCase();
        const riskKeywords = {
            ROAD_CLOSED: ['封闭', '关闭', '禁止通行', '封路', 'closed', 'blocked'],
            WEATHER: ['暴雪', '洪水', '台风', '极端天气', 'blizzard', 'flood', 'storm'],
            GEOLOGICAL: ['地震', '山体滑坡', '地质灾害', 'earthquake', 'landslide'],
            POLITICAL: ['抗议', '冲突', '安全事件', 'protest', 'conflict'],
            TRANSPORT: ['维修', '事故', '中断', 'maintenance', 'accident'],
        };
        for (const [riskType, keywords] of Object.entries(riskKeywords)) {
            if (keywords.some(keyword => lowerText.includes(keyword))) {
                return {
                    hasRisk: true,
                    riskType: riskType,
                    riskDescription: this.extractRiskDescription(text, keywords),
                    confidence: 'MEDIUM',
                };
            }
        }
        return { hasRisk: false };
    }
    extractRiskDescription(text, keywords) {
        const sentences = text.split(/[。！？\n]/);
        for (const sentence of sentences) {
            if (keywords.some(keyword => sentence.toLowerCase().includes(keyword))) {
                return sentence.trim().substring(0, 200);
            }
        }
        return text.substring(0, 200);
    }
    async searchDeepRisks(countryCode, routeName, month, year = new Date().getFullYear()) {
        var _a, _b, _c;
        if (!this.exaService) {
            this.logger.debug('ExaService not available, skipping deep risk search');
            return { hasRisk: false };
        }
        const cacheKey = `exa:deeprisk:${countryCode}:${routeName}:${month}:${year}`;
        if (this.redisService) {
            try {
                const cached = await this.redisService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`Using cached deep risk info for ${countryCode} ${routeName}`);
                    return JSON.parse(cached);
                }
            }
            catch (error) {
                this.logger.warn('Failed to get cached deep risk info:', error);
            }
        }
        const startTime = Date.now();
        try {
            const query = this.buildRiskSearchQuery(countryCode, routeName, month, year);
            const result = await this.exaService.deepSearch(query, {
                numResults: 10,
            });
            const responseTime = Date.now() - startTime;
            await ((_a = this.monitoring) === null || _a === void 0 ? void 0 : _a.recordCall({
                timestamp: Date.now(),
                toolName: 'deep_search_exa',
                success: true,
                responseTime,
                resultCount: ((_b = result === null || result === void 0 ? void 0 : result.content) === null || _b === void 0 ? void 0 : _b.length) || 0,
            }));
            const riskInfo = this.parseRiskSearchResult(result, countryCode, routeName, month);
            if (this.redisService && riskInfo.hasRisk) {
                try {
                    await this.redisService.set(cacheKey, JSON.stringify(riskInfo), 21600);
                }
                catch (error) {
                    this.logger.warn('Failed to cache deep risk info:', error);
                }
            }
            return riskInfo;
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            await ((_c = this.monitoring) === null || _c === void 0 ? void 0 : _c.recordCall({
                timestamp: Date.now(),
                toolName: 'deep_search_exa',
                success: false,
                responseTime,
                error: error.message,
            }));
            this.logger.warn(`Exa deep risk search failed: ${error.message}`);
            return { hasRisk: false };
        }
    }
    async searchAlternativeDestinations(destination, category, month, year = new Date().getFullYear()) {
        var _a, _b, _c;
        if (!this.exaService) {
            this.logger.debug('ExaService not available, skipping alternative search');
            return { alternatives: [] };
        }
        const cacheKey = `exa:alternatives:${destination}:${category}:${month}:${year}`;
        if (this.redisService) {
            try {
                const cached = await this.redisService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`Using cached alternatives for ${destination}`);
                    return JSON.parse(cached);
                }
            }
            catch (error) {
                this.logger.warn('Failed to get cached alternatives:', error);
            }
        }
        const startTime = Date.now();
        try {
            const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
            const monthName = monthNames[month - 1];
            const query = `${destination} ${category} ${year}年${monthName} 替代 推荐 类似`;
            const result = await this.exaService.webSearch(query, {
                numResults: 5,
                useAutoprompt: true,
            });
            const responseTime = Date.now() - startTime;
            await ((_a = this.monitoring) === null || _a === void 0 ? void 0 : _a.recordCall({
                timestamp: Date.now(),
                toolName: 'web_search_exa',
                success: true,
                responseTime,
                resultCount: ((_b = result === null || result === void 0 ? void 0 : result.content) === null || _b === void 0 ? void 0 : _b.length) || 0,
            }));
            const alternatives = this.parseAlternativesResult(result);
            if (this.redisService && alternatives.alternatives.length > 0) {
                try {
                    await this.redisService.set(cacheKey, JSON.stringify(alternatives), 43200);
                }
                catch (error) {
                    this.logger.warn('Failed to cache alternatives:', error);
                }
            }
            return alternatives;
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            await ((_c = this.monitoring) === null || _c === void 0 ? void 0 : _c.recordCall({
                timestamp: Date.now(),
                toolName: 'web_search_exa',
                success: false,
                responseTime,
                error: error.message,
            }));
            this.logger.warn(`Exa alternative search failed: ${error.message}`);
            return { alternatives: [] };
        }
    }
    async crawlOfficialPage(url, purpose = 'official information') {
        var _a, _b, _c;
        if (!this.exaService) {
            this.logger.debug('ExaService not available, skipping crawl');
            return { content: '', success: false };
        }
        const cacheKey = `exa:crawl:${Buffer.from(url).toString('base64').substring(0, 50)}`;
        if (this.redisService) {
            try {
                const cached = await this.redisService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`Using cached crawl result for ${url}`);
                    return JSON.parse(cached);
                }
            }
            catch (error) {
                this.logger.warn('Failed to get cached crawl result:', error);
            }
        }
        const startTime = Date.now();
        try {
            const result = await this.exaService.crawlUrl(url, {
                text: true,
                markdown: true,
            });
            let content = '';
            if (result && result.content) {
                for (const item of result.content) {
                    if (item.type === 'text') {
                        content += item.text + '\n';
                    }
                }
            }
            const responseTime = Date.now() - startTime;
            await ((_a = this.monitoring) === null || _a === void 0 ? void 0 : _a.recordCall({
                timestamp: Date.now(),
                toolName: 'crawling_exa',
                success: content.length > 0,
                responseTime,
                resultCount: ((_b = result === null || result === void 0 ? void 0 : result.content) === null || _b === void 0 ? void 0 : _b.length) || 0,
            }));
            const crawlResult = {
                content: content.trim(),
                success: content.length > 0,
            };
            if (this.redisService && crawlResult.success) {
                try {
                    await this.redisService.set(cacheKey, JSON.stringify(crawlResult), 86400);
                }
                catch (error) {
                    this.logger.warn('Failed to cache crawl result:', error);
                }
            }
            return crawlResult;
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            await ((_c = this.monitoring) === null || _c === void 0 ? void 0 : _c.recordCall({
                timestamp: Date.now(),
                toolName: 'crawling_exa',
                success: false,
                responseTime,
                error: error.message,
            }));
            this.logger.warn(`Exa crawl failed for ${url}: ${error.message}`);
            return { content: '', success: false };
        }
    }
    async startDeepResearch(topic, reportType) {
        var _a, _b;
        if (!this.exaService) {
            this.logger.debug('ExaService not available, skipping deep research');
            return { researchId: '', status: 'failed' };
        }
        const startTime = Date.now();
        try {
            const result = await this.exaService.deepResearcherStart(topic, {
                reportType,
                numResults: 20,
            });
            const responseTime = Date.now() - startTime;
            await ((_a = this.monitoring) === null || _a === void 0 ? void 0 : _a.recordCall({
                timestamp: Date.now(),
                toolName: 'deep_researcher_start',
                success: true,
                responseTime,
            }));
            const researchId = (result === null || result === void 0 ? void 0 : result.researchId) || (result === null || result === void 0 ? void 0 : result.id) || `research_${Date.now()}`;
            return {
                researchId,
                status: 'started',
            };
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            await ((_b = this.monitoring) === null || _b === void 0 ? void 0 : _b.recordCall({
                timestamp: Date.now(),
                toolName: 'deep_researcher_start',
                success: false,
                responseTime,
                error: error.message,
            }));
            this.logger.warn(`Exa deep research start failed: ${error.message}`);
            return { researchId: '', status: 'failed' };
        }
    }
    async checkDeepResearch(researchId) {
        var _a, _b;
        if (!this.exaService) {
            this.logger.debug('ExaService not available, skipping research check');
            return { status: 'failed' };
        }
        const startTime = Date.now();
        try {
            const result = await this.exaService.deepResearcherCheck(researchId);
            const status = (result === null || result === void 0 ? void 0 : result.status) || 'in_progress';
            let report = '';
            if (status === 'completed' && (result === null || result === void 0 ? void 0 : result.report)) {
                if (typeof result.report === 'string') {
                    report = result.report;
                }
                else if (result.report.content) {
                    for (const item of result.report.content) {
                        if (item.type === 'text') {
                            report += item.text + '\n';
                        }
                    }
                }
            }
            const responseTime = Date.now() - startTime;
            await ((_a = this.monitoring) === null || _a === void 0 ? void 0 : _a.recordCall({
                timestamp: Date.now(),
                toolName: 'deep_researcher_check',
                success: status !== 'failed',
                responseTime,
                resultCount: report.length > 0 ? 1 : 0,
            }));
            return {
                status: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : 'in_progress',
                report: report.trim() || undefined,
            };
        }
        catch (error) {
            const responseTime = Date.now() - startTime;
            await ((_b = this.monitoring) === null || _b === void 0 ? void 0 : _b.recordCall({
                timestamp: Date.now(),
                toolName: 'deep_researcher_check',
                success: false,
                responseTime,
                error: error.message,
            }));
            this.logger.warn(`Exa deep research check failed: ${error.message}`);
            return { status: 'failed' };
        }
    }
    parseAlternativesResult(result) {
        const alternatives = [];
        if (!result || !result.content) {
            return { alternatives };
        }
        for (const item of result.content) {
            if (item.type === 'text') {
                let text;
                try {
                    const parsed = JSON.parse(item.text);
                    if (parsed.results && parsed.results.length > 0) {
                        text = parsed.results.map((r) => r.text || r.title || '').join(' ');
                    }
                    else {
                        text = item.text;
                    }
                }
                catch {
                    text = item.text;
                }
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.includes('推荐') || line.includes('类似') || line.includes('替代')) {
                        const match = line.match(/([A-Za-z\u4e00-\u9fa5]+(?:\s+[A-Za-z\u4e00-\u9fa5]+)*)/);
                        if (match && match[1].length > 2) {
                            alternatives.push({
                                name: match[1],
                                description: line.trim().substring(0, 100),
                            });
                        }
                    }
                }
            }
        }
        return { alternatives: alternatives.slice(0, 5) };
    }
    parseDestinationStatusResult(result) {
        if (!result || !result.content || !result.content[0]) {
            return { isOpen: true };
        }
        const content = result.content[0];
        if (content.type !== 'text') {
            return { isOpen: true };
        }
        let text;
        try {
            const parsed = JSON.parse(content.text);
            if (parsed.results && parsed.results.length > 0) {
                text = parsed.results.map((r) => r.text || r.title || '').join(' ');
            }
            else {
                text = content.text;
            }
        }
        catch {
            text = content.text;
        }
        const lowerText = text.toLowerCase();
        const closedKeywords = ['关闭', '暂停', '不开放', 'closed', 'suspended'];
        const isClosed = closedKeywords.some(keyword => lowerText.includes(keyword));
        return {
            isOpen: !isClosed,
            status: isClosed ? 'CLOSED' : 'OPEN',
        };
    }
};
exports.ExaIntegrationService = ExaIntegrationService;
exports.ExaIntegrationService = ExaIntegrationService = ExaIntegrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [exa_service_1.ExaService,
        redis_service_1.RedisService,
        exa_monitoring_service_1.ExaMonitoringService])
], ExaIntegrationService);
//# sourceMappingURL=exa-integration.service.js.map
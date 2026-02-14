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
var ExaController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExaController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const exa_service_1 = require("./exa.service");
const exa_monitoring_service_1 = require("./exa-monitoring.service");
const exa_search_dto_1 = require("./dto/exa-search.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let ExaController = ExaController_1 = class ExaController {
    constructor(exaService, monitoring) {
        this.exaService = exaService;
        this.monitoring = monitoring;
        this.logger = new common_1.Logger(ExaController_1.name);
    }
    async webSearch(dto) {
        try {
            this.logger.log(`Web search: ${dto.query}`);
            const result = await this.exaService.webSearch(dto.query, {
                numResults: dto.numResults,
                useAutoprompt: dto.useAutoprompt,
                category: dto.category,
                startPublishedDate: dto.startPublishedDate,
                endPublishedDate: dto.endPublishedDate,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Web search failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || 'Web 搜索失败');
        }
    }
    async getCodeContext(dto) {
        try {
            this.logger.log(`Code context search: ${dto.query}`);
            const result = await this.exaService.getCodeContext(dto.query, {
                numResults: dto.numResults,
                languages: dto.languages,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Code context search failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '代码上下文搜索失败');
        }
    }
    async companyResearch(dto) {
        try {
            this.logger.log(`Company research: ${dto.companyName}`);
            const result = await this.exaService.companyResearch(dto.companyName, {
                numResults: dto.numResults,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Company research failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '公司研究失败');
        }
    }
    async crawlUrl(dto) {
        try {
            this.logger.log(`Crawling URL: ${dto.url}`);
            const result = await this.exaService.crawlUrl(dto.url, {
                text: dto.text,
                html: dto.html,
                markdown: dto.markdown,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Crawl URL failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '网页爬取失败');
        }
    }
    async deepResearcherStart(dto) {
        try {
            this.logger.log(`Starting deep research: ${dto.query}`);
            const result = await this.exaService.deepResearcherStart(dto.query, {
                reportType: dto.reportType,
                numResults: dto.numResults,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Deep research start failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '启动深度研究失败');
        }
    }
    async deepResearcherCheck(dto) {
        try {
            this.logger.log(`Checking deep research: ${dto.taskId}`);
            const result = await this.exaService.deepResearcherCheck(dto.taskId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Deep research check failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '检查深度研究状态失败');
        }
    }
    async listTools() {
        try {
            const result = await this.exaService.listTools();
            return (0, standard_response_dto_1.successResponse)({ tools: result });
        }
        catch (error) {
            this.logger.error('List tools failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取工具列表失败');
        }
    }
    async checkStatus() {
        try {
            const status = await this.exaService.checkConnectionStatus();
            return (0, standard_response_dto_1.successResponse)(status);
        }
        catch (error) {
            this.logger.error('Check status failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '检查状态失败');
        }
    }
    async getStats(days) {
        try {
            const daysNum = days ? parseInt(days, 10) : 7;
            const stats = await this.monitoring.getRecentStats(daysNum);
            const performance = await this.monitoring.getPerformanceMetrics(daysNum);
            const totalCost = await this.monitoring.getTotalCostEstimate(daysNum);
            return (0, standard_response_dto_1.successResponse)({
                dailyStats: stats,
                performance,
                totalCostEstimate: totalCost,
            });
        }
        catch (error) {
            this.logger.error('Get stats failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取统计失败');
        }
    }
    async checkCostLimit(dailyLimit) {
        try {
            const limit = dailyLimit ? parseFloat(dailyLimit) : 10;
            const checkResult = await this.monitoring.checkCostLimit(limit);
            return (0, standard_response_dto_1.successResponse)(checkResult);
        }
        catch (error) {
            this.logger.error('Check cost limit failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '检查成本限制失败');
        }
    }
};
exports.ExaController = ExaController;
__decorate([
    (0, common_1.Post)('search/web'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Web 搜索',
        description: '使用 Exa 进行 Web 搜索',
    }),
    (0, swagger_1.ApiBody)({ type: exa_search_dto_1.ExaWebSearchDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '搜索成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [exa_search_dto_1.ExaWebSearchDto]),
    __metadata("design:returntype", Promise)
], ExaController.prototype, "webSearch", null);
__decorate([
    (0, common_1.Post)('search/code'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '代码上下文搜索',
        description: '搜索代码示例、文档和编程解决方案',
    }),
    (0, swagger_1.ApiBody)({ type: exa_search_dto_1.ExaCodeContextDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '搜索成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [exa_search_dto_1.ExaCodeContextDto]),
    __metadata("design:returntype", Promise)
], ExaController.prototype, "getCodeContext", null);
__decorate([
    (0, common_1.Post)('research/company'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '公司研究',
        description: '研究公司信息、新闻和洞察',
    }),
    (0, swagger_1.ApiBody)({ type: exa_search_dto_1.ExaCompanyResearchDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '研究成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [exa_search_dto_1.ExaCompanyResearchDto]),
    __metadata("design:returntype", Promise)
], ExaController.prototype, "companyResearch", null);
__decorate([
    (0, common_1.Post)('crawl'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '网页爬取',
        description: '获取指定 URL 的完整内容',
    }),
    (0, swagger_1.ApiBody)({ type: exa_search_dto_1.ExaCrawlUrlDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '爬取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [exa_search_dto_1.ExaCrawlUrlDto]),
    __metadata("design:returntype", Promise)
], ExaController.prototype, "crawlUrl", null);
__decorate([
    (0, common_1.Post)('deep-research/start'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '开始深度研究',
        description: '启动 AI 研究代理，搜索、阅读并生成详细报告',
    }),
    (0, swagger_1.ApiBody)({ type: exa_search_dto_1.ExaDeepResearcherStartDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '研究任务已启动',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [exa_search_dto_1.ExaDeepResearcherStartDto]),
    __metadata("design:returntype", Promise)
], ExaController.prototype, "deepResearcherStart", null);
__decorate([
    (0, common_1.Post)('deep-research/check'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '检查深度研究状态',
        description: '检查深度研究任务的状态并获取结果',
    }),
    (0, swagger_1.ApiBody)({ type: exa_search_dto_1.ExaDeepResearcherCheckDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [exa_search_dto_1.ExaDeepResearcherCheckDto]),
    __metadata("design:returntype", Promise)
], ExaController.prototype, "deepResearcherCheck", null);
__decorate([
    (0, common_1.Get)('tools'),
    (0, swagger_1.ApiOperation)({
        summary: '列出所有可用工具',
        description: '获取 Exa MCP 服务器提供的所有工具列表',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ExaController.prototype, "listTools", null);
__decorate([
    (0, common_1.Get)('status'),
    (0, swagger_1.ApiOperation)({
        summary: '检查连接状态',
        description: '检查 Exa MCP 连接状态和 API Key 配置',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ExaController.prototype, "checkStatus", null);
__decorate([
    (0, common_1.Get)('monitoring/stats'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 Exa API 使用统计',
        description: '获取最近 N 天的 Exa API 调用统计、性能指标和成本估算',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ExaController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('monitoring/cost-check'),
    (0, swagger_1.ApiOperation)({
        summary: '检查成本限制',
        description: '检查今日 Exa API 调用成本是否超过限制',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '检查成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('dailyLimit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ExaController.prototype, "checkCostLimit", null);
exports.ExaController = ExaController = ExaController_1 = __decorate([
    (0, swagger_1.ApiTags)('exa'),
    (0, common_1.Controller)('exa'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [exa_service_1.ExaService,
        exa_monitoring_service_1.ExaMonitoringService])
], ExaController);
//# sourceMappingURL=exa.controller.js.map
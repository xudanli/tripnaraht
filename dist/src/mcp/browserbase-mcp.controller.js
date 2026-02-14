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
var BrowserbaseMcpController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserbaseMcpController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const browserbase_mcp_service_1 = require("./browserbase-mcp.service");
const browserbase_dto_1 = require("./dto/browserbase.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let BrowserbaseMcpController = BrowserbaseMcpController_1 = class BrowserbaseMcpController {
    constructor(browserbaseMcpService) {
        this.browserbaseMcpService = browserbaseMcpService;
        this.logger = new common_1.Logger(BrowserbaseMcpController_1.name);
    }
    async createSession(dto) {
        try {
            if (!this.browserbaseMcpService.isAvailable()) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Browserbase MCP service is not available. Please check BROWSERBASE_MCP_SERVER_URL configuration.');
            }
            const result = await this.browserbaseMcpService.createSession(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Browserbase create session failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '创建会话失败');
        }
    }
    async navigate(dto) {
        try {
            if (!this.browserbaseMcpService.isAvailable()) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Browserbase MCP service is not available.');
            }
            const result = await this.browserbaseMcpService.navigate(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Browserbase navigate failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '导航失败');
        }
    }
    async screenshot(dto) {
        try {
            if (!this.browserbaseMcpService.isAvailable()) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Browserbase MCP service is not available.');
            }
            const result = await this.browserbaseMcpService.screenshot(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Browserbase screenshot failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '截图失败');
        }
    }
    async click(dto) {
        try {
            if (!this.browserbaseMcpService.isAvailable()) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Browserbase MCP service is not available.');
            }
            const result = await this.browserbaseMcpService.click(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Browserbase click failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '点击失败');
        }
    }
    async evaluate(dto) {
        try {
            if (!this.browserbaseMcpService.isAvailable()) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Browserbase MCP service is not available.');
            }
            const result = await this.browserbaseMcpService.evaluate(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Browserbase evaluate failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '执行失败');
        }
    }
    async listTools() {
        try {
            if (!this.browserbaseMcpService.isAvailable()) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Browserbase MCP service is not available.');
            }
            const tools = await this.browserbaseMcpService.listTools();
            return (0, standard_response_dto_1.successResponse)({ tools });
        }
        catch (error) {
            this.logger.error('List tools failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取工具列表失败');
        }
    }
    async health() {
        return (0, standard_response_dto_1.successResponse)({
            available: this.browserbaseMcpService.isAvailable(),
            service: 'browserbase-mcp',
        });
    }
    async getAuthorizationUrl() {
        try {
            const result = await this.browserbaseMcpService.getAuthorizationUrl();
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Get authorization URL failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取授权 URL 失败');
        }
    }
    async verifyAuthorization(body) {
        try {
            const result = await this.browserbaseMcpService.verifyAuthorization(body.connectionId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Verify authorization failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '验证授权失败');
        }
    }
};
exports.BrowserbaseMcpController = BrowserbaseMcpController;
__decorate([
    (0, common_1.Post)('session/create'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '创建浏览器会话',
        description: '创建一个新的 Browserbase 浏览器会话',
    }),
    (0, swagger_1.ApiBody)({ type: browserbase_dto_1.CreateSessionDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '会话创建成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [browserbase_dto_1.CreateSessionDto]),
    __metadata("design:returntype", Promise)
], BrowserbaseMcpController.prototype, "createSession", null);
__decorate([
    (0, common_1.Post)('navigate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '导航到 URL',
        description: '在浏览器会话中导航到指定 URL',
    }),
    (0, swagger_1.ApiBody)({ type: browserbase_dto_1.NavigateDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '导航成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [browserbase_dto_1.NavigateDto]),
    __metadata("design:returntype", Promise)
], BrowserbaseMcpController.prototype, "navigate", null);
__decorate([
    (0, common_1.Post)('screenshot'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '截图',
        description: '对浏览器会话进行截图',
    }),
    (0, swagger_1.ApiBody)({ type: browserbase_dto_1.ScreenshotDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '截图成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [browserbase_dto_1.ScreenshotDto]),
    __metadata("design:returntype", Promise)
], BrowserbaseMcpController.prototype, "screenshot", null);
__decorate([
    (0, common_1.Post)('click'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '点击元素',
        description: '在浏览器会话中点击指定元素',
    }),
    (0, swagger_1.ApiBody)({ type: browserbase_dto_1.ClickDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '点击成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [browserbase_dto_1.ClickDto]),
    __metadata("design:returntype", Promise)
], BrowserbaseMcpController.prototype, "click", null);
__decorate([
    (0, common_1.Post)('evaluate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '执行 JavaScript',
        description: '在浏览器会话中执行 JavaScript 代码',
    }),
    (0, swagger_1.ApiBody)({ type: browserbase_dto_1.EvaluateDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '执行成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [browserbase_dto_1.EvaluateDto]),
    __metadata("design:returntype", Promise)
], BrowserbaseMcpController.prototype, "evaluate", null);
__decorate([
    (0, common_1.Get)('tools'),
    (0, swagger_1.ApiOperation)({
        summary: '列出所有可用工具',
        description: '获取 Browserbase MCP 服务器提供的所有工具列表',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BrowserbaseMcpController.prototype, "listTools", null);
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({
        summary: '检查服务状态',
        description: '检查 Browserbase MCP 服务是否可用',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '服务状态',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BrowserbaseMcpController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('auth/url'),
    (0, swagger_1.ApiOperation)({
        summary: '获取授权 URL',
        description: '获取 Browserbase OAuth 授权 URL 和 connectionId，用户需要访问此 URL 完成授权',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '授权 URL 和 connectionId',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], BrowserbaseMcpController.prototype, "getAuthorizationUrl", null);
__decorate([
    (0, common_1.Post)('auth/verify'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '验证授权状态',
        description: '使用 connectionId 验证 OAuth 授权是否已完成',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                connectionId: {
                    type: 'string',
                    description: '从 getAuthorizationUrl 获取的 connectionId',
                },
            },
            required: ['connectionId'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '验证结果',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BrowserbaseMcpController.prototype, "verifyAuthorization", null);
exports.BrowserbaseMcpController = BrowserbaseMcpController = BrowserbaseMcpController_1 = __decorate([
    (0, swagger_1.ApiTags)('browserbase-mcp'),
    (0, common_1.Controller)('browserbase-mcp'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [browserbase_mcp_service_1.BrowserbaseMcpService])
], BrowserbaseMcpController);
//# sourceMappingURL=browserbase-mcp.controller.js.map
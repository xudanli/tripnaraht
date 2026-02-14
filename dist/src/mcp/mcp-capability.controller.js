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
exports.McpCapabilityController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const mcp_capability_manager_service_1 = require("./services/mcp-capability-manager.service");
const mcp_capability_dto_1 = require("./dto/mcp-capability.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let McpCapabilityController = class McpCapabilityController {
    constructor(capabilityManager) {
        this.capabilityManager = capabilityManager;
    }
    async getAllCapabilities(query) {
        const filters = {};
        if (query.serviceName)
            filters.serviceName = query.serviceName;
        if (query.status)
            filters.status = query.status;
        if (query.category)
            filters.category = query.category;
        const capabilities = await this.capabilityManager.getAllCapabilities(filters);
        return (0, standard_response_dto_1.successResponse)(capabilities);
    }
    async getStatistics() {
        const stats = await this.capabilityManager.getStatistics();
        return (0, standard_response_dto_1.successResponse)(stats);
    }
    async getCapability(serviceName) {
        const capability = await this.capabilityManager.getCapability(serviceName);
        if (!capability) {
            throw new common_1.NotFoundException(`Capability not found: ${serviceName}`);
        }
        return (0, standard_response_dto_1.successResponse)(capability);
    }
    async updateCapabilityStatus(serviceName, body) {
        if (body.serviceName !== serviceName) {
            throw new common_1.BadRequestException('Service name mismatch');
        }
        const enabled = body.status === mcp_capability_dto_1.McpCapabilityStatus.ENABLED;
        const success = await this.capabilityManager.updateCapabilityStatus(serviceName, enabled);
        if (!success) {
            throw new common_1.NotFoundException(`Capability not found: ${serviceName}`);
        }
        return (0, standard_response_dto_1.successResponse)({
            serviceName,
            enabled,
        });
    }
    async batchUpdateCapabilityStatus(body) {
        const updates = body.updates.map(update => ({
            serviceName: update.serviceName,
            enabled: update.status === mcp_capability_dto_1.McpCapabilityStatus.ENABLED,
        }));
        const result = await this.capabilityManager.batchUpdateCapabilityStatus(updates);
        return (0, standard_response_dto_1.successResponse)(result);
    }
    async resetToDefaults() {
        await this.capabilityManager.resetToDefaults();
        return (0, standard_response_dto_1.successResponse)({ message: 'All capabilities reset to default state' });
    }
    async checkCapabilityEnabled(serviceName) {
        const enabled = await this.capabilityManager.isCapabilityEnabledAsync(serviceName);
        return (0, standard_response_dto_1.successResponse)({
            serviceName,
            enabled,
        });
    }
};
exports.McpCapabilityController = McpCapabilityController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: '获取所有 MCP 能力列表',
        description: '获取所有 MCP 服务的列表，支持按服务名称、状态、分类过滤',
    }),
    (0, swagger_1.ApiQuery)({ name: 'serviceName', required: false, description: '服务名称' }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, enum: mcp_capability_dto_1.McpCapabilityStatus, description: '启用状态' }),
    (0, swagger_1.ApiQuery)({ name: 'category', required: false, description: '服务分类' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '返回能力列表',
        type: [mcp_capability_dto_1.McpCapabilityDto],
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mcp_capability_dto_1.QueryCapabilitiesDto]),
    __metadata("design:returntype", Promise)
], McpCapabilityController.prototype, "getAllCapabilities", null);
__decorate([
    (0, common_1.Get)('statistics'),
    (0, swagger_1.ApiOperation)({
        summary: '获取能力统计信息',
        description: '获取 MCP 能力的统计信息，包括总数、启用数、禁用数、按分类统计等',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '返回统计信息',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], McpCapabilityController.prototype, "getStatistics", null);
__decorate([
    (0, common_1.Get)(':serviceName'),
    (0, swagger_1.ApiOperation)({
        summary: '获取单个能力信息',
        description: '根据服务名称获取单个 MCP 能力的详细信息',
    }),
    (0, swagger_1.ApiParam)({ name: 'serviceName', description: '服务名称', example: 'google_maps' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '返回能力信息',
        type: mcp_capability_dto_1.McpCapabilityDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '能力不存在',
    }),
    __param(0, (0, common_1.Param)('serviceName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], McpCapabilityController.prototype, "getCapability", null);
__decorate([
    (0, common_1.Put)(':serviceName/status'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '更新能力状态',
        description: '启用或禁用指定的 MCP 能力',
    }),
    (0, swagger_1.ApiParam)({ name: 'serviceName', description: '服务名称', example: 'google_maps' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '更新成功',
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '能力不存在',
    }),
    __param(0, (0, common_1.Param)('serviceName')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, mcp_capability_dto_1.UpdateCapabilityStatusDto]),
    __metadata("design:returntype", Promise)
], McpCapabilityController.prototype, "updateCapabilityStatus", null);
__decorate([
    (0, common_1.Post)('batch-update'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '批量更新能力状态',
        description: '批量启用或禁用多个 MCP 能力',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '批量更新结果',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [mcp_capability_dto_1.BatchUpdateCapabilityStatusDto]),
    __metadata("design:returntype", Promise)
], McpCapabilityController.prototype, "batchUpdateCapabilityStatus", null);
__decorate([
    (0, common_1.Post)('reset'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '重置所有能力为默认状态',
        description: '将所有 MCP 能力重置为默认的启用/禁用状态',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '重置成功',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], McpCapabilityController.prototype, "resetToDefaults", null);
__decorate([
    (0, common_1.Get)(':serviceName/enabled'),
    (0, swagger_1.ApiOperation)({
        summary: '检查能力是否启用',
        description: '检查指定的 MCP 能力是否已启用',
    }),
    (0, swagger_1.ApiParam)({ name: 'serviceName', description: '服务名称', example: 'google_maps' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '返回启用状态',
    }),
    __param(0, (0, common_1.Param)('serviceName')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], McpCapabilityController.prototype, "checkCapabilityEnabled", null);
exports.McpCapabilityController = McpCapabilityController = __decorate([
    (0, swagger_1.ApiTags)('mcp-capability'),
    (0, common_1.Controller)('mcp/capabilities'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [mcp_capability_manager_service_1.McpCapabilityManagerService])
], McpCapabilityController);
//# sourceMappingURL=mcp-capability.controller.js.map
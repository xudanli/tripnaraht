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
var PostgreSQLMcpController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgreSQLMcpController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const postgresql_mcp_service_1 = require("./postgresql-mcp.service");
const postgresql_mcp_monitoring_service_1 = require("./services/postgresql-mcp-monitoring.service");
const postgresql_dto_1 = require("./dto/postgresql.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let PostgreSQLMcpController = PostgreSQLMcpController_1 = class PostgreSQLMcpController {
    constructor(postgresqlMcpService, monitoringService) {
        this.postgresqlMcpService = postgresqlMcpService;
        this.monitoringService = monitoringService;
        this.logger = new common_1.Logger(PostgreSQLMcpController_1.name);
    }
    async query(dto) {
        try {
            if (!this.postgresqlMcpService.isAvailable()) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'PostgreSQL MCP service is not available. Please check POSTGRESQL_MCP_SERVER_URL configuration.');
            }
            const result = await this.postgresqlMcpService.query(dto.query, dto.params);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('PostgreSQL query failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '执行查询失败');
        }
    }
    async execute(dto) {
        try {
            if (!this.postgresqlMcpService.isAvailable()) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'PostgreSQL MCP service is not available. Please check POSTGRESQL_MCP_SERVER_URL configuration.');
            }
            const result = await this.postgresqlMcpService.execute(dto.query, dto.params);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('PostgreSQL execute failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '执行命令失败');
        }
    }
    async listTools() {
        try {
            if (!this.postgresqlMcpService.isAvailable()) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'PostgreSQL MCP service is not available. Please check POSTGRESQL_MCP_SERVER_URL configuration.');
            }
            const tools = await this.postgresqlMcpService.listTools();
            return (0, standard_response_dto_1.successResponse)({ tools });
        }
        catch (error) {
            this.logger.error('List tools failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取工具列表失败');
        }
    }
    async health() {
        return (0, standard_response_dto_1.successResponse)({
            available: this.postgresqlMcpService.isAvailable(),
            service: 'postgresql-mcp',
        });
    }
    async getPerformanceStats(days) {
        try {
            const daysNum = days ? parseInt(days, 10) : 1;
            if (isNaN(daysNum) || daysNum < 1 || daysNum > 30) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'days 参数必须是 1-30 之间的整数');
            }
            const stats = await this.monitoringService.getPerformanceStats(daysNum);
            return (0, standard_response_dto_1.successResponse)(stats);
        }
        catch (error) {
            this.logger.error('Get performance stats failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取性能统计失败');
        }
    }
    async getSlowQueries(limit) {
        try {
            const limitNum = limit ? parseInt(limit, 10) : 20;
            if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'limit 参数必须是 1-100 之间的整数');
            }
            const slowQueries = await this.monitoringService.getSlowQueries(limitNum);
            return (0, standard_response_dto_1.successResponse)({ slowQueries });
        }
        catch (error) {
            this.logger.error('Get slow queries failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取慢查询列表失败');
        }
    }
};
exports.PostgreSQLMcpController = PostgreSQLMcpController;
__decorate([
    (0, common_1.Post)('query'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '执行 SQL 查询',
        description: '执行 SELECT 查询并返回结果',
    }),
    (0, swagger_1.ApiBody)({ type: postgresql_dto_1.QueryDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '查询成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [postgresql_dto_1.QueryDto]),
    __metadata("design:returntype", Promise)
], PostgreSQLMcpController.prototype, "query", null);
__decorate([
    (0, common_1.Post)('execute'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '执行 SQL 命令',
        description: '执行 INSERT, UPDATE, DELETE 等命令',
    }),
    (0, swagger_1.ApiBody)({ type: postgresql_dto_1.ExecuteDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '执行成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [postgresql_dto_1.ExecuteDto]),
    __metadata("design:returntype", Promise)
], PostgreSQLMcpController.prototype, "execute", null);
__decorate([
    (0, common_1.Get)('tools'),
    (0, swagger_1.ApiOperation)({
        summary: '列出所有可用工具',
        description: '获取 PostgreSQL MCP 服务器提供的所有工具列表',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PostgreSQLMcpController.prototype, "listTools", null);
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({
        summary: '检查服务状态',
        description: '检查 PostgreSQL MCP 服务是否可用',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '服务状态',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PostgreSQLMcpController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('monitoring/stats'),
    (0, swagger_1.ApiOperation)({
        summary: '获取性能统计',
        description: '获取 PostgreSQL MCP 查询的性能统计信息',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '统计信息',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PostgreSQLMcpController.prototype, "getPerformanceStats", null);
__decorate([
    (0, common_1.Get)('monitoring/slow-queries'),
    (0, swagger_1.ApiOperation)({
        summary: '获取慢查询列表',
        description: '获取执行时间超过阈值的慢查询列表',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '慢查询列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PostgreSQLMcpController.prototype, "getSlowQueries", null);
exports.PostgreSQLMcpController = PostgreSQLMcpController = PostgreSQLMcpController_1 = __decorate([
    (0, swagger_1.ApiTags)('postgresql-mcp'),
    (0, common_1.Controller)('postgresql-mcp'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [postgresql_mcp_service_1.PostgreSQLMcpService,
        postgresql_mcp_monitoring_service_1.PostgreSQLMcpMonitoringService])
], PostgreSQLMcpController);
//# sourceMappingURL=postgresql-mcp.controller.js.map
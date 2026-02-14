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
var PostgreSQLMcpService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgreSQLMcpService = void 0;
const common_1 = require("@nestjs/common");
const postgresql_mcp_client_1 = require("./postgresql-mcp-client");
const postgresql_mcp_security_service_1 = require("./services/postgresql-mcp-security.service");
const postgresql_mcp_monitoring_service_1 = require("./services/postgresql-mcp-monitoring.service");
let PostgreSQLMcpService = PostgreSQLMcpService_1 = class PostgreSQLMcpService {
    constructor(securityService, monitoringService) {
        this.securityService = securityService;
        this.monitoringService = monitoringService;
        this.logger = new common_1.Logger(PostgreSQLMcpService_1.name);
        this.client = null;
        try {
            const serverUrl = process.env.POSTGRESQL_MCP_SERVER_URL ||
                'https://server.smithery.ai/1Levick3/postgresql-mcp-server';
            this.client = new postgresql_mcp_client_1.PostgreSQLMcpClient(serverUrl);
            this.logger.log('✅ PostgreSQL MCP Service initialized');
        }
        catch (error) {
            this.logger.warn(`⚠️  Failed to initialize PostgreSQL MCP client: ${error.message}`);
            this.client = null;
        }
    }
    async onModuleInit() {
    }
    async onModuleDestroy() {
        if (this.client) {
            try {
                await this.client.disconnect();
            }
            catch (error) {
                this.logger.warn(`Failed to disconnect PostgreSQL MCP client: ${error.message}`);
            }
        }
    }
    async ensureConnected() {
        if (!this.client) {
            throw new Error('PostgreSQL MCP client is not available');
        }
        if (!this.client.isClientConnected()) {
            try {
                await this.client.connect();
            }
            catch (error) {
                if (error.message && error.message.includes('already started')) {
                    this.logger.debug('PostgreSQL MCP transport already started, reusing connection');
                    return;
                }
                throw error;
            }
        }
    }
    async query(query, params) {
        const startTime = Date.now();
        let success = false;
        let error;
        let rowCount;
        try {
            const securityCheck = this.securityService.checkSQLSafety(query, params);
            if (securityCheck.blocked) {
                throw new Error(`SQL 查询被安全策略阻止: ${securityCheck.warnings.join(', ')}`);
            }
            if (!securityCheck.isSafe) {
                this.logger.warn(`SQL 查询存在安全风险 (${securityCheck.riskLevel}): ${securityCheck.warnings.join(', ')}`);
            }
            const paramValidation = this.securityService.validateParameters(query, params);
            if (!paramValidation.isValid) {
                throw new Error(`参数验证失败: ${paramValidation.error}`);
            }
            await this.ensureConnected();
            if (!this.client) {
                throw new Error('PostgreSQL MCP client is not available');
            }
            const result = await this.client.query({ query, params });
            success = true;
            rowCount = Array.isArray(result) ? result.length : undefined;
            return result;
        }
        catch (err) {
            error = err.message || 'Unknown error';
            this.logger.error(`PostgreSQL query failed: ${error}`);
            throw err;
        }
        finally {
            if (this.monitoringService) {
                const executionTime = Date.now() - startTime;
                await this.monitoringService.recordQueryMetrics({
                    query,
                    params,
                    executionTime,
                    timestamp: new Date(),
                    success,
                    error,
                    rowCount,
                });
            }
        }
    }
    async execute(query, params) {
        const startTime = Date.now();
        let success = false;
        let error;
        let rowCount;
        try {
            const securityCheck = this.securityService.checkSQLSafety(query, params);
            if (securityCheck.blocked || !securityCheck.isSafe) {
                throw new Error(`SQL 命令被安全策略阻止: ${securityCheck.warnings.join(', ')}`);
            }
            const paramValidation = this.securityService.validateParameters(query, params);
            if (!paramValidation.isValid) {
                throw new Error(`参数验证失败: ${paramValidation.error}`);
            }
            await this.ensureConnected();
            if (!this.client) {
                throw new Error('PostgreSQL MCP client is not available');
            }
            const result = await this.client.execute({ query, params });
            success = true;
            rowCount = result === null || result === void 0 ? void 0 : result.rowCount;
            return result;
        }
        catch (err) {
            error = err.message || 'Unknown error';
            this.logger.error(`PostgreSQL execute failed: ${error}`);
            throw err;
        }
        finally {
            if (this.monitoringService) {
                const executionTime = Date.now() - startTime;
                await this.monitoringService.recordQueryMetrics({
                    query,
                    params,
                    executionTime,
                    timestamp: new Date(),
                    success,
                    error,
                    rowCount,
                });
            }
        }
    }
    async listTools() {
        await this.ensureConnected();
        if (!this.client) {
            throw new Error('PostgreSQL MCP client is not available');
        }
        try {
            return await this.client.listTools();
        }
        catch (error) {
            this.logger.error(`Failed to list tools: ${error.message}`);
            throw error;
        }
    }
    isAvailable() {
        return this.client !== null;
    }
};
exports.PostgreSQLMcpService = PostgreSQLMcpService;
exports.PostgreSQLMcpService = PostgreSQLMcpService = PostgreSQLMcpService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [postgresql_mcp_security_service_1.PostgreSQLMcpSecurityService,
        postgresql_mcp_monitoring_service_1.PostgreSQLMcpMonitoringService])
], PostgreSQLMcpService);
//# sourceMappingURL=postgresql-mcp.service.js.map
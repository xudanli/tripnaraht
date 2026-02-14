"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgreSQLMcpModule = void 0;
const common_1 = require("@nestjs/common");
const postgresql_mcp_controller_1 = require("./postgresql-mcp.controller");
const postgresql_mcp_service_1 = require("./postgresql-mcp.service");
const postgresql_mcp_security_service_1 = require("./services/postgresql-mcp-security.service");
const postgresql_mcp_monitoring_service_1 = require("./services/postgresql-mcp-monitoring.service");
const postgresql_mcp_permission_service_1 = require("./services/postgresql-mcp-permission.service");
const redis_module_1 = require("../redis/redis.module");
let PostgreSQLMcpModule = class PostgreSQLMcpModule {
};
exports.PostgreSQLMcpModule = PostgreSQLMcpModule;
exports.PostgreSQLMcpModule = PostgreSQLMcpModule = __decorate([
    (0, common_1.Module)({
        imports: [redis_module_1.RedisModule],
        controllers: [postgresql_mcp_controller_1.PostgreSQLMcpController],
        providers: [
            postgresql_mcp_service_1.PostgreSQLMcpService,
            postgresql_mcp_security_service_1.PostgreSQLMcpSecurityService,
            postgresql_mcp_monitoring_service_1.PostgreSQLMcpMonitoringService,
            postgresql_mcp_permission_service_1.PostgreSQLMcpPermissionService,
        ],
        exports: [
            postgresql_mcp_service_1.PostgreSQLMcpService,
            postgresql_mcp_security_service_1.PostgreSQLMcpSecurityService,
            postgresql_mcp_monitoring_service_1.PostgreSQLMcpMonitoringService,
            postgresql_mcp_permission_service_1.PostgreSQLMcpPermissionService,
        ],
    })
], PostgreSQLMcpModule);
//# sourceMappingURL=postgresql-mcp.module.js.map
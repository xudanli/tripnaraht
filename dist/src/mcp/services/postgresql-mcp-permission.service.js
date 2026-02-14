"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PostgreSQLMcpPermissionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgreSQLMcpPermissionService = void 0;
const common_1 = require("@nestjs/common");
let PostgreSQLMcpPermissionService = PostgreSQLMcpPermissionService_1 = class PostgreSQLMcpPermissionService {
    constructor() {
        this.logger = new common_1.Logger(PostgreSQLMcpPermissionService_1.name);
        this.defaultConfig = {
            allowedOperations: ['SELECT'],
            maxQueryLength: 10000,
            maxParamsCount: 100,
        };
        this.rolePermissions = {
            admin: {
                allowedOperations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
                maxQueryLength: 50000,
                maxParamsCount: 500,
            },
            user: {
                allowedOperations: ['SELECT'],
                maxQueryLength: 10000,
                maxParamsCount: 100,
            },
            readonly: {
                allowedOperations: ['SELECT'],
                maxQueryLength: 5000,
                maxParamsCount: 50,
            },
        };
    }
    checkPermission(query, config = {}) {
        var _a;
        const effectiveConfig = this.mergeConfig(config);
        const operation = this.extractOperation(query);
        if (!((_a = effectiveConfig.allowedOperations) === null || _a === void 0 ? void 0 : _a.includes(operation))) {
            return {
                allowed: false,
                reason: `操作 ${operation} 不在允许的操作列表中`,
            };
        }
        if (effectiveConfig.maxQueryLength && query.length > effectiveConfig.maxQueryLength) {
            return {
                allowed: false,
                reason: `查询长度 (${query.length}) 超过最大允许长度 (${effectiveConfig.maxQueryLength})`,
            };
        }
        if (effectiveConfig.allowedTables && effectiveConfig.allowedTables.length > 0) {
            const tables = this.extractTables(query);
            const unauthorizedTables = tables.filter(table => { var _a; return !((_a = effectiveConfig.allowedTables) === null || _a === void 0 ? void 0 : _a.includes(table)); });
            if (unauthorizedTables.length > 0) {
                return {
                    allowed: false,
                    reason: `无权访问表: ${unauthorizedTables.join(', ')}`,
                };
            }
        }
        return { allowed: true };
    }
    mergeConfig(config) {
        let roleConfig = {};
        if (config.role && this.rolePermissions[config.role]) {
            roleConfig = this.rolePermissions[config.role];
        }
        return {
            ...this.defaultConfig,
            ...roleConfig,
            ...config,
        };
    }
    extractOperation(query) {
        const upperQuery = query.toUpperCase().trim();
        if (upperQuery.startsWith('SELECT')) {
            return 'SELECT';
        }
        else if (upperQuery.startsWith('INSERT')) {
            return 'INSERT';
        }
        else if (upperQuery.startsWith('UPDATE')) {
            return 'UPDATE';
        }
        else if (upperQuery.startsWith('DELETE')) {
            return 'DELETE';
        }
        return 'SELECT';
    }
    extractTables(query) {
        const tables = [];
        const upperQuery = query.toUpperCase();
        const fromMatches = query.match(/\bFROM\s+["']?(\w+)["']?/gi);
        const joinMatches = query.match(/\bJOIN\s+["']?(\w+)["']?/gi);
        if (fromMatches) {
            fromMatches.forEach(match => {
                const table = match.replace(/\bFROM\s+/i, '').replace(/["']/g, '').trim();
                if (table) {
                    tables.push(table);
                }
            });
        }
        if (joinMatches) {
            joinMatches.forEach(match => {
                const table = match.replace(/\bJOIN\s+/i, '').replace(/["']/g, '').trim();
                if (table) {
                    tables.push(table);
                }
            });
        }
        return [...new Set(tables)];
    }
    checkParamsCount(params, config = {}) {
        const effectiveConfig = this.mergeConfig(config);
        if (!params || params.length === 0) {
            return { allowed: true };
        }
        if (effectiveConfig.maxParamsCount && params.length > effectiveConfig.maxParamsCount) {
            return {
                allowed: false,
                reason: `参数数量 (${params.length}) 超过最大允许数量 (${effectiveConfig.maxParamsCount})`,
            };
        }
        return { allowed: true };
    }
};
exports.PostgreSQLMcpPermissionService = PostgreSQLMcpPermissionService;
exports.PostgreSQLMcpPermissionService = PostgreSQLMcpPermissionService = PostgreSQLMcpPermissionService_1 = __decorate([
    (0, common_1.Injectable)()
], PostgreSQLMcpPermissionService);
//# sourceMappingURL=postgresql-mcp-permission.service.js.map
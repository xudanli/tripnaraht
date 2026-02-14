"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PostgreSQLMcpSecurityService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgreSQLMcpSecurityService = void 0;
const common_1 = require("@nestjs/common");
let PostgreSQLMcpSecurityService = PostgreSQLMcpSecurityService_1 = class PostgreSQLMcpSecurityService {
    constructor() {
        this.logger = new common_1.Logger(PostgreSQLMcpSecurityService_1.name);
        this.sqlInjectionPatterns = [
            /(\bUNION\b.*\bSELECT\b)/i,
            /(\bDROP\b.*\bTABLE\b)/i,
            /(\bDELETE\b.*\bFROM\b)/i,
            /(\bTRUNCATE\b.*\bTABLE\b)/i,
            /(\bALTER\b.*\bTABLE\b)/i,
            /(\bCREATE\b.*\bTABLE\b)/i,
            /(\bINSERT\b.*\bINTO\b.*\bVALUES\b)/i,
            /(\bUPDATE\b.*\bSET\b)/i,
            /(--\s*)/,
            /(\/\*.*\*\/)/,
            /(\bEXEC\b|\bEXECUTE\b)/i,
            /(\bxp_\w+)/i,
            /(\bWAITFOR\b.*\bDELAY\b)/i,
            /(\bBENCHMARK\b)/i,
            /(\bSLEEP\b)/i,
            /(\bCHR\b|\bCHAR\b)/i,
            /(\bCONCAT\b)/i,
            /(\bSUBSTRING\b|\bSUBSTR\b)/i,
            /('.*OR.*'.*=.*')/i,
            /('.*AND.*'.*=.*')/i,
            /(\b1\s*=\s*1\b)/i,
            /(\b1\s*=\s*0\b)/i,
        ];
        this.dangerousOperations = [
            'DROP',
            'DELETE',
            'TRUNCATE',
            'ALTER',
            'CREATE',
            'GRANT',
            'REVOKE',
            'EXEC',
            'EXECUTE',
        ];
        this.readOnlyOperations = ['SELECT'];
    }
    checkSQLSafety(query, params) {
        const warnings = [];
        let riskLevel = 'LOW';
        let blocked = false;
        for (const pattern of this.sqlInjectionPatterns) {
            if (pattern.test(query)) {
                warnings.push(`检测到潜在的 SQL 注入模式: ${pattern.source}`);
                riskLevel = 'CRITICAL';
                blocked = true;
            }
        }
        const upperQuery = query.toUpperCase().trim();
        const hasDangerousOp = this.dangerousOperations.some(op => upperQuery.startsWith(op) || upperQuery.includes(` ${op} `));
        if (hasDangerousOp) {
            warnings.push('检测到危险操作（DROP、DELETE、TRUNCATE 等）');
            if (riskLevel === 'LOW') {
                riskLevel = 'HIGH';
            }
        }
        if (params && params.length > 0) {
            const paramString = JSON.stringify(params);
            if (this.containsSQLKeywords(paramString)) {
                warnings.push('参数中包含 SQL 关键词，可能存在注入风险');
                if (riskLevel === 'LOW') {
                    riskLevel = 'MEDIUM';
                }
            }
        }
        if (query.length > 10000) {
            warnings.push('查询长度异常，可能存在注入风险');
            if (riskLevel === 'LOW') {
                riskLevel = 'MEDIUM';
            }
        }
        const nestedDepth = this.countNestedQueries(query);
        if (nestedDepth > 5) {
            warnings.push(`嵌套查询深度过深 (${nestedDepth})，可能存在注入风险`);
            if (riskLevel === 'LOW') {
                riskLevel = 'MEDIUM';
            }
        }
        const hasParameterizedQuery = query.includes('$') || (params && params.length > 0);
        if (!hasParameterizedQuery && query.includes("'")) {
            warnings.push('查询中包含单引号但未使用参数化查询，建议使用参数化查询');
            if (riskLevel === 'LOW') {
                riskLevel = 'MEDIUM';
            }
        }
        return {
            isSafe: !blocked && riskLevel !== 'CRITICAL' && riskLevel !== 'HIGH',
            riskLevel,
            warnings,
            blocked,
        };
    }
    containsSQLKeywords(str) {
        const sqlKeywords = [
            'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
            'UNION', 'EXEC', 'EXECUTE', 'TRUNCATE', 'GRANT', 'REVOKE',
        ];
        const upperStr = str.toUpperCase();
        return sqlKeywords.some(keyword => upperStr.includes(keyword));
    }
    countNestedQueries(query) {
        const selectMatches = query.match(/\bSELECT\b/gi);
        const fromMatches = query.match(/\bFROM\b/gi);
        if (!selectMatches || !fromMatches) {
            return 0;
        }
        return Math.min(selectMatches.length, fromMatches.length);
    }
    isReadOnlyQuery(query) {
        const upperQuery = query.toUpperCase().trim();
        return this.readOnlyOperations.some(op => upperQuery.startsWith(op));
    }
    validateParameters(query, params) {
        if (!params || params.length === 0) {
            return { isValid: true };
        }
        const dollarPlaceholders = (query.match(/\$\d+/g) || []).length;
        const questionPlaceholders = (query.match(/\?/g) || []).length;
        const totalPlaceholders = dollarPlaceholders + questionPlaceholders;
        if (totalPlaceholders === 0 && params.length > 0) {
            return {
                isValid: false,
                error: '查询中没有占位符，但提供了参数',
            };
        }
        if (totalPlaceholders !== params.length) {
            return {
                isValid: false,
                error: `占位符数量 (${totalPlaceholders}) 与参数数量 (${params.length}) 不匹配`,
            };
        }
        return { isValid: true };
    }
};
exports.PostgreSQLMcpSecurityService = PostgreSQLMcpSecurityService;
exports.PostgreSQLMcpSecurityService = PostgreSQLMcpSecurityService = PostgreSQLMcpSecurityService_1 = __decorate([
    (0, common_1.Injectable)()
], PostgreSQLMcpSecurityService);
//# sourceMappingURL=postgresql-mcp-security.service.js.map
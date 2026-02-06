/**
 * PostgreSQL MCP Security Service
 * 
 * 提供 SQL 注入检测和安全验证功能
 */

import { Injectable, Logger } from '@nestjs/common';

export interface SecurityCheckResult {
  isSafe: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  warnings: string[];
  blocked: boolean;
}

@Injectable()
export class PostgreSQLMcpSecurityService {
  private readonly logger = new Logger(PostgreSQLMcpSecurityService.name);

  // SQL 注入关键词模式
  private readonly sqlInjectionPatterns = [
    /(\bUNION\b.*\bSELECT\b)/i,
    /(\bDROP\b.*\bTABLE\b)/i,
    /(\bDELETE\b.*\bFROM\b)/i,
    /(\bTRUNCATE\b.*\bTABLE\b)/i,
    /(\bALTER\b.*\bTABLE\b)/i,
    /(\bCREATE\b.*\bTABLE\b)/i,
    /(\bINSERT\b.*\bINTO\b.*\bVALUES\b)/i,
    /(\bUPDATE\b.*\bSET\b)/i,
    /(--\s*)/, // SQL 注释
    /(\/\*.*\*\/)/, // 多行注释
    /(\bEXEC\b|\bEXECUTE\b)/i,
    /(\bxp_\w+)/i, // SQL Server 扩展存储过程
    /(\bWAITFOR\b.*\bDELAY\b)/i,
    /(\bBENCHMARK\b)/i,
    /(\bSLEEP\b)/i,
    /(\bCHR\b|\bCHAR\b)/i,
    /(\bCONCAT\b)/i,
    /(\bSUBSTRING\b|\bSUBSTR\b)/i,
    /('.*OR.*'.*=.*')/i, // OR 注入
    /('.*AND.*'.*=.*')/i, // AND 注入
    /(\b1\s*=\s*1\b)/i, // 恒真条件
    /(\b1\s*=\s*0\b)/i, // 恒假条件
  ];

  // 危险操作关键词
  private readonly dangerousOperations = [
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

  // 只读操作关键词（相对安全）
  private readonly readOnlyOperations = ['SELECT'];

  /**
   * 检查 SQL 查询是否安全
   */
  checkSQLSafety(query: string, params?: any[]): SecurityCheckResult {
    const warnings: string[] = [];
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    let blocked = false;

    // 1. 检查 SQL 注入模式
    for (const pattern of this.sqlInjectionPatterns) {
      if (pattern.test(query)) {
        warnings.push(`检测到潜在的 SQL 注入模式: ${pattern.source}`);
        riskLevel = 'CRITICAL';
        blocked = true;
      }
    }

    // 2. 检查危险操作
    const upperQuery = query.toUpperCase().trim();
    const hasDangerousOp = this.dangerousOperations.some(op => 
      upperQuery.startsWith(op) || upperQuery.includes(` ${op} `)
    );

    if (hasDangerousOp) {
      warnings.push('检测到危险操作（DROP、DELETE、TRUNCATE 等）');
      if (riskLevel === 'LOW') {
        riskLevel = 'HIGH';
      }
    }

    // 3. 检查参数注入
    if (params && params.length > 0) {
      const paramString = JSON.stringify(params);
      if (this.containsSQLKeywords(paramString)) {
        warnings.push('参数中包含 SQL 关键词，可能存在注入风险');
        if (riskLevel === 'LOW') {
          riskLevel = 'MEDIUM';
        }
      }
    }

    // 4. 检查查询长度（异常长的查询可能是注入）
    if (query.length > 10000) {
      warnings.push('查询长度异常，可能存在注入风险');
      if (riskLevel === 'LOW') {
        riskLevel = 'MEDIUM';
      }
    }

    // 5. 检查嵌套查询深度
    const nestedDepth = this.countNestedQueries(query);
    if (nestedDepth > 5) {
      warnings.push(`嵌套查询深度过深 (${nestedDepth})，可能存在注入风险`);
      if (riskLevel === 'LOW') {
        riskLevel = 'MEDIUM';
      }
    }

    // 6. 检查是否使用参数化查询
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

  /**
   * 检查字符串是否包含 SQL 关键词
   */
  private containsSQLKeywords(str: string): boolean {
    const sqlKeywords = [
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
      'UNION', 'EXEC', 'EXECUTE', 'TRUNCATE', 'GRANT', 'REVOKE',
    ];
    
    const upperStr = str.toUpperCase();
    return sqlKeywords.some(keyword => upperStr.includes(keyword));
  }

  /**
   * 计算嵌套查询深度
   */
  private countNestedQueries(query: string): number {
    const selectMatches = query.match(/\bSELECT\b/gi);
    const fromMatches = query.match(/\bFROM\b/gi);
    
    if (!selectMatches || !fromMatches) {
      return 0;
    }

    // 简单估算：SELECT 和 FROM 的数量可以反映嵌套深度
    return Math.min(selectMatches.length, fromMatches.length);
  }

  /**
   * 验证查询类型（只读 vs 写操作）
   */
  isReadOnlyQuery(query: string): boolean {
    const upperQuery = query.toUpperCase().trim();
    return this.readOnlyOperations.some(op => upperQuery.startsWith(op));
  }

  /**
   * 验证参数数量与占位符匹配
   */
  validateParameters(query: string, params?: any[]): {
    isValid: boolean;
    error?: string;
  } {
    if (!params || params.length === 0) {
      return { isValid: true };
    }

    // 计算占位符数量（$1, $2, ... 或 ?）
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
}

/**
 * PostgreSQL MCP Permission Service
 * 
 * 提供权限控制功能
 */

import { Injectable, Logger } from '@nestjs/common';

export interface PermissionConfig {
  userId?: string;
  role?: string;
  allowedOperations?: ('SELECT' | 'INSERT' | 'UPDATE' | 'DELETE')[];
  allowedTables?: string[];
  maxQueryLength?: number;
  maxParamsCount?: number;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

@Injectable()
export class PostgreSQLMcpPermissionService {
  private readonly logger = new Logger(PostgreSQLMcpPermissionService.name);

  // 默认权限配置
  private readonly defaultConfig: PermissionConfig = {
    allowedOperations: ['SELECT'], // 默认只允许 SELECT
    maxQueryLength: 10000,
    maxParamsCount: 100,
  };

  // 角色权限映射
  private readonly rolePermissions: Record<string, PermissionConfig> = {
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

  /**
   * 检查权限
   */
  checkPermission(
    query: string,
    config: PermissionConfig = {}
  ): PermissionCheckResult {
    const effectiveConfig = this.mergeConfig(config);

    // 1. 检查操作类型
    const operation = this.extractOperation(query);
    if (!effectiveConfig.allowedOperations?.includes(operation)) {
      return {
        allowed: false,
        reason: `操作 ${operation} 不在允许的操作列表中`,
      };
    }

    // 2. 检查查询长度
    if (effectiveConfig.maxQueryLength && query.length > effectiveConfig.maxQueryLength) {
      return {
        allowed: false,
        reason: `查询长度 (${query.length}) 超过最大允许长度 (${effectiveConfig.maxQueryLength})`,
      };
    }

    // 3. 检查表权限（如果配置了）
    if (effectiveConfig.allowedTables && effectiveConfig.allowedTables.length > 0) {
      const tables = this.extractTables(query);
      const unauthorizedTables = tables.filter(
        table => !effectiveConfig.allowedTables?.includes(table)
      );
      
      if (unauthorizedTables.length > 0) {
        return {
          allowed: false,
          reason: `无权访问表: ${unauthorizedTables.join(', ')}`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * 合并配置（用户配置 + 角色配置 + 默认配置）
   */
  private mergeConfig(config: PermissionConfig): PermissionConfig {
    let roleConfig: PermissionConfig = {};

    if (config.role && this.rolePermissions[config.role]) {
      roleConfig = this.rolePermissions[config.role];
    }

    return {
      ...this.defaultConfig,
      ...roleConfig,
      ...config, // 用户配置优先级最高
    };
  }

  /**
   * 提取 SQL 操作类型
   */
  private extractOperation(query: string): 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' {
    const upperQuery = query.toUpperCase().trim();
    
    if (upperQuery.startsWith('SELECT')) {
      return 'SELECT';
    } else if (upperQuery.startsWith('INSERT')) {
      return 'INSERT';
    } else if (upperQuery.startsWith('UPDATE')) {
      return 'UPDATE';
    } else if (upperQuery.startsWith('DELETE')) {
      return 'DELETE';
    }

    // 默认返回 SELECT（保守策略）
    return 'SELECT';
  }

  /**
   * 提取查询中涉及的表名
   */
  private extractTables(query: string): string[] {
    const tables: string[] = [];

    // 匹配 FROM 和 JOIN 后的表名
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

    return [...new Set(tables)]; // 去重
  }

  /**
   * 检查参数数量
   */
  checkParamsCount(params: any[] | undefined, config: PermissionConfig = {}): PermissionCheckResult {
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
}

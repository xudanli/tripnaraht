// src/common/middlewares/security.middleware.ts
import { Injectable, NestMiddleware, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface SecurityEvent {
  type: string;
  pattern: RegExp;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Security');

  // 已知的攻击模式（用于 URL 路径和 body）
  private readonly attackPatterns: SecurityEvent[] = [
    // PHPUnit 相关漏洞（虽然这是 Node.js 应用，但仍需阻止）
    {
      type: 'phpunit_exploit',
      pattern: /phpunit|eval-stdin\.php|vendor\/phpunit/i,
      severity: 'high',
      description: 'PHPUnit exploit attempt detected',
    },
    // 路径遍历
    {
      type: 'path_traversal',
      pattern: /\.\.\/|\.\.\\|\.\.%2f|\.\.%5c|%2e%2e%2f|%2e%2e%5c/i,
      severity: 'high',
      description: 'Path traversal attempt detected',
    },
    // SQL 注入尝试（更精确的模式）
    {
      type: 'sql_injection',
      pattern: /\b(union\s+select|insert\s+into|drop\s+table|delete\s+from|update\s+.*\s+set|exec\s*\(|execute\s*\(|';?\s*(--|#|\/\*)|'or\s+['\d]|'and\s+['\d])/i,
      severity: 'critical',
      description: 'SQL injection attempt detected',
    },
    // 命令注入尝试（更精确的模式，检测实际的命令执行模式）
    {
      type: 'command_injection',
      pattern: /(\$\s*\([^)]*\)|`[^`]*`|;\s*(ls|cat|rm|wget|curl|nc|bash|sh|python|perl)|(\|\||&&)\s*(ls|cat|rm|wget|curl|nc|bash|sh|python|perl))/i,
      severity: 'critical',
      description: 'Command injection attempt detected',
    },
    // 常见的漏洞扫描路径
    {
      type: 'vulnerability_scan',
      pattern: /\/(wp-admin|wp-login|phpmyadmin|adminer|\.env|\.git|\.svn|\.hg|\.bzr|\.idea|\.vscode|\.DS_Store|web\.config|\.htaccess|\.htpasswd|backup|config|database|db|sql|dump|backup|\.sql|\.bak|\.old|\.orig|\.tmp|\.log|\.ini|\.conf)/i,
      severity: 'medium',
      description: 'Vulnerability scanning path detected',
    },
    // XSS 尝试
    {
      type: 'xss_attempt',
      pattern: /<script|javascript:|onerror=|onload=|onclick=|onmouseover=|onfocus=|onblur=|eval\(|document\.cookie|alert\(/i,
      severity: 'high',
      description: 'XSS attempt detected',
    },
    // 文件包含尝试
    {
      type: 'file_inclusion',
      pattern: /(\/etc\/passwd|\/etc\/shadow|\/proc\/self\/environ|php:\/\/filter|php:\/\/input|data:\/\/|expect:\/\/)/i,
      severity: 'high',
      description: 'File inclusion attempt detected',
    },
    // XML 外部实体注入
    {
      type: 'xxe_injection',
      pattern: /<!ENTITY|SYSTEM\s+["']|file:\/\/|http:\/\//i,
      severity: 'high',
      description: 'XXE injection attempt detected',
    },
  ];

  use(req: Request, res: Response, next: NextFunction) {
    const url = req.originalUrl || req.url;
    const method = req.method;
    const userAgent = req.headers['user-agent'] || '';
    const ip = req.ip || 
               req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || 
               req.socket.remoteAddress || 
               'unknown';

    // 检查 URL
    const urlThreat = this.detectThreat(url);
    if (urlThreat) {
      return this.handleThreat(req, res, next, urlThreat, { url, method, ip, userAgent });
    }

    // 检查查询参数（使用更宽松的规则，只检查明显的攻击模式）
    if (req.query) {
      const queryString = JSON.stringify(req.query);
      // 对于查询参数，只检查路径遍历和明显的 SQL 注入，不检查命令注入（因为查询参数中常见字符会误报）
      const queryThreat = this.detectQueryThreat(queryString);
      if (queryThreat) {
        return this.handleThreat(req, res, next, queryThreat, { url, method, ip, userAgent, location: 'query' });
      }
    }

    // 检查 POST body（仅检查字符串内容）
    if (req.body && typeof req.body === 'object') {
      const bodyString = JSON.stringify(req.body);
      const bodyThreat = this.detectThreat(bodyString);
      if (bodyThreat) {
        return this.handleThreat(req, res, next, bodyThreat, { url, method, ip, userAgent, location: 'body' });
      }
    }

    // 检查 User-Agent（常见扫描工具）
    const suspiciousUserAgents = [
      /sqlmap/i,
      /nikto/i,
      /nmap/i,
      /masscan/i,
      /zap/i,
      /burp/i,
      /acunetix/i,
      /nessus/i,
      /qualys/i,
    ];

    for (const pattern of suspiciousUserAgents) {
      if (pattern.test(userAgent)) {
        const threat: SecurityEvent = {
          type: 'suspicious_user_agent',
          pattern: pattern,
          severity: 'medium',
          description: `Suspicious user agent detected: ${userAgent}`,
        };
        return this.handleThreat(req, res, next, threat, { url, method, ip, userAgent });
      }
    }

    next();
  }

  private detectThreat(input: string): SecurityEvent | null {
    for (const pattern of this.attackPatterns) {
      if (pattern.pattern.test(input)) {
        return pattern;
      }
    }
    return null;
  }

  // 查询参数专用的威胁检测（更宽松，避免误报）
  private detectQueryThreat(input: string): SecurityEvent | null {
    // 只检查明显的路径遍历
    const pathTraversal = /\.\.\/|\.\.\\|\.\.%2f|\.\.%5c|%2e%2e%2f|%2e%2e%5c/i;
    if (pathTraversal.test(input)) {
      return {
        type: 'path_traversal',
        pattern: pathTraversal,
        severity: 'high',
        description: 'Path traversal attempt detected in query parameters',
      };
    }

    // 只检查明显的 SQL 注入（更精确的模式）
    const sqlInjection = /\b(union\s+select|insert\s+into|drop\s+table|delete\s+from|';?\s*(--|#|\/\*)|'or\s+1\s*=\s*1|'and\s+1\s*=\s*1)/i;
    if (sqlInjection.test(input)) {
      return {
        type: 'sql_injection',
        pattern: sqlInjection,
        severity: 'critical',
        description: 'SQL injection attempt detected in query parameters',
      };
    }

    return null;
  }

  private handleThreat(
    req: Request,
    res: Response,
    next: NextFunction,
    threat: SecurityEvent,
    context: { url: string; method: string; ip: string; userAgent: string; location?: string }
  ) {
    const { url, method, ip, userAgent, location } = context;

    // 记录安全事件
    const logMessage = `🚨 [Security Alert] ${threat.severity.toUpperCase()}: ${threat.type} - ${threat.description}`;
    const contextMessage = `Method: ${method}, URL: ${url}${location ? `, Location: ${location}` : ''}, IP: ${ip}, User-Agent: ${userAgent}`;

    // 根据严重程度使用不同的日志级别
    switch (threat.severity) {
      case 'critical':
        this.logger.error(`${logMessage}\n${contextMessage}`);
        console.error(`[Security] ${logMessage}`);
        console.error(`[Security] ${contextMessage}`);
        break;
      case 'high':
        this.logger.warn(`${logMessage}\n${contextMessage}`);
        console.warn(`[Security] ${logMessage}`);
        console.warn(`[Security] ${contextMessage}`);
        break;
      case 'medium':
        this.logger.warn(`${logMessage}\n${contextMessage}`);
        console.warn(`[Security] ${logMessage}`);
        break;
      case 'low':
        this.logger.log(`${logMessage}\n${contextMessage}`);
        break;
    }

    // 对于高严重程度和关键严重程度，直接拒绝请求
    if (threat.severity === 'high' || threat.severity === 'critical') {
      res.status(HttpStatus.FORBIDDEN).json({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Access denied',
        error: 'Forbidden',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 对于中等和低严重程度，允许继续但记录警告
    // 可以在这里添加额外的监控或限流逻辑
    next();
  }
}

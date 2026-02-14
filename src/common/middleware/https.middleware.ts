// src/common/middleware/https.middleware.ts

/**
 * HTTPS 强制中间件
 *
 * 用途：
 * - 生产环境强制 HTTPS
 * - 阻止不安全的 HTTP 连接
 * - 设置 HSTS (HTTP Strict-Transport-Security) 头
 * - 通过代理正确识别 HTTPS (支持负载均衡器)
 *
 * 遵循 OWASP 最佳实践：
 * - HTTPS 强制 (https://cheatsheetseries.owasp.org/cheatsheets/HTTPS_Cheat_Sheet.html)
 * - HSTS 实现 (https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html)
 */

import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class HttpsMiddleware implements NestMiddleware {
  private readonly logger = new Logger(HttpsMiddleware.name);
  private readonly isProduction = process.env.NODE_ENV === 'production';
  private readonly httpsRedirectEnabled = process.env.HTTPS_REDIRECT !== 'false';

  use(req: Request, res: Response, next: NextFunction) {
    // 在生产环境强制 HTTPS
    const isSecure = this.isSecureConnection(req);

    if (!isSecure && this.isProduction && this.httpsRedirectEnabled) {
      this.logger.warn(
        `[HTTPS Enforcement] Redirecting insecure request: ${req.method} ${req.path} from ${req.ip}`
      );

      // 重定向到 HTTPS
      const httpsUrl = `https://${req.get('host')}${req.originalUrl}`;
      return res.redirect(301, httpsUrl);
    }

    // 设置 HSTS 头（仅在 HTTPS 连接上）
    if (isSecure) {
      // 严格-传输-安全: max-age=31536000 (1 年), 包含子域名, 预加载列表
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload'
      );
    }

    // 防止点击劫持
    res.setHeader('X-Frame-Options', 'DENY');

    // 防止 MIME 类型嗅探
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 启用 XSS 保护
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // CSP (Content Security Policy)
    res.setHeader('Content-Security-Policy', "default-src 'self'");

    next();
  }

  /**
   * 判断是否为安全连接
   *
   * 考虑因素：
   * - req.protocol (Node.js 本地检测)
   * - X-Forwarded-Proto (代理头，如 nginx, AWS ALB)
   * - req.secure (Express 标准属性)
   */
  private isSecureConnection(req: Request): boolean {
    // 检查 X-Forwarded-Proto 头 (用于负载均衡器、代理)
    const forwaredProto = req.get('X-Forwarded-Proto');
    if (forwaredProto === 'https') {
      return true;
    }

    // 检查 req.secure (Express 标准)
    if (req.secure === true) {
      return true;
    }

    // 检查 req.protocol
    if (req.protocol === 'https') {
      return true;
    }

    return false;
  }
}

"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityMiddleware = void 0;
const common_1 = require("@nestjs/common");
let SecurityMiddleware = class SecurityMiddleware {
    constructor() {
        this.logger = new common_1.Logger('Security');
        this.attackPatterns = [
            {
                type: 'phpunit_exploit',
                pattern: /phpunit|eval-stdin\.php|vendor\/phpunit/i,
                severity: 'high',
                description: 'PHPUnit exploit attempt detected',
            },
            {
                type: 'path_traversal',
                pattern: /\.\.\/|\.\.\\|\.\.%2f|\.\.%5c|%2e%2e%2f|%2e%2e%5c/i,
                severity: 'high',
                description: 'Path traversal attempt detected',
            },
            {
                type: 'sql_injection',
                pattern: /\b(union\s+select|insert\s+into|drop\s+table|delete\s+from|update\s+.*\s+set|exec\s*\(|execute\s*\(|';?\s*(--|#|\/\*)|'or\s+['\d]|'and\s+['\d])/i,
                severity: 'critical',
                description: 'SQL injection attempt detected',
            },
            {
                type: 'command_injection',
                pattern: /(\$\s*\([^)]*\)|`[^`]*`|;\s*(ls|cat|rm|wget|curl|nc|bash|sh|python|perl)|(\|\||&&)\s*(ls|cat|rm|wget|curl|nc|bash|sh|python|perl))/i,
                severity: 'critical',
                description: 'Command injection attempt detected',
            },
            {
                type: 'vulnerability_scan',
                pattern: /\/(wp-admin|wp-login|phpmyadmin|adminer|\.env|\.git|\.svn|\.hg|\.bzr|\.idea|\.vscode|\.DS_Store|web\.config|\.htaccess|\.htpasswd|backup|config|database|db|sql|dump|backup|\.sql|\.bak|\.old|\.orig|\.tmp|\.log|\.ini|\.conf)/i,
                severity: 'medium',
                description: 'Vulnerability scanning path detected',
            },
            {
                type: 'xss_attempt',
                pattern: /<script|javascript:|onerror=|onload=|onclick=|onmouseover=|onfocus=|onblur=|eval\(|document\.cookie|alert\(/i,
                severity: 'high',
                description: 'XSS attempt detected',
            },
            {
                type: 'file_inclusion',
                pattern: /(\/etc\/passwd|\/etc\/shadow|\/proc\/self\/environ|php:\/\/filter|php:\/\/input|data:\/\/|expect:\/\/)/i,
                severity: 'high',
                description: 'File inclusion attempt detected',
            },
            {
                type: 'xxe_injection',
                pattern: /<!ENTITY|SYSTEM\s+["']|file:\/\/|http:\/\//i,
                severity: 'high',
                description: 'XXE injection attempt detected',
            },
        ];
    }
    use(req, res, next) {
        var _a, _b;
        const url = req.originalUrl || req.url;
        const method = req.method;
        const userAgent = req.headers['user-agent'] || '';
        const ip = req.ip ||
            ((_b = (_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.toString().split(',')[0]) === null || _b === void 0 ? void 0 : _b.trim()) ||
            req.socket.remoteAddress ||
            'unknown';
        const urlThreat = this.detectThreat(url);
        if (urlThreat) {
            return this.handleThreat(req, res, next, urlThreat, { url, method, ip, userAgent });
        }
        if (req.query) {
            const queryString = JSON.stringify(req.query);
            const queryThreat = this.detectQueryThreat(queryString);
            if (queryThreat) {
                return this.handleThreat(req, res, next, queryThreat, { url, method, ip, userAgent, location: 'query' });
            }
        }
        if (req.body && typeof req.body === 'object') {
            const bodyString = JSON.stringify(req.body);
            const bodyThreat = this.detectThreat(bodyString);
            if (bodyThreat) {
                return this.handleThreat(req, res, next, bodyThreat, { url, method, ip, userAgent, location: 'body' });
            }
        }
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
                const threat = {
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
    detectThreat(input) {
        for (const pattern of this.attackPatterns) {
            if (pattern.pattern.test(input)) {
                return pattern;
            }
        }
        return null;
    }
    detectQueryThreat(input) {
        const pathTraversal = /\.\.\/|\.\.\\|\.\.%2f|\.\.%5c|%2e%2e%2f|%2e%2e%5c/i;
        if (pathTraversal.test(input)) {
            return {
                type: 'path_traversal',
                pattern: pathTraversal,
                severity: 'high',
                description: 'Path traversal attempt detected in query parameters',
            };
        }
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
    handleThreat(req, res, next, threat, context) {
        const { url, method, ip, userAgent, location } = context;
        const logMessage = `🚨 [Security Alert] ${threat.severity.toUpperCase()}: ${threat.type} - ${threat.description}`;
        const contextMessage = `Method: ${method}, URL: ${url}${location ? `, Location: ${location}` : ''}, IP: ${ip}, User-Agent: ${userAgent}`;
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
        if (threat.severity === 'high' || threat.severity === 'critical') {
            res.status(common_1.HttpStatus.FORBIDDEN).json({
                statusCode: common_1.HttpStatus.FORBIDDEN,
                message: 'Access denied',
                error: 'Forbidden',
                timestamp: new Date().toISOString(),
            });
            return;
        }
        next();
    }
};
exports.SecurityMiddleware = SecurityMiddleware;
exports.SecurityMiddleware = SecurityMiddleware = __decorate([
    (0, common_1.Injectable)()
], SecurityMiddleware);
//# sourceMappingURL=security.middleware.js.map
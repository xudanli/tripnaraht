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
var McpOAuthController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpOAuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let McpOAuthController = McpOAuthController_1 = class McpOAuthController {
    constructor() {
        this.logger = new common_1.Logger(McpOAuthController_1.name);
    }
    async callback(code, state, error, errorDescription, res) {
        this.logger.log(`OAuth callback received: code=${code ? 'present' : 'missing'}, state=${state}, error=${error || 'none'}`);
        if (error) {
            this.logger.error(`OAuth error: ${error} - ${errorDescription || 'No description'}`);
            return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth 认证失败</title>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 2rem;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              max-width: 500px;
            }
            h1 { color: #d32f2f; margin-top: 0; }
            .error { color: #666; margin: 1rem 0; }
            .code { background: #f5f5f5; padding: 0.5rem; border-radius: 4px; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ OAuth 认证失败</h1>
            <div class="error">
              <strong>错误:</strong> ${error}
            </div>
            ${errorDescription ? `<div class="error"><strong>描述:</strong> ${errorDescription}</div>` : ''}
            <p>请检查认证流程或联系支持。</p>
          </div>
        </body>
        </html>
      `);
        }
        if (code) {
            this.logger.log(`OAuth authorization code received: ${code.substring(0, 20)}...`);
            return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth 认证成功</title>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: #f5f5f5;
            }
            .container {
              background: white;
              padding: 2rem;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              max-width: 500px;
              text-align: center;
            }
            h1 { color: #2e7d32; margin-top: 0; }
            .success { color: #666; margin: 1rem 0; }
            .code { background: #f5f5f5; padding: 0.5rem; border-radius: 4px; font-family: monospace; font-size: 0.9em; word-break: break-all; }
            .note { color: #999; font-size: 0.9em; margin-top: 1rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ OAuth 认证成功</h1>
            <div class="success">
              <p>授权码已接收，认证信息正在处理中...</p>
              <div class="code">${code}</div>
            </div>
            <div class="note">
              <p>您可以关闭此窗口。</p>
              <p>如果这是首次认证，请返回命令行查看后续步骤。</p>
            </div>
          </div>
        </body>
        </html>
      `);
        }
        return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAuth 回调</title>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            max-width: 500px;
            text-align: center;
          }
          h1 { color: #1976d2; margin-top: 0; }
          .info { color: #666; margin: 1rem 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>OAuth 回调端点</h1>
          <div class="info">
            <p>这是 MCP 服务的 OAuth 回调端点。</p>
            <p>请通过 OAuth 授权流程访问此页面。</p>
          </div>
        </div>
      </body>
      </html>
    `);
    }
};
exports.McpOAuthController = McpOAuthController;
__decorate([
    (0, common_1.Get)('callback'),
    (0, swagger_1.ApiOperation)({ summary: 'OAuth 回调端点' }),
    (0, swagger_1.ApiQuery)({ name: 'code', description: '授权码', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'state', description: '状态参数', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'error', description: '错误信息', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'error_description', description: '错误描述', required: false }),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Query)('state')),
    __param(2, (0, common_1.Query)('error')),
    __param(3, (0, common_1.Query)('error_description')),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], McpOAuthController.prototype, "callback", null);
exports.McpOAuthController = McpOAuthController = McpOAuthController_1 = __decorate([
    (0, swagger_1.ApiTags)('MCP OAuth'),
    (0, common_1.Controller)('oauth'),
    (0, public_decorator_1.Public)()
], McpOAuthController);
//# sourceMappingURL=mcp-oauth.controller.js.map
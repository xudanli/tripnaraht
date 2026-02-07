import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { Response } from 'express';

/**
 * MCP OAuth 回调控制器
 * 
 * 处理所有 MCP 服务的 OAuth 回调
 * 回调 URL: /oauth/callback
 */
@ApiTags('MCP OAuth')
@Controller('oauth') // 路径: /oauth/callback（绕过全局 /api 前缀）
@Public()
export class McpOAuthController {
  private readonly logger = new Logger(McpOAuthController.name);

  @Get('callback')
  @ApiOperation({ summary: 'OAuth 回调端点' })
  @ApiQuery({ name: 'code', description: '授权码', required: false })
  @ApiQuery({ name: 'state', description: '状态参数', required: false })
  @ApiQuery({ name: 'error', description: '错误信息', required: false })
  @ApiQuery({ name: 'error_description', description: '错误描述', required: false })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    this.logger.log(`OAuth callback received: code=${code ? 'present' : 'missing'}, state=${state}, error=${error || 'none'}`);

    // 如果有错误，显示错误页面
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

    // 如果有授权码，显示成功页面
    if (code) {
      this.logger.log(`OAuth authorization code received: ${code.substring(0, 20)}...`);
      
      // 注意：MCP SDK 会自动处理授权码交换
      // 这里只是显示成功页面，实际的 token 交换由 SDK 在后台完成
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

    // 既没有 code 也没有 error，显示等待页面
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
}

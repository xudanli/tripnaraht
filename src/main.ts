// src/main.ts
import 'reflect-metadata'; // 必须在最顶部导入，用于装饰器支持

// ⚠️ 重要：在导入任何模块之前设置环境变量，确保 RedisModule 能正确读取
// 从 .env 文件读取 DISABLE_REDIS，如果没有设置且 Redis 不可用，则自动禁用
if (!process.env.DISABLE_REDIS || process.env.DISABLE_REDIS === 'false') {
  // 简单检查：如果 REDIS_HOST 未设置或为 localhost，默认禁用 Redis
  const redisHost = process.env.REDIS_HOST || 'localhost';
  if (redisHost === 'localhost' || redisHost === '127.0.0.1') {
    // 默认情况下，如果没有明确的 Redis 配置，使用内存缓存
    // 避免尝试连接不可用的 Redis 导致阻塞
    process.env.DISABLE_REDIS = 'true';
  }
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { SecurityMiddleware } from './common/middlewares/security.middleware';

async function bootstrap() {
  console.log('🚀 [Bootstrap] 开始启动应用...');
  console.log(`🔍 [Bootstrap] DISABLE_REDIS=${process.env.DISABLE_REDIS || 'false'}`);
  
  // 根据环境变量设置日志级别（生产环境默认不显示 debug）
  const logLevels = process.env.LOG_LEVEL 
    ? process.env.LOG_LEVEL.split(',').map(level => level.trim() as any)
    : process.env.NODE_ENV === 'production'
      ? ['error', 'warn', 'log'] // 生产环境不显示 debug
      : ['error', 'warn', 'log', 'debug']; // 开发环境显示所有日志
  
  console.log('🏭 [Bootstrap] 创建 NestFactory...');
  const startTime = Date.now();
  
  let app;
  try {
    // 添加超时保护，避免无限等待
    const createPromise = NestFactory.create(AppModule, {
      logger: logLevels,
      bodyParser: false, // 禁用默认 body parser，以便使用更大的 limit
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`NestFactory.create() 超时（60秒）。当前模块初始化可能未完成。请检查是否有模块的 onModuleInit 或异步初始化操作卡住。`));
      }, 60000);
    });
    
    console.log('⏳ [Bootstrap] 等待 NestFactory.create() 完成...');
    
    // 添加进度日志，每 5 秒输出一次
    const progressInterval = setInterval(() => {
      console.log('⏳ [Bootstrap] 仍在等待 NestFactory.create() 完成... (已等待 ' + Math.floor((Date.now() - startTime) / 1000) + ' 秒)');
    }, 5000);
    
    try {
      app = await Promise.race([createPromise, timeoutPromise]);
      clearInterval(progressInterval);
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
    const duration = Date.now() - startTime;
    console.log(`✅ [Bootstrap] NestFactory 创建完成 (耗时: ${duration}ms)`);
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ [Bootstrap] NestFactory 创建失败 (耗时: ${duration}ms)`);
    console.error(`错误: ${error.message}`);
    if (error.stack) {
      console.error(`堆栈: ${error.stack}`);
    }
    process.exit(1);
  }

  // 自定义 body parser（支持更大 payload，避免 planning-assistant chat 等接口 "request entity too large"）
  const bodyLimit = process.env.BODY_PARSER_LIMIT || '2mb';
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  // 设置全局 API 前缀
  app.setGlobalPrefix('api');
  
  // Cookie parser middleware (must be before other middleware)
  const cookieParser = require('cookie-parser');
  app.use(cookieParser());
  
  // 安全中间件（应该在其他中间件之前，尽早拦截恶意请求）
  console.log('✅ 安全中间件已注册');
  const securityMiddleware = new SecurityMiddleware();
  const httpAdapter = app.getHttpAdapter();
  
  // 添加根路径健康检查端点（绕过全局前缀）
  httpAdapter.get('/health', (req: any, res: any) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'tripnara-api',
    });
  });
  
  // 添加 OAuth 回调端点（绕过全局前缀，供 MCP 服务使用）
  httpAdapter.get('/oauth/callback', (req: any, res: any) => {
    const code = req.query.code;
    const error = req.query.error;
    const errorDescription = req.query.error_description;
    
    if (error) {
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
              <div class="code">${code.substring(0, 50)}...</div>
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
  });
  
  // 添加根路径端点
  httpAdapter.get('/', (req: any, res: any) => {
    res.json({
      message: 'TripNara API',
      version: '1.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      docs: '/api-docs',
    });
  });
  httpAdapter.use((req: any, res: any, next: any) => {
    securityMiddleware.use(req, res, next);
  });
  
  // 全局异常过滤器（必须在其他全局配置之前注册）
  console.log('✅ 全局异常过滤器已注册');
  app.useGlobalFilters(new AllExceptionsFilter());
  
  // HTTP 访问日志 - 使用拦截器（推荐方式，更可靠）
  console.log('✅ HTTP 访问日志拦截器已注册');
  app.useGlobalInterceptors(new LoggingInterceptor());
  
  // HTTP 访问日志 - 同时使用中间件作为备选（确保捕获所有请求，包括 401 和使用 @Res() 的情况）
  const logger = new Logger('HTTP');
  console.log('✅ HTTP 访问日志中间件已注册');
  httpAdapter.use((req: any, res: any, next: any) => {
    // 设置浏览器缓存为72小时（259200秒）
    // 排除 API 路径和动态内容，只对静态资源设置缓存
    const isStaticResource = /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i.test(req.originalUrl);
    const isApiPath = req.originalUrl.startsWith('/api');
    
    if (isStaticResource && !isApiPath) {
      // 静态资源：72小时缓存
      res.setHeader('Cache-Control', 'public, max-age=259200, immutable');
    } else if (!isApiPath) {
      // 非API路径的HTML等：72小时缓存
      res.setHeader('Cache-Control', 'public, max-age=259200');
    } else {
      // API路径：不缓存（确保数据实时性）
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    
    // 立即打印请求到达日志
    console.log(`[HTTP-Middleware] 请求到达: ${req.method} ${req.originalUrl}`);
    logger.log(`[Middleware] 请求到达: ${req.method} ${req.originalUrl}`);
    
    const start = Date.now();
    // 监听响应完成事件
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logMessage = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
      console.log(`[HTTP-Middleware] ${logMessage}`);
      logger.log(`[Middleware] ${logMessage}`);
    });
    // 监听响应关闭事件（处理客户端提前断开连接的情况）
    res.on('close', () => {
      if (!res.writableFinished) {
        const duration = Date.now() - start;
        const logMessage = `${req.method} ${req.originalUrl} ${res.statusCode || 0} ${duration}ms [CLOSED]`;
        console.warn(`[HTTP-Middleware] ${logMessage}`);
        logger.warn(`[Middleware] ${logMessage}`);
      }
    });
    next();
  });
  
  // 启用全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      skipMissingProperties: false, // 不跳过缺失属性（保持严格验证）
      skipNullProperties: true, // 跳过 null 值（允许 undefined）
      skipUndefinedProperties: true, // 跳过 undefined 值（允许可选字段）
      forbidNonWhitelisted: false, // 允许额外的属性
      transformOptions: {
        enableImplicitConversion: true, // 启用隐式类型转换
      },
    })
  );
  
  // 启用 CORS（配置支持 credentials/cookies）
  // 支持多个前端域名（开发和生产环境）
  // 方式1: 使用 FRONTEND_URLS 环境变量（逗号分隔多个域名）
  // 方式2: 使用 FRONTEND_URL 环境变量（单个域名）
  const frontendUrls = process.env.FRONTEND_URLS 
    ? process.env.FRONTEND_URLS.split(',').map(url => url.trim()).filter(url => url)
    : process.env.FRONTEND_URL 
      ? [process.env.FRONTEND_URL]
      : [];
  
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // 允许无 origin 的请求（如 Postman、移动应用、服务端请求等）
      if (!origin) {
        return callback(null, true);
      }
      
      // 如果没有配置 FRONTEND_URL
      if (frontendUrls.length === 0) {
        if (process.env.NODE_ENV === 'production') {
          // 生产环境：允许所有来源，但记录严重警告
          // 建议尽快配置 FRONTEND_URL 以提高安全性
          console.error('🚨 [CORS 安全警告] 生产环境未配置 FRONTEND_URL，当前允许所有来源');
          console.error('   请尽快在环境变量中配置 FRONTEND_URL 或 FRONTEND_URLS');
          console.error('   例如: FRONTEND_URL=https://tripnara.com');
          // 允许请求，但记录警告
          return callback(null, true);
        }
        // 开发环境：允许所有来源
        return callback(null, true);
      }
      
      // 检查 origin 是否在允许列表中
      const isAllowed = frontendUrls.some(url => {
        // 精确匹配
        if (origin === url) return true;
        // 前缀匹配（支持子域名和端口，如 http://example.com:5173）
        const urlBase = url.replace(/\/$/, ''); // 移除尾部斜杠
        if (origin.startsWith(urlBase)) return true;
        return false;
      });
      
      if (isAllowed) {
        callback(null, true);
      } else {
        // 开发环境：额外允许 localhost 和 127.0.0.1（方便本地调试）
        if (process.env.NODE_ENV !== 'production' && 
            (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
          callback(null, true);
        } else {
          console.warn(`⚠️  CORS: 拒绝来自 ${origin} 的请求`);
          console.warn(`   允许的域名: ${frontendUrls.join(', ')}`);
          callback(new Error('Not allowed by CORS'));
        }
      }
    },
    credentials: true, // 允许发送 cookies（必需，用于 refresh_token cookie）
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Authorization'],
    maxAge: 86400, // 24小时预检缓存
  });
  
  // 输出 CORS 配置信息
  if (frontendUrls.length > 0) {
    console.log(`✅ CORS 配置: 允许的前端域名: ${frontendUrls.join(', ')}`);
  } else if (process.env.NODE_ENV !== 'production') {
    console.log('⚠️  CORS 配置: 未配置 FRONTEND_URL，开发模式允许所有来源');
  }
  console.log('✅ [Bootstrap] 中间件和 CORS 配置完成');
  
  // ============================================
  // 📚 Swagger/OpenAPI 文档配置
  // ============================================
  console.log('📚 [Bootstrap] 开始配置 Swagger...');
  const config = new DocumentBuilder()
    .setTitle('TripNara API')
    .setDescription('智能旅行规划 API - 支持行程创建、地点查询、AI 策略计算等功能')
    .setVersion('1.0')
    .addTag('trips', '行程管理相关接口')
    .addTag('places', '地点查询相关接口')
    .addTag('itinerary-items', '行程项管理相关接口')
    .addTag('itinerary-optimization', '路线优化相关接口（节奏感算法）')
    .addTag('transport', '交通规划相关接口')
    .addTag('flight-prices', '机票价格参考相关接口')
    .addTag('countries', '国家档案相关接口')
    .addTag('planning-policy', '规划策略相关接口（画像驱动、稳健度评估、What-If）')
    .addTag('voice', '语音解析相关接口')
    .addTag('vision', '视觉识别相关接口（拍照识别 POI）')
    .addTag('schedule-action', '行程动作执行相关接口')
    .addTag('agent', '智能体统一入口（COALA + ReAct 双系统架构）')
    .addTag('decision', '决策层接口（Abu/Dr.Dre/Neptune 策略、约束校验、可解释性、学习机制）')
    .addTag('rag', 'RAG 检索增强生成接口（文档检索、合规规则提取、目的地深度信息）')
    .addTag('readiness', '旅行准备度检查接口（个性化准备清单、风险预警）')
    .addTag('auth', '认证相关接口（Google OAuth）')
    .addTag('contact', '联系我们接口（反馈消息和图片上传）')
    .addTag('google-calendar', 'Google Calendar 集成接口（行程同步、事件管理）')
    .addTag('browserbase-mcp', 'Browserbase MCP 接口（浏览器自动化）')
    .addTag('exa', 'Exa 搜索服务接口（实时信息、风险检查、政策更新）')
    .addTag('airbnb', 'Airbnb 住宿服务接口（可用性检查、价格估算、偏好匹配）')
    .addTag('world-model-evidence', '世界模型证据接口（DEM证据、道路状态、天气窗口、路线哲学、失败画像）')
    .addServer('http://47.253.148.159', '生产环境')
    .addCookieAuth('refresh_token')
    .addBearerAuth()
    .build();
  console.log('✅ [Bootstrap] Swagger config 创建完成');
  
  console.log('📄 [Bootstrap] 开始生成 Swagger 文档...');
  const document = SwaggerModule.createDocument(app, config);
  console.log('✅ [Bootstrap] Swagger document 创建完成');
  
  console.log('🎨 [Bootstrap] 开始设置 Swagger UI...');
  // Swagger UI 路径设置为 /api-docs，避免与 API 路径冲突
  SwaggerModule.setup('api-docs', app, document, {
    customSiteTitle: 'TripNara API 文档',
    customfavIcon: '/favicon.ico',
    customCss: '.swagger-ui .topbar { display: none }',
  });
  console.log('✅ [Bootstrap] Swagger UI 设置完成');
  
  console.log('🌐 [Bootstrap] 开始监听端口...');
  const port = Number(process.env.PORT ?? 3000);
  
  // 设置HTTP服务器超时（默认2分钟，对于规划工作台等长时间操作）
  const server = await app.listen(port, '0.0.0.0'); // ✅ 关键：不要只绑 127.0.0.1
  server.timeout = 120000; // 2分钟超时（120秒），适用于规划工作台等长时间操作
  server.keepAliveTimeout = 65000; // keep-alive超时（65秒）
  server.headersTimeout = 66000; // headers超时（66秒，必须大于keepAliveTimeout）
  
  console.log(`✅ [Bootstrap] API listening on http://0.0.0.0:${port}`);
  console.log(`✅ [Bootstrap] HTTP服务器超时设置: ${server.timeout}ms (${server.timeout / 1000}秒)`);
  console.log(`📚 Swagger 文档: http://0.0.0.0:${port}/api-docs`);
}

bootstrap();


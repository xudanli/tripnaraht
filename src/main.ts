// src/main.ts
import 'reflect-metadata'; // 必须在最顶部导入，用于装饰器支持
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Cookie parser middleware (must be before other middleware)
  const cookieParser = require('cookie-parser');
  app.use(cookieParser());
  
  // HTTP 访问日志 - 使用拦截器（推荐方式，更可靠）
  console.log('✅ HTTP 访问日志拦截器已注册');
  app.useGlobalInterceptors(new LoggingInterceptor());
  
  // HTTP 访问日志 - 同时使用中间件作为备选（确保捕获所有请求，包括 401 和使用 @Res() 的情况）
  const logger = new Logger('HTTP');
  console.log('✅ HTTP 访问日志中间件已注册');
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.use((req: any, res: any, next: any) => {
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
      
      // 如果没有配置 FRONTEND_URL，开发环境允许所有来源
      if (frontendUrls.length === 0) {
        if (process.env.NODE_ENV === 'production') {
          console.warn('⚠️  CORS: 生产环境未配置 FRONTEND_URL，拒绝所有请求');
          return callback(new Error('CORS not configured for production'));
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
  
  // ============================================
  // 📚 Swagger/OpenAPI 文档配置
  // ============================================
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
    .addServer('http://47.253.148.159', '生产环境')
    .addCookieAuth('refresh_token')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    customSiteTitle: 'TripNara API 文档',
    customfavIcon: '/favicon.ico',
    customCss: '.swagger-ui .topbar { display: none }',
  });
  
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Application is running on: http://0.0.0.0:${port}`);
  console.log(`📚 Swagger 文档: http://0.0.0.0:${port}/api`);
}

bootstrap();


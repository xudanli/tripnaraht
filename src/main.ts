// src/main.ts
import 'reflect-metadata'; // 必须在最顶部导入，用于装饰器支持
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Cookie parser middleware (must be before other middleware)
  const cookieParser = require('cookie-parser');
  app.use(cookieParser());
  
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
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
  app.enableCors({
    origin: frontendUrl,
    credentials: true, // 允许发送 cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  
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
    .addTag('auth', '认证相关接口（Google OAuth）')
    .addServer('http://localhost:3000', '开发环境')
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
  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger 文档: http://localhost:${port}/api`);
}

bootstrap();


// src/main.ts
import 'reflect-metadata'; // 必须在最顶部导入，用于装饰器支持
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 启用全局验证管道
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));
  
  // 启用 CORS（如果需要前端调用）
  app.enableCors();
  
  // ============================================
  // 📚 Swagger/OpenAPI 文档配置
  // ============================================
  const config = new DocumentBuilder()
    .setTitle('TripNara API')
    .setDescription('智能旅行规划 API - 支持行程创建、地点查询、AI 策略计算等功能')
    .setVersion('1.0')
    .addTag('trips', '行程管理相关接口')
    .addTag('places', '地点查询相关接口')
    .addServer('http://localhost:3000', '开发环境')
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


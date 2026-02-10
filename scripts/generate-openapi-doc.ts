/**
 * 生成 OpenAPI/Swagger JSON 文档
 * 
 * 使用方法:
 *   npx ts-node scripts/generate-openapi-doc.ts
 * 
 * 输出文件: openapi.json
 */

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import * as path from 'path';

async function generateOpenAPIDoc() {
  console.log('🚀 开始生成 OpenAPI 文档...');

  // 创建应用实例（不需要监听端口）
  const app = await NestFactory.create(AppModule, {
    logger: false, // 禁用日志输出
  });

  // 配置 Swagger（与 main.ts 保持一致）
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
    .addTag('exa', 'Exa 搜索服务接口（实时信息、风险检查、政策更新）')
    .addTag('world-model-evidence', '世界模型证据接口（DEM证据、道路状态、天气窗口、路线哲学、失败画像）')
    .addTag('airbnb', 'Airbnb 住宿服务接口（可用性检查、价格估算、偏好匹配）')
    .addServer('http://47.253.148.159', '生产环境')
    .addServer('http://localhost:3000', '本地开发环境')
    .addCookieAuth('refresh_token')
    .addBearerAuth()
    .build();

  // 生成 OpenAPI 文档
  const document = SwaggerModule.createDocument(app, config);

  // 保存为 JSON 文件
  const outputPath = path.join(process.cwd(), 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf-8');

  console.log(`✅ OpenAPI 文档已生成: ${outputPath}`);
  console.log(`📊 包含 ${Object.keys(document.paths || {}).length} 个 API 端点`);

  // 关闭应用
  await app.close();
}

generateOpenAPIDoc().catch((error) => {
  console.error('❌ 生成 OpenAPI 文档失败:', error);
  process.exit(1);
});

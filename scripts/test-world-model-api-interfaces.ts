/**
 * 世界模型API接口测试脚本
 * 
 * 测试以下接口：
 * 1. Google Traffic API（Phase 2）
 * 2. VisionService图像分析（Phase 5）
 * 3. NLP文本分析增强（Phase 5）
 * 4. Road.is API扩展（Phase 2）
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { GoogleMapsDirectService } from '../src/mcp/google-maps-direct.service';
import { VisionService } from '../src/vision/vision.service';
import { MultimodalWorldPerceptionService } from '../src/skills/world/services/multimodal-world-perception.service';
import { RealtimeRoadStatusService } from '../src/skills/world/services/realtime-road-status.service';
import * as fs from 'fs';
import * as path from 'path';

// 测试结果接口
interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message?: string;
  duration?: number;
  data?: any;
}

// 测试报告
const testResults: TestResult[] = [];

// 辅助函数：记录测试结果
function recordTest(name: string, testFn: () => Promise<any>): Promise<void> {
  return new Promise(async (resolve) => {
    const startTime = Date.now();
    try {
      console.log(`\n🧪 测试: ${name}`);
      const result = await testFn();
      const duration = Date.now() - startTime;
      testResults.push({
        name,
        status: 'PASS',
        duration,
        data: result,
      });
      console.log(`✅ 通过 (${duration}ms)`);
      if (result) {
        console.log(`   结果: ${JSON.stringify(result, null, 2).substring(0, 200)}...`);
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      testResults.push({
        name,
        status: 'FAIL',
        message: error.message,
        duration,
      });
      console.log(`❌ 失败 (${duration}ms): ${error.message}`);
    }
    resolve();
  });
}

// 辅助函数：跳过测试
function skipTest(name: string, reason: string): void {
  testResults.push({
    name,
    status: 'SKIP',
    message: reason,
  });
  console.log(`⏭️  跳过: ${name} - ${reason}`);
}

async function main() {
  console.log('🚀 开始测试世界模型API接口...\n');
  console.log('='.repeat(60));

  let app: any;
  try {
    // 初始化NestJS应用
    app = await NestFactory.createApplicationContext(AppModule);
    console.log('✅ NestJS应用初始化成功\n');

    // 获取服务实例
    const googleMapsService = app.get(GoogleMapsDirectService, { strict: false });
    const visionService = app.get(VisionService, { strict: false });
    const multimodalService = app.get(MultimodalWorldPerceptionService, { strict: false });
    const roadStatusService = app.get(RealtimeRoadStatusService, { strict: false });

    // ==================== 测试1: Google Traffic API ====================
    console.log('\n📋 测试1: Google Traffic API');
    console.log('-'.repeat(60));

    if (!googleMapsService?.isServiceAvailable()) {
      skipTest('Google Traffic API - 服务可用性检查', 'Google Maps API Key未配置');
    } else {
      await recordTest('Google Traffic API - 获取交通状态', async () => {
        const result = await googleMapsService.getTrafficStatus({
          roadId: 'test-road-1',
          location: { lat: 64.1265, lng: -21.8174 }, // 雷克雅未克坐标
          radius: 5000,
        });
        return result;
      });
    }

    // ==================== 测试2: VisionService图像分析 ====================
    console.log('\n📋 测试2: VisionService图像分析');
    console.log('-'.repeat(60));

    // 创建一个测试图片Buffer（简单的1x1像素PNG）
    const testImageBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );

    await recordTest('VisionService - 分析图像（Buffer）', async () => {
      const result = await visionService.analyzeImage(testImageBuffer, {
        lat: 64.1265,
        lng: -21.8174,
        locale: 'zh-CN',
      });
      return result;
    });

    await recordTest('VisionService - 分析图像（URL）', async () => {
      const result = await visionService.analyzeImage('https://example.com/test-image.jpg', {
        lat: 64.1265,
        lng: -21.8174,
      });
      return result;
    });

    // ==================== 测试3: NLP文本分析增强 ====================
    console.log('\n📋 测试3: NLP文本分析增强');
    console.log('-'.repeat(60));

    const testTexts = [
      '这个地方太美了！风景壮观，值得推荐！',
      '不推荐这个地方，路况很差，天气也不好。',
      '冰岛的F208公路非常难走，需要四驱车。',
      'The scenery is amazing! Highly recommend visiting this place.',
    ];

    for (let i = 0; i < testTexts.length; i++) {
      await recordTest(`NLP文本分析 - 文本${i + 1}`, async () => {
        const result = await multimodalService.analyzeText(testTexts[i]);
        return {
          text: testTexts[i].substring(0, 50) + '...',
          sentiment: result.sentiment,
          keywords: result.keywords.slice(0, 5),
          topics: result.topics.slice(0, 3),
        };
      });
    }

    // ==================== 测试4: Road.is API扩展 ====================
    console.log('\n📋 测试4: Road.is API扩展');
    console.log('-'.repeat(60));

    const testRoadIds = ['F208', 'F26', 'Route1', '1'];

    for (const roadId of testRoadIds) {
      await recordTest(`Road.is API - 道路${roadId}`, async () => {
        const result = await roadStatusService.getRoadStatus(roadId);
        return result;
      });
    }

    // ==================== 测试5: 多模态感知整合 ====================
    console.log('\n📋 测试5: 多模态感知整合');
    console.log('-'.repeat(60));

    await recordTest('多模态感知 - 图像分析整合', async () => {
      const result = await multimodalService.analyzeImage('https://example.com/test-image.jpg');
      return {
        sceneType: result.sceneType,
        detectedObjects: result.detectedObjects?.slice(0, 5),
        weatherConditions: result.weatherConditions,
        confidence: result.confidence,
      };
    });

    // ==================== 生成测试报告 ====================
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试报告');
    console.log('='.repeat(60));

    const passed = testResults.filter((r) => r.status === 'PASS').length;
    const failed = testResults.filter((r) => r.status === 'FAIL').length;
    const skipped = testResults.filter((r) => r.status === 'SKIP').length;
    const total = testResults.length;

    console.log(`\n总计: ${total} 个测试`);
    console.log(`✅ 通过: ${passed}`);
    console.log(`❌ 失败: ${failed}`);
    console.log(`⏭️  跳过: ${skipped}`);

    if (failed > 0) {
      console.log('\n失败的测试:');
      testResults
        .filter((r) => r.status === 'FAIL')
        .forEach((r) => {
          console.log(`  - ${r.name}: ${r.message}`);
        });
    }

    // 保存测试报告到文件
    const reportPath = path.join(__dirname, 'world-model-api-interfaces-test-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total,
        passed,
        failed,
        skipped,
      },
      results: testResults,
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 测试报告已保存到: ${reportPath}`);

    // 退出
    await app.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (error: any) {
    console.error('\n❌ 测试过程中发生错误:', error);
    if (app) {
      await app.close();
    }
    process.exit(1);
  }
}

// 运行测试
main().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});

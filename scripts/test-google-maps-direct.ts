#!/usr/bin/env node

/**
 * 测试 Google Maps Direct API 集成
 * 
 * 验证直接 Google Maps API 集成是否正常工作
 */

import { NestFactory } from '@nestjs/core';
import { GoogleMapsDirectService } from '../src/mcp/google-maps-direct.service';
import { GoogleMapsDirectModule } from '../src/mcp/google-maps-direct.module';
import { ConfigModule } from '@nestjs/config';

async function testGoogleMapsDirect() {
  console.log('🧪 开始测试 Google Maps Direct API 集成...\n');

  try {
    // 创建测试应用上下文
    const app = await NestFactory.createApplicationContext(GoogleMapsDirectModule, {
      logger: ['error', 'warn', 'log'],
    });

    const service = app.get(GoogleMapsDirectService);

    // 检查服务是否可用
    console.log('1️⃣ 检查服务可用性...');
    if (!service.isServiceAvailable()) {
      console.error('❌ Google Maps API Key 未配置');
      console.error('请在 .env 文件中设置 GOOGLE_MAPS_API_KEY');
      process.exit(1);
    }
    console.log('✅ 服务可用\n');

    // 测试获取路线
    console.log('2️⃣ 测试获取路线...');
    console.log('路线: 从 "New York, NY" 到 "Boston, MA"');
    const routeResult = await service.getRoute({
      origin: 'New York, NY',
      destination: 'Boston, MA',
      mode: 'driving',
      units: 'metric',
    });
    console.log('✅ 路线获取成功');
    if (routeResult.data?.routes && routeResult.data.routes.length > 0) {
      const route = routeResult.data.routes[0];
      const leg = route.legs[0];
      console.log(`   距离: ${leg.distance.text}`);
      console.log(`   时间: ${leg.duration.text}`);
    }
    console.log('');

    // 测试计算距离矩阵
    console.log('3️⃣ 测试计算距离矩阵...');
    console.log('起点: ["New York, NY"], 终点: ["Boston, MA", "Philadelphia, PA"]');
    const matrixResult = await service.computeDistanceMatrix({
      origins: ['New York, NY'],
      destinations: ['Boston, MA', 'Philadelphia, PA'],
      mode: 'driving',
      units: 'metric',
    });
    console.log('✅ 距离矩阵计算成功');
    if (matrixResult.data?.rows && matrixResult.data.rows.length > 0) {
      const row = matrixResult.data.rows[0];
      row.elements.forEach((element: any, index: number) => {
        console.log(`   ${matrixResult.data.destination_addresses[index]}: ${element.distance.text}, ${element.duration.text}`);
      });
    }
    console.log('');

    // 测试地理编码
    console.log('4️⃣ 测试地理编码...');
    console.log('地址: "New York, NY"');
    const geocodeResult = await service.geocode({
      address: 'New York, NY',
    });
    console.log('✅ 地理编码成功');
    if (geocodeResult.data?.results && geocodeResult.data.results.length > 0) {
      const result = geocodeResult.data.results[0];
      console.log(`   坐标: ${result.geometry.location.lat}, ${result.geometry.location.lng}`);
      console.log(`   格式化地址: ${result.formatted_address}`);
    }
    console.log('');

    // 测试搜索地点
    console.log('5️⃣ 测试搜索地点...');
    console.log('查询: "restaurants in New York"');
    const placesResult = await service.searchPlaces({
      query: 'restaurants in New York',
      language: 'en',
    });
    console.log('✅ 地点搜索成功');
    if (placesResult.data?.results && placesResult.data.results.length > 0) {
      console.log(`   找到 ${placesResult.data.results.length} 个地点`);
      placesResult.data.results.slice(0, 3).forEach((place: any, index: number) => {
        console.log(`   ${index + 1}. ${place.name} - ${place.formatted_address || 'N/A'}`);
      });
    }
    console.log('');

    console.log('🎉 所有测试通过！');
    
    await app.close();
  } catch (error: any) {
    console.error('❌ 测试失败:', error);
    if (error.message) {
      console.error('错误信息:', error.message);
    }
    if (error.stack) {
      console.error('堆栈跟踪:', error.stack);
    }
    process.exit(1);
  }
}

// 运行测试
testGoogleMapsDirect().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});

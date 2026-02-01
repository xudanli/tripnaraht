#!/usr/bin/env tsx
/**
 * Physical Reality 数据集成测试脚本
 * 
 * 测试Physical Reality数据检索和集成功能
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PhysicalRealityRetrievalService } from '../src/trips/readiness/services/physical-reality-retrieval.service';
import { GeoFactsService } from '../src/trips/readiness/services/geo-facts.service';

async function testPhysicalRealityIntegration() {
  console.log('🧪 开始测试 Physical Reality 数据集成...\n');

  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const physicalRealityService = app.get(PhysicalRealityRetrievalService);
    const geoFactsService = app.get(GeoFactsService);

    // 测试1: Physical Reality数据检索
    console.log('📋 测试1: Physical Reality数据检索');
    console.log('─────────────────────────────────────────');
    
    const testRegions = [
      { region: 'iceland', lat: 64.15, lng: -21.95, name: '冰岛（雷克雅未克）' },
      { region: 'alps', lat: 46.5, lng: 9.5, name: '阿尔卑斯（瑞士）' },
      { region: 'greenland', lat: 64.18, lng: -51.72, name: '格陵兰（Nuuk）' },
    ];

    for (const test of testRegions) {
      console.log(`\n📍 测试区域: ${test.name} (${test.region})`);
      
      const data = await physicalRealityService.retrievePhysicalRealityData(test.region, {
        lat: test.lat,
        lng: test.lng,
        month: 7, // 7月
        limit: 10,
      });

      console.log(`  ✅ 检索结果:`);
      console.log(`     - 道路状态: ${data.roadStates.length}条`);
      console.log(`     - 渡轮状态: ${data.ferryStates.length}条`);
      console.log(`     - 天气窗口: ${data.weatherWindows.length}个`);

      if (data.roadStates.length > 0) {
        console.log(`  📍 道路状态示例:`);
        data.roadStates.slice(0, 3).forEach((road) => {
          console.log(`     - ${road.roadName} (${road.roadId}): ${road.status}`);
        });
      }

      if (data.ferryStates.length > 0) {
        console.log(`  🚢 渡轮状态示例:`);
        data.ferryStates.slice(0, 2).forEach((ferry) => {
          console.log(`     - ${ferry.routeName} (${ferry.routeId}): ${ferry.status}`);
        });
      }

      if (data.weatherWindows.length > 0) {
        console.log(`  🌤️  天气窗口示例:`);
        data.weatherWindows.slice(0, 2).forEach((window) => {
          console.log(`     - ${window.regionName} (${window.regionId})`);
        });
      }
    }

    // 测试2: GeoFactsService集成
    console.log('\n\n📋 测试2: GeoFactsService集成');
    console.log('─────────────────────────────────────────');

    const testPoints = [
      { lat: 64.15, lng: -21.95, name: '冰岛（雷克雅未克）' },
      { lat: 46.5, lng: 9.5, name: '阿尔卑斯（瑞士）' },
    ];

    for (const point of testPoints) {
      console.log(`\n📍 测试点位: ${point.name} (${point.lat}, ${point.lng})`);
      
      const geoFeatures = await geoFactsService.getGeoFeaturesForPoint(point.lat, point.lng, {
        useCache: false, // 禁用缓存以测试实时检索
      });

      console.log(`  ✅ GeoFeatures结果:`);
      console.log(`     - 地形复杂度: ${geoFeatures.terrainComplexity.toFixed(2)}`);
      console.log(`     - 风险评分: ${geoFeatures.riskScore.toFixed(2)}`);
      console.log(`     - 可达性评分: ${geoFeatures.accessibilityScore.toFixed(2)}`);

      if (geoFeatures.physicalReality) {
        console.log(`  ✅ Physical Reality数据已集成:`);
        console.log(`     - 道路状态: ${geoFeatures.physicalReality.roadStates.length}条`);
        console.log(`     - 渡轮状态: ${geoFeatures.physicalReality.ferryStates.length}条`);
        console.log(`     - 天气窗口: ${geoFeatures.physicalReality.weatherWindows.length}个`);
      } else {
        console.log(`  ⚠️  Physical Reality数据未集成（服务可能不可用）`);
      }
    }

    console.log('\n\n✅ 测试完成！');
  } catch (error) {
    console.error('❌ 测试失败:', error);
    throw error;
  } finally {
    await app.close();
  }
}

testPhysicalRealityIntegration().catch(console.error);

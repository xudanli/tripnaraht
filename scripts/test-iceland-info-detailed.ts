#!/usr/bin/env tsx
/**
 * 详细测试冰岛信息源API接口，展示完整返回数据
 */

import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

async function testDetailed() {
  console.log('='.repeat(70));
  console.log('🧪 详细测试冰岛信息源API接口');
  console.log('='.repeat(70));
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  try {
    // 1. vedur.is 天气预报
    console.log('📋 1. vedur.is 天气预报\n');
    
    console.log('   1.1 中央高地天气预报:');
    const weather1 = await axios.get(`${API_BASE_URL}/api/iceland-info/weather`, {
      params: { region: 'centralhighlands' }
    });
    if (weather1.data.success) {
      const data = weather1.data.data;
      console.log(`      ✅ 成功`);
      console.log(`      观测站: ${data.station.name} (${data.station.lat}, ${data.station.lng})`);
      console.log(`      当前温度: ${data.current.temperature}°C`);
      console.log(`      风速: ${data.current.windSpeed}m/s (${data.current.windSpeedKmh}km/h)`);
      console.log(`      降水: ${data.current.precipitation}mm`);
      console.log(`      能见度: ${data.current.visibility}m`);
      console.log(`      预报天数: ${data.forecast.length} 天`);
      console.log(`      数据源: ${data.source}`);
    } else {
      console.log(`      ❌ 失败: ${weather1.data.message}`);
    }
    console.log('');

    console.log('   1.2 指定坐标天气预报:');
    const weather2 = await axios.get(`${API_BASE_URL}/api/iceland-info/weather`, {
      params: { lat: 64.5, lng: -18.5, includeWindDetails: true }
    });
    if (weather2.data.success) {
      const data = weather2.data.data;
      console.log(`      ✅ 成功`);
      console.log(`      观测站: ${data.station.name}`);
      console.log(`      当前天气: ${data.current.condition}`);
      console.log(`      风向: ${data.current.windDirection}°`);
      console.log(`      数据源: ${data.source}`);
    } else {
      console.log(`      ❌ 失败: ${weather2.data.message}`);
    }
    console.log('');

    // 2. safetravel.is 安全信息
    console.log('📋 2. safetravel.is 安全信息\n');
    
    console.log('   2.1 高地区域安全信息:');
    const safety1 = await axios.get(`${API_BASE_URL}/api/iceland-info/safety`, {
      params: { region: 'highlands' }
    });
    if (safety1.data.success) {
      const data = safety1.data.data;
      console.log(`      ✅ 成功`);
      console.log(`      警报数量: ${data.alerts.length}`);
      if (data.alerts.length > 0) {
        data.alerts.forEach((alert: any, i: number) => {
          console.log(`        警报${i + 1}: ${alert.title} (${alert.type}, ${alert.severity})`);
        });
      }
      console.log(`      旅行条件数量: ${data.travelConditions.length}`);
      if (data.travelConditions.length > 0) {
        data.travelConditions.forEach((cond: any, i: number) => {
          console.log(`        条件${i + 1}: ${cond.region} - ${cond.overallStatus} (${cond.description})`);
        });
      }
      console.log(`      数据源: ${data.source || 'safetravel.is'}`);
    } else {
      console.log(`      ❌ 失败: ${safety1.data.message}`);
    }
    console.log('');

    console.log('   2.2 天气警报:');
    const safety2 = await axios.get(`${API_BASE_URL}/api/iceland-info/safety`, {
      params: { alertType: 'weather' }
    });
    if (safety2.data.success) {
      const data = safety2.data.data;
      console.log(`      ✅ 成功`);
      console.log(`      天气警报数量: ${data.alerts.length}`);
      data.alerts.forEach((alert: any, i: number) => {
        console.log(`        警报${i + 1}: ${alert.title}`);
        if (alert.fRoads && alert.fRoads.length > 0) {
          console.log(`          影响的F路: ${alert.fRoads.join(', ')}`);
        }
      });
    } else {
      console.log(`      ❌ 失败: ${safety2.data.message}`);
    }
    console.log('');

    // 3. road.is 路况信息
    console.log('📋 3. road.is 路况信息\n');
    
    console.log('   3.1 所有F路路况:');
    const roads1 = await axios.get(`${API_BASE_URL}/api/iceland-info/road-conditions`);
    if (roads1.data.success) {
      const data = roads1.data.data;
      console.log(`      ✅ 成功`);
      console.log(`      F路数量: ${data.fRoads.length}`);
      const openCount = data.fRoads.filter((r: any) => r.isOpen).length;
      const closedCount = data.fRoads.filter((r: any) => !r.isOpen).length;
      const cautionCount = data.fRoads.filter((r: any) => r.status === 'caution').length;
      console.log(`      开放: ${openCount}, 关闭: ${closedCount}, 需谨慎: ${cautionCount}`);
      data.fRoads.slice(0, 5).forEach((road: any, i: number) => {
        console.log(`        ${i + 1}. ${road.fRoadNumber}: ${road.status} (${road.isOpen ? '开放' : '关闭'})`);
      });
      console.log(`      数据源: ${data.source || 'road.is'}`);
    } else {
      console.log(`      ❌ 失败: ${roads1.data.message}`);
    }
    console.log('');

    console.log('   3.2 指定F路路况 (F208, F26, F910):');
    const roads2 = await axios.get(`${API_BASE_URL}/api/iceland-info/road-conditions`, {
      params: { fRoads: 'F208,F26,F910' }
    });
    if (roads2.data.success) {
      const data = roads2.data.data;
      console.log(`      ✅ 成功`);
      console.log(`      查询到的F路数量: ${data.fRoads.length}`);
      data.fRoads.forEach((road: any) => {
        console.log(`        ${road.fRoadNumber}: ${road.status} - ${road.description}`);
        console.log(`          路况: ${road.condition}, 开放: ${road.isOpen ? '是' : '否'}`);
      });
    } else {
      console.log(`      ❌ 失败: ${roads2.data.message}`);
    }
    console.log('');

    console.log('   3.3 需要谨慎的F路:');
    const roads3 = await axios.get(`${API_BASE_URL}/api/iceland-info/road-conditions`, {
      params: { status: 'caution' }
    });
    if (roads3.data.success) {
      const data = roads3.data.data;
      console.log(`      ✅ 成功`);
      console.log(`      需谨慎的F路数量: ${data.fRoads.length}`);
      data.fRoads.forEach((road: any) => {
        console.log(`        ${road.fRoadNumber}: ${road.description}`);
      });
    } else {
      console.log(`      ❌ 失败: ${roads3.data.message}`);
    }
    console.log('');

    console.log('='.repeat(70));
    console.log('✅ 所有接口测试完成！');
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

testDetailed();

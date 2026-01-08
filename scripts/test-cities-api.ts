#!/usr/bin/env ts-node
/**
 * 测试城市 API 接口
 * 
 * 测试场景：
 * 1. GET /cities?countryCode=JP - 获取某个国家的所有城市
 * 2. GET /cities?q=东京&countryCode=JP - 搜索城市
 * 3. GET /cities/:id - 获取城市详情
 */

import { StandardResponse } from '../src/common/dto/standard-response.dto';
import * as https from 'https';
import * as http from 'http';

interface CityResponse {
  cities: Array<{
    id: number;
    name: string;
    countryCode: string;
    nameCN?: string;
    nameEN?: string;
    adcode?: string;
    timezone?: string;
    lat?: number;
    lng?: number;
    metadata?: any;
  }>;
  total: number;
  countryCode?: string;
  totalInCountry?: number;
}

interface CityDetail {
  id: number;
  name: string;
  countryCode: string;
  nameCN?: string;
  nameEN?: string;
  adcode?: string;
  timezone?: string;
  lat?: number;
  lng?: number;
  metadata?: any;
}

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

/**
 * 使用 Node.js 内置 http/https 模块发送请求
 */
function httpRequest(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: res.statusCode && res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve(json) });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function testCitiesAPI() {
  console.log('🧪 测试城市 API 接口\n');
  console.log(`📍 基础 URL: ${BASE_URL}\n`);

  // 测试场景 1: 获取某个国家的所有城市
  console.log('📋 测试场景 1: 获取某个国家的所有城市');
  console.log('   GET /api/cities?countryCode=JP\n');
  try {
    const response = await httpRequest(`${API_BASE}/cities?countryCode=JP`);
    if (!response.ok) {
      console.log(`   ❌ HTTP 错误: ${response.status}`);
      console.log(`   响应内容: ${JSON.stringify(response.json).substring(0, 200)}`);
      console.log('');
      return;
    }
    const data = await response.json() as StandardResponse<CityResponse>;
    if (data.success && data.data) {
      console.log(`   ✅ 成功: 找到 ${data.data.cities.length} 个城市`);
      if (data.data.cities.length > 0) {
        console.log(`   📍 示例城市: ${data.data.cities[0].name} (${data.data.cities[0].nameCN || 'N/A'})`);
      }
    } else {
      console.log(`   ❌ 失败: ${data.error?.message || data.error?.code || 'Unknown error'}`);
      if (data.error?.details) {
        console.log(`   详情: ${JSON.stringify(data.error.details)}`);
      }
    }
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.log(`   ❌ 连接被拒绝: 请确保服务器正在运行 (${BASE_URL})`);
    } else {
      console.log(`   ❌ 错误: ${error.message}`);
    }
  }
  console.log('');

  // 测试场景 2: 搜索城市
  console.log('📋 测试场景 2: 搜索城市');
  console.log('   GET /api/cities?q=东京&countryCode=JP\n');
  try {
    const encodedUrl = `${API_BASE}/cities?q=${encodeURIComponent('东京')}&countryCode=JP`;
    const response = await httpRequest(encodedUrl);
    if (!response.ok) {
      console.log(`   ❌ HTTP 错误: ${response.status}`);
      console.log('');
      return;
    }
    const data = await response.json() as StandardResponse<CityResponse>;
    if (data.success && data.data) {
      console.log(`   ✅ 成功: 找到 ${data.data.cities.length} 个匹配的城市`);
      data.data.cities.forEach((city) => {
        console.log(`      - ${city.name} (${city.nameCN || 'N/A'}) - ${city.countryCode}`);
      });
    } else {
      console.log(`   ❌ 失败: ${data.error?.message || data.error?.code || 'Unknown error'}`);
    }
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.log(`   ❌ 连接被拒绝: 请确保服务器正在运行 (${BASE_URL})`);
    } else {
      console.log(`   ❌ 错误: ${error.message}`);
    }
  }
  console.log('');

  // 测试场景 3: 获取城市详情（需要先获取一个城市 ID）
  console.log('📋 测试场景 3: 获取城市详情');
  console.log('   先获取一个城市 ID...\n');
  try {
    // 先获取一个城市
    const listResponse = await httpRequest(`${API_BASE}/cities?countryCode=JP&limit=1`);
    const listData = await listResponse.json() as StandardResponse<CityResponse>;
    
    if (listData.success && listData.data && listData.data.cities.length > 0) {
      const cityId = listData.data.cities[0].id;
      console.log(`   GET /api/cities/${cityId}\n`);
      
      const detailResponse = await httpRequest(`${API_BASE}/cities/${cityId}`);
      const detailData = await detailResponse.json() as StandardResponse<CityDetail>;
      
      if (detailData.success && detailData.data) {
        const city = detailData.data;
        console.log(`   ✅ 成功: 获取城市详情`);
        console.log(`      ID: ${city.id}`);
        console.log(`      名称: ${city.name}`);
        console.log(`      中文名: ${city.nameCN || 'N/A'}`);
        console.log(`      英文名: ${city.nameEN || 'N/A'}`);
        console.log(`      国家代码: ${city.countryCode}`);
        if (city.lat && city.lng) {
          console.log(`      坐标: (${city.lat}, ${city.lng})`);
        }
        if (city.timezone) {
          console.log(`      时区: ${city.timezone}`);
        }
      } else {
        console.log(`   ❌ 失败: ${detailData.error?.message || 'Unknown error'}`);
      }
    } else {
      console.log('   ⚠️  未找到城市，跳过详情测试');
    }
  } catch (error: any) {
    console.log(`   ❌ 错误: ${error.message}`);
  }
  console.log('');

  console.log('✅ 测试完成');
}

testCitiesAPI().catch(console.error);

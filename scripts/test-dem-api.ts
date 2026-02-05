// scripts/test-dem-api.ts
/**
 * DEM API 测试脚本
 * 
 * 测试 DEM 地形数据 API 的所有端点
 */

// 使用独立作用域避免与其他测试脚本冲突
(function() {
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface DemTestResult {
  name: string;
  success: boolean;
  statusCode?: number;
  response?: any;
  error?: string;
}

const demTestResults: DemTestResult[] = [];

async function httpRequest(url: string, options: RequestInit = {}): Promise<{ status: number; data: any }> {
  try {
    // 使用 node-fetch 或原生 http 模块
    const http = await import('http');
    const https = await import('https');
    const { URL } = await import('url');
    
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    return new Promise((resolve, reject) => {
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers as Record<string, string>),
        },
      };

      const req = client.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            resolve({ status: res.statusCode || 200, data: jsonData });
          } catch (e) {
            resolve({ status: res.statusCode || 200, data: { raw: data } });
          }
        });
      });

      req.on('error', (error: any) => {
        if (error.code === 'ECONNREFUSED' || error.code === 'EAI_AGAIN') {
          reject(new Error(`无法连接到服务器 ${url}，请确保服务已启动`));
        } else {
          reject(error);
        }
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  } catch (error: any) {
    if (error.message.includes('fetch failed') || error.code === 'ECONNREFUSED' || error.code === 'EAI_AGAIN') {
      throw new Error(`无法连接到服务器 ${url}，请确保服务已启动`);
    }
    throw error;
  }
}

async function testGetElevation(lat: number, lng: number): Promise<void> {
  const name = `获取单个坐标点海拔 (${lat}, ${lng})`;
  console.log(`\n==========================================`);
  console.log(`测试: ${name}`);
  console.log(`Endpoint: GET /api/dem/elevation?lat=${lat}&lng=${lng}`);
  console.log(`==========================================\n`);

  try {
    const { status, data } = await httpRequest(
      `${API_BASE_URL}/api/dem/elevation?lat=${lat}&lng=${lng}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (status === 200 && data.success) {
      console.log(`✓ 成功 (HTTP ${status})`);
      console.log('响应:', JSON.stringify(data, null, 2));
      demTestResults.push({
        name,
        success: true,
        statusCode: status,
        response: data,
      });
    } else {
      console.log(`✗ 失败 (HTTP ${status})`);
      console.log('响应:', JSON.stringify(data, null, 2));
      demTestResults.push({
        name,
        success: false,
        statusCode: status,
        response: data,
        error: data.error?.message || 'Unknown error',
      });
    }
  } catch (error: any) {
    console.log(`✗ 错误: ${error.message}`);
    demTestResults.push({
      name,
      success: false,
      error: error.message,
    });
  }

  console.log('\n----------------------------------------\n');
}

async function testGetProfile(polyline: Array<{ lat: number; lng: number }>, options?: {
  samples?: number;
  activityType?: 'walking' | 'driving' | 'cycling';
}): Promise<void> {
  const name = `获取路线海拔剖面 (${polyline.length} 个点)`;
  console.log(`\n==========================================`);
  console.log(`测试: ${name}`);
  console.log(`Endpoint: POST /api/dem/profile`);
  console.log(`参数:`, JSON.stringify({ polyline, ...options }, null, 2));
  console.log(`==========================================\n`);

  try {
    const { status, data } = await httpRequest(
      `${API_BASE_URL}/api/dem/profile`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          polyline,
          ...options,
        }),
      }
    );

    if (status === 200 && data.success) {
      console.log(`✓ 成功 (HTTP ${status})`);
      console.log(`海拔剖面点数: ${data.data.elevationProfile?.length || 0}`);
      console.log(`累计爬升: ${data.data.cumulativeAscent}m`);
      console.log(`总距离: ${data.data.totalDistance}m`);
      console.log(`难度: ${data.data.difficulty}`);
      console.log(`体力消耗评分: ${data.data.effortScore}`);
      console.log('\n完整响应:', JSON.stringify(data, null, 2));
      demTestResults.push({
        name,
        success: true,
        statusCode: status,
        response: data,
      });
    } else {
      console.log(`✗ 失败 (HTTP ${status})`);
      console.log('响应:', JSON.stringify(data, null, 2));
      demTestResults.push({
        name,
        success: false,
        statusCode: status,
        response: data,
        error: data.error?.message || 'Unknown error',
      });
    }
  } catch (error: any) {
    console.log(`✗ 错误: ${error.message}`);
    demTestResults.push({
      name,
      success: false,
      error: error.message,
    });
  }

  console.log('\n----------------------------------------\n');
}

async function testGetTripTerrain(tripId: string): Promise<void> {
  const name = `获取行程地形数据 (${tripId})`;
  console.log(`\n==========================================`);
  console.log(`测试: ${name}`);
  console.log(`Endpoint: GET /api/dem/trip/${tripId}/terrain`);
  console.log(`==========================================\n`);

  try {
    const { status, data } = await httpRequest(
      `${API_BASE_URL}/api/dem/trip/${tripId}/terrain`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (status === 200 && data.success) {
      console.log(`✓ 成功 (HTTP ${status})`);
      console.log('响应:', JSON.stringify(data, null, 2));
      demTestResults.push({
        name,
        success: true,
        statusCode: status,
        response: data,
      });
    } else {
      console.log(`✗ 失败 (HTTP ${status})`);
      console.log('响应:', JSON.stringify(data, null, 2));
      demTestResults.push({
        name,
        success: false,
        statusCode: status,
        response: data,
        error: data.error?.message || 'Unknown error',
      });
    }
  } catch (error: any) {
    console.log(`✗ 错误: ${error.message}`);
    demTestResults.push({
      name,
      success: false,
      error: error.message,
    });
  }

  console.log('\n----------------------------------------\n');
}

async function testValidationErrors(): Promise<void> {
  console.log(`\n==========================================`);
  console.log(`测试: 参数验证错误`);
  console.log(`==========================================\n`);

  // 测试无效的经纬度
  await testGetElevation(NaN as any, NaN as any);
  
  // 测试 polyline 少于 2 个点
  await testGetProfile([{ lat: 64.1466, lng: -21.9426 }]);
}

async function main() {
  console.log('==========================================');
  console.log('DEM API 测试');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log('==========================================\n');

  try {
    // 测试 1: 获取单个坐标点的海拔（冰岛雷克雅未克）
    await testGetElevation(64.1466, -21.9426);

    // 测试 2: 获取单个坐标点的海拔（冰岛其他位置）
    await testGetElevation(64.8378, -23.4728);

    // 测试 3: 获取路线海拔剖面（短路线）
    await testGetProfile(
      [
        { lat: 64.1466, lng: -21.9426 },
        { lat: 64.1500, lng: -21.9500 },
        { lat: 64.1600, lng: -21.9600 },
      ],
      {
        samples: 100,
        activityType: 'walking',
      }
    );

    // 测试 4: 获取路线海拔剖面（较长路线，使用不同的活动类型）
    await testGetProfile(
      [
        { lat: 64.1466, lng: -21.9426 },
        { lat: 64.1500, lng: -21.9500 },
        { lat: 64.1600, lng: -21.9600 },
        { lat: 64.1700, lng: -21.9700 },
        { lat: 64.1800, lng: -21.9800 },
      ],
      {
        samples: 200,
        activityType: 'driving',
      }
    );

    // 测试 5: 获取行程地形数据（占位符端点）
    await testGetTripTerrain('test-trip-id-123');

    // 测试 6: 参数验证错误
    await testValidationErrors();

    // 汇总结果
    console.log('\n==========================================');
    console.log('测试结果汇总');
    console.log('==========================================\n');

    const successCount = demTestResults.filter(r => r.success).length;
    const failCount = demTestResults.filter(r => !r.success).length;

    console.log(`总计: ${demTestResults.length} 个测试`);
    console.log(`成功: ${successCount} 个`);
    console.log(`失败: ${failCount} 个\n`);

    if (failCount > 0) {
      console.log('失败的测试:');
      demTestResults
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  ✗ ${r.name}`);
          if (r.error) {
            console.log(`    错误: ${r.error}`);
          }
          if (r.statusCode) {
            console.log(`    HTTP 状态码: ${r.statusCode}`);
          }
        });
    }

    console.log('\n==========================================\n');

    // 退出码
    process.exit(failCount > 0 ? 1 : 0);
  } catch (error: any) {
    console.error('\n测试执行失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行测试
main();
})();

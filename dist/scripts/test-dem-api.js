"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
(function () {
    const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
    const demTestResults = [];
    async function httpRequest(url, options = {}) {
        try {
            const http = await Promise.resolve().then(() => __importStar(require('http')));
            const https = await Promise.resolve().then(() => __importStar(require('https')));
            const { URL } = await Promise.resolve().then(() => __importStar(require('url')));
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
                        ...options.headers,
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
                        }
                        catch (e) {
                            resolve({ status: res.statusCode || 200, data: { raw: data } });
                        }
                    });
                });
                req.on('error', (error) => {
                    if (error.code === 'ECONNREFUSED' || error.code === 'EAI_AGAIN') {
                        reject(new Error(`无法连接到服务器 ${url}，请确保服务已启动`));
                    }
                    else {
                        reject(error);
                    }
                });
                if (options.body) {
                    req.write(options.body);
                }
                req.end();
            });
        }
        catch (error) {
            if (error.message.includes('fetch failed') || error.code === 'ECONNREFUSED' || error.code === 'EAI_AGAIN') {
                throw new Error(`无法连接到服务器 ${url}，请确保服务已启动`);
            }
            throw error;
        }
    }
    async function testGetElevation(lat, lng) {
        var _a;
        const name = `获取单个坐标点海拔 (${lat}, ${lng})`;
        console.log(`\n==========================================`);
        console.log(`测试: ${name}`);
        console.log(`Endpoint: GET /api/dem/elevation?lat=${lat}&lng=${lng}`);
        console.log(`==========================================\n`);
        try {
            const { status, data } = await httpRequest(`${API_BASE_URL}/api/dem/elevation?lat=${lat}&lng=${lng}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (status === 200 && data.success) {
                console.log(`✓ 成功 (HTTP ${status})`);
                console.log('响应:', JSON.stringify(data, null, 2));
                demTestResults.push({
                    name,
                    success: true,
                    statusCode: status,
                    response: data,
                });
            }
            else {
                console.log(`✗ 失败 (HTTP ${status})`);
                console.log('响应:', JSON.stringify(data, null, 2));
                demTestResults.push({
                    name,
                    success: false,
                    statusCode: status,
                    response: data,
                    error: ((_a = data.error) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error',
                });
            }
        }
        catch (error) {
            console.log(`✗ 错误: ${error.message}`);
            demTestResults.push({
                name,
                success: false,
                error: error.message,
            });
        }
        console.log('\n----------------------------------------\n');
    }
    async function testGetProfile(polyline, options) {
        var _a, _b;
        const name = `获取路线海拔剖面 (${polyline.length} 个点)`;
        console.log(`\n==========================================`);
        console.log(`测试: ${name}`);
        console.log(`Endpoint: POST /api/dem/profile`);
        console.log(`参数:`, JSON.stringify({ polyline, ...options }, null, 2));
        console.log(`==========================================\n`);
        try {
            const { status, data } = await httpRequest(`${API_BASE_URL}/api/dem/profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    polyline,
                    ...options,
                }),
            });
            if (status === 200 && data.success) {
                console.log(`✓ 成功 (HTTP ${status})`);
                console.log(`海拔剖面点数: ${((_a = data.data.elevationProfile) === null || _a === void 0 ? void 0 : _a.length) || 0}`);
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
            }
            else {
                console.log(`✗ 失败 (HTTP ${status})`);
                console.log('响应:', JSON.stringify(data, null, 2));
                demTestResults.push({
                    name,
                    success: false,
                    statusCode: status,
                    response: data,
                    error: ((_b = data.error) === null || _b === void 0 ? void 0 : _b.message) || 'Unknown error',
                });
            }
        }
        catch (error) {
            console.log(`✗ 错误: ${error.message}`);
            demTestResults.push({
                name,
                success: false,
                error: error.message,
            });
        }
        console.log('\n----------------------------------------\n');
    }
    async function testGetTripTerrain(tripId) {
        var _a;
        const name = `获取行程地形数据 (${tripId})`;
        console.log(`\n==========================================`);
        console.log(`测试: ${name}`);
        console.log(`Endpoint: GET /api/dem/trip/${tripId}/terrain`);
        console.log(`==========================================\n`);
        try {
            const { status, data } = await httpRequest(`${API_BASE_URL}/api/dem/trip/${tripId}/terrain`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            if (status === 200 && data.success) {
                console.log(`✓ 成功 (HTTP ${status})`);
                console.log('响应:', JSON.stringify(data, null, 2));
                demTestResults.push({
                    name,
                    success: true,
                    statusCode: status,
                    response: data,
                });
            }
            else {
                console.log(`✗ 失败 (HTTP ${status})`);
                console.log('响应:', JSON.stringify(data, null, 2));
                demTestResults.push({
                    name,
                    success: false,
                    statusCode: status,
                    response: data,
                    error: ((_a = data.error) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error',
                });
            }
        }
        catch (error) {
            console.log(`✗ 错误: ${error.message}`);
            demTestResults.push({
                name,
                success: false,
                error: error.message,
            });
        }
        console.log('\n----------------------------------------\n');
    }
    async function testValidationErrors() {
        console.log(`\n==========================================`);
        console.log(`测试: 参数验证错误`);
        console.log(`==========================================\n`);
        await testGetElevation(NaN, NaN);
        await testGetProfile([{ lat: 64.1466, lng: -21.9426 }]);
    }
    async function main() {
        console.log('==========================================');
        console.log('DEM API 测试');
        console.log(`API Base URL: ${API_BASE_URL}`);
        console.log('==========================================\n');
        try {
            await testGetElevation(64.1466, -21.9426);
            await testGetElevation(64.8378, -23.4728);
            await testGetProfile([
                { lat: 64.1466, lng: -21.9426 },
                { lat: 64.1500, lng: -21.9500 },
                { lat: 64.1600, lng: -21.9600 },
            ], {
                samples: 100,
                activityType: 'walking',
            });
            await testGetProfile([
                { lat: 64.1466, lng: -21.9426 },
                { lat: 64.1500, lng: -21.9500 },
                { lat: 64.1600, lng: -21.9600 },
                { lat: 64.1700, lng: -21.9700 },
                { lat: 64.1800, lng: -21.9800 },
            ], {
                samples: 200,
                activityType: 'driving',
            });
            await testGetTripTerrain('test-trip-id-123');
            await testValidationErrors();
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
            process.exit(failCount > 0 ? 1 : 0);
        }
        catch (error) {
            console.error('\n测试执行失败:', error.message);
            console.error(error.stack);
            process.exit(1);
        }
    }
    main();
})();
//# sourceMappingURL=test-dem-api.js.map
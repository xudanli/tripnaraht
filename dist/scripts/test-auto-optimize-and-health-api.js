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
Object.defineProperty(exports, "__esModule", { value: true });
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const TRIP_ID = process.env.TRIP_ID || '';
function httpRequest(method, url, data) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        const client = urlObj.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve(parsed);
                }
                catch (e) {
                    resolve({ success: false, error: { code: 'PARSE_ERROR', message: body } });
                }
            });
        });
        req.on('error', (error) => {
            reject(error);
        });
        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}
async function testHealthApi(tripId) {
    console.log('\n📊 测试健康度接口');
    console.log('='.repeat(60));
    console.log(`GET ${API_BASE_URL}/api/trip-detail/${tripId}/health`);
    try {
        const response = await httpRequest('GET', `${API_BASE_URL}/api/trip-detail/${tripId}/health`);
        if (response.success && response.data) {
            console.log('✅ 健康度接口调用成功');
            console.log('\n健康度数据:');
            console.log(JSON.stringify(response.data, null, 2));
            if (response.data.overall) {
                console.log(`\n总体健康度: ${response.data.overall}`);
            }
            if (response.data.dimensions) {
                console.log('\n各维度健康度:');
                Object.entries(response.data.dimensions).forEach(([key, value]) => {
                    console.log(`  - ${key}: ${value.status} (分数: ${value.score})`);
                    if (value.issues && value.issues.length > 0) {
                        console.log(`    问题: ${value.issues.join(', ')}`);
                    }
                });
            }
        }
        else {
            console.log('❌ 健康度接口调用失败');
            console.log('错误:', response.error);
        }
    }
    catch (error) {
        console.log('❌ 健康度接口调用异常');
        console.log('错误:', error.message);
    }
}
async function testAutoOptimizePreview(tripId) {
    console.log('\n🔍 测试 Auto综合 API (预览模式)');
    console.log('='.repeat(60));
    console.log(`POST ${API_BASE_URL}/api/planning-workbench/auto-optimize`);
    try {
        const response = await httpRequest('POST', `${API_BASE_URL}/api/planning-workbench/auto-optimize`, {
            tripId,
            preview: true,
            limit: 10,
        });
        if (response.success && response.data) {
            console.log('✅ Auto综合 API (预览模式) 调用成功');
            console.log('\n预览结果:');
            console.log(JSON.stringify(response.data, null, 2));
            console.log(`\n将应用的建议数量: ${response.data.appliedCount || 0}`);
            if (response.data.suggestions && response.data.suggestions.length > 0) {
                console.log('\n建议列表:');
                response.data.suggestions.forEach((s, index) => {
                    console.log(`  ${index + 1}. [${s.severity}] ${s.title}`);
                });
            }
            if (response.data.impact) {
                console.log('\n预期影响:');
                if (response.data.impact.metrics) {
                    console.log('  指标变化:', response.data.impact.metrics);
                }
                if (response.data.impact.risks) {
                    console.log('  风险:', response.data.impact.risks);
                }
            }
        }
        else {
            console.log('❌ Auto综合 API (预览模式) 调用失败');
            console.log('错误:', response.error);
        }
    }
    catch (error) {
        console.log('❌ Auto综合 API (预览模式) 调用异常');
        console.log('错误:', error.message);
    }
}
async function testAutoOptimizeApply(tripId, shouldApply = false) {
    if (!shouldApply) {
        console.log('\n⚠️  跳过实际应用模式测试（避免修改数据）');
        console.log('如需测试实际应用，请设置 shouldApply = true');
        return;
    }
    console.log('\n🚀 测试 Auto综合 API (实际应用模式)');
    console.log('='.repeat(60));
    console.log(`POST ${API_BASE_URL}/api/planning-workbench/auto-optimize`);
    try {
        const response = await httpRequest('POST', `${API_BASE_URL}/api/planning-workbench/auto-optimize`, {
            tripId,
            preview: false,
            limit: 10,
        });
        if (response.success && response.data) {
            console.log('✅ Auto综合 API (实际应用模式) 调用成功');
            console.log('\n应用结果:');
            console.log(JSON.stringify(response.data, null, 2));
            console.log(`\n成功应用的建议数量: ${response.data.appliedCount || 0}`);
            if (response.data.suggestions && response.data.suggestions.length > 0) {
                console.log('\n应用结果详情:');
                response.data.suggestions.forEach((s, index) => {
                    const status = s.applied ? '✅' : '❌';
                    console.log(`  ${index + 1}. ${status} [${s.severity}] ${s.title}`);
                    if (s.error) {
                        console.log(`     错误: ${s.error}`);
                    }
                });
            }
        }
        else {
            console.log('❌ Auto综合 API (实际应用模式) 调用失败');
            console.log('错误:', response.error);
        }
    }
    catch (error) {
        console.log('❌ Auto综合 API (实际应用模式) 调用异常');
        console.log('错误:', error.message);
    }
}
async function main() {
    console.log('🧪 Auto综合 API 和健康度接口测试');
    console.log('='.repeat(60));
    console.log(`API 基础 URL: ${API_BASE_URL}`);
    console.log(`行程 ID: ${TRIP_ID || '(未设置，请设置 TRIP_ID 环境变量)'}`);
    if (!TRIP_ID) {
        console.error('\n❌ 错误: 请设置 TRIP_ID 环境变量');
        console.log('使用方法:');
        console.log('  export TRIP_ID=your-trip-id');
        console.log('  npx ts-node scripts/test-auto-optimize-and-health-api.ts');
        process.exit(1);
    }
    await testHealthApi(TRIP_ID);
    await testAutoOptimizePreview(TRIP_ID);
    await testAutoOptimizeApply(TRIP_ID, false);
    console.log('\n' + '='.repeat(60));
    console.log('✅ 测试完成');
}
main().catch((error) => {
    console.error('测试执行失败:', error);
    process.exit(1);
});
//# sourceMappingURL=test-auto-optimize-and-health-api.js.map
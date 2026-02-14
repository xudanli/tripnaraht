"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;
const TRIP_ID = process.env.TRIP_ID || 'trip-uuid-123';
const DAY_ID = process.env.DAY_ID || 'day-uuid-456';
const ITEM_ID = process.env.ITEM_ID || 'item-uuid-789';
const PLACE_ID = process.env.PLACE_ID || '123';
let SOLUTION_ID = process.env.SOLUTION_ID || 'solution-uuid-456';
const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m',
};
function log(message, color) {
    const colorCode = color ? colors[color] : colors.reset;
    console.log(`${colorCode}${message}${colors.reset}`);
}
async function testApi(name, method, url, data) {
    var _a, _b, _c, _d, _e;
    log(`\n测试: ${name}`, 'yellow');
    console.log(`URL: ${method} ${url}`);
    if (data) {
        console.log(`Data:`, JSON.stringify(data, null, 2));
    }
    console.log('');
    try {
        const response = await (0, axios_1.default)({
            method,
            url,
            data,
            validateStatus: () => true,
        });
        if (response.status >= 200 && response.status < 300) {
            log(`✓ 成功 (HTTP ${response.status})`, 'green');
            console.log('响应:');
            console.log(JSON.stringify(response.data, null, 2));
            if (name.includes('触发修复') && ((_e = (_d = (_c = (_b = (_a = response.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.uiOutput) === null || _c === void 0 ? void 0 : _c.fallbackPlan) === null || _d === void 0 ? void 0 : _d.solutions) === null || _e === void 0 ? void 0 : _e.length) > 0) {
                SOLUTION_ID = response.data.data.uiOutput.fallbackPlan.solutions[0].id;
                log(`\n已保存 solutionId: ${SOLUTION_ID}`, 'yellow');
            }
        }
        else {
            log(`✗ 失败 (HTTP ${response.status})`, 'red');
            console.log('响应:');
            console.log(JSON.stringify(response.data, null, 2));
        }
    }
    catch (error) {
        log(`✗ 错误: ${error.message}`, 'red');
        if (error.response) {
            console.log('响应:', JSON.stringify(error.response.data, null, 2));
        }
    }
    console.log('\n----------------------------------------\n');
}
async function main() {
    log('========================================', 'yellow');
    log('执行页面接口测试', 'yellow');
    log('========================================', 'yellow');
    console.log('');
    await testApi('获取行程状态（增强）', 'GET', `${API_BASE}/trips/${TRIP_ID}/state?now=2026-02-05T09:30:00Z`);
    await testApi('获取提醒列表', 'POST', `${API_BASE}/execution/execute`, {
        tripId: TRIP_ID,
        action: 'remind',
        remindParams: {
            reminderTypes: ['departure', 'transport', 'weather'],
            advanceHours: 24,
        },
    });
    await testApi('处理变更（延迟）', 'POST', `${API_BASE}/execution/execute`, {
        tripId: TRIP_ID,
        action: 'handle_change',
        changeParams: {
            changeType: 'schedule_change',
            changeDetails: {
                reason: '用户请求延迟15分钟',
                delayMinutes: 15,
                itemId: ITEM_ID,
            },
        },
    });
    await testApi('处理变更（跳过）', 'POST', `${API_BASE}/execution/execute`, {
        tripId: TRIP_ID,
        action: 'handle_change',
        changeParams: {
            changeType: 'activity_cancelled',
            changeDetails: {
                reason: '用户请求跳过当前活动',
                itemId: ITEM_ID,
            },
        },
    });
    await testApi('触发修复（替换）', 'POST', `${API_BASE}/execution/execute`, {
        tripId: TRIP_ID,
        action: 'fallback',
        fallbackParams: {
            triggerReason: '用户请求替换当前活动',
            itemId: ITEM_ID,
            originalPlan: {},
        },
    });
    await testApi('重新排序行程', 'POST', `${API_BASE}/execution/reorder`, {
        tripId: TRIP_ID,
        dayId: DAY_ID,
        newOrder: ['item-uuid-3', 'item-uuid-1', 'item-uuid-2'],
        reason: '用户请求调整顺序',
    });
    await testApi('获取关键证据', 'GET', `${API_BASE}/places/${PLACE_ID}/evidence?date=2026-02-05&includeWeather=true&includeTraffic=true`);
    log('注意: 预览修复方案需要先执行fallback操作获取solutionId', 'yellow');
    await testApi('预览修复方案', 'GET', `${API_BASE}/execution/fallback/${SOLUTION_ID}/preview`);
    log('注意: 应用修复方案需要先执行fallback操作获取solutionId', 'yellow');
    await testApi('应用修复方案', 'POST', `${API_BASE}/execution/apply-fallback`, {
        tripId: TRIP_ID,
        solutionId: SOLUTION_ID,
        confirm: true,
    });
    log('========================================', 'green');
    log('测试完成', 'green');
    log('========================================', 'green');
    console.log('');
    console.log('提示:');
    console.log('1. 请确保服务已启动: npm run start:dev');
    console.log('2. 请替换脚本中的 TRIP_ID, DAY_ID, ITEM_ID, PLACE_ID 为实际值');
    console.log('3. 可以通过环境变量设置: export TRIP_ID=your-trip-id');
    console.log('4. fallback相关的接口需要先执行fallback操作获取solutionId');
}
main().catch(console.error);
//# sourceMappingURL=test-execution-apis.js.map
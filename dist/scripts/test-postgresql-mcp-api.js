"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/postgresql-mcp`;
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};
function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}
function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}
function logError(message) {
    log(`❌ ${message}`, 'red');
}
function logInfo(message) {
    log(`ℹ️  ${message}`, 'cyan');
}
function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}
const api = axios_1.default.create({
    baseURL: API_BASE,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
function recordTest(success) {
    totalTests++;
    if (success) {
        passedTests++;
    }
    else {
        failedTests++;
    }
}
async function testHealthCheck() {
    logInfo('\n📋 测试 1: 检查服务状态');
    try {
        const response = await api.get('/health');
        if (response.data.success && response.data.data.available) {
            logSuccess('服务可用');
            recordTest(true);
            return true;
        }
        else {
            logError(`服务不可用: ${JSON.stringify(response.data)}`);
            logWarning('💡 请检查 POSTGRESQL_MCP_SERVER_URL 配置');
            recordTest(false);
            return false;
        }
    }
    catch (error) {
        logError(`健康检查失败: ${error.message}`);
        if (error.code === 'ECONNREFUSED') {
            logWarning('💡 请确保服务器运行在 http://localhost:3000');
        }
        recordTest(false);
        return false;
    }
}
async function testListTools() {
    var _a;
    logInfo('\n📋 测试 2: 列出所有可用工具');
    try {
        const response = await api.get('/tools');
        if (response.data.success) {
            const tools = ((_a = response.data.data) === null || _a === void 0 ? void 0 : _a.tools) || [];
            logSuccess(`获取工具列表成功，找到 ${tools.length} 个工具`);
            if (tools.length > 0) {
                tools.forEach((tool, index) => {
                    logInfo(`  ${index + 1}. ${tool.name}: ${tool.description || '无描述'}`);
                });
            }
            recordTest(true);
            return true;
        }
        else {
            logError(`获取工具列表失败: ${JSON.stringify(response.data)}`);
            recordTest(false);
            return false;
        }
    }
    catch (error) {
        logError(`获取工具列表失败: ${error.message}`);
        if (error.response) {
            logError(`  响应: ${JSON.stringify(error.response.data)}`);
        }
        recordTest(false);
        return false;
    }
}
async function testQuery() {
    logInfo('\n📋 测试 3: 执行 SQL 查询');
    try {
        const params = {
            query: 'SELECT 1 as test_value, NOW() as current_time',
            params: [],
        };
        const response = await api.post('/query', params);
        if (response.data.success) {
            const result = response.data.data;
            logSuccess(`查询成功`);
            logInfo(`  返回行数: ${result.rowCount || 0}`);
            if (result.rows && result.rows.length > 0) {
                logInfo(`  示例数据: ${JSON.stringify(result.rows[0])}`);
            }
            recordTest(true);
            return true;
        }
        else {
            logError(`查询失败: ${JSON.stringify(response.data)}`);
            recordTest(false);
            return false;
        }
    }
    catch (error) {
        logError(`执行查询失败: ${error.message}`);
        if (error.response) {
            logError(`  响应: ${JSON.stringify(error.response.data)}`);
        }
        logWarning('💡 注意：此测试需要配置有效的 PostgreSQL 数据库连接');
        recordTest(false);
        return false;
    }
}
async function testExecute() {
    logInfo('\n📋 测试 4: 执行 SQL 命令（只读测试）');
    try {
        const params = {
            query: 'SELECT version() as pg_version',
            params: [],
        };
        const response = await api.post('/execute', params);
        if (response.data.success) {
            const result = response.data.data;
            logSuccess(`执行成功`);
            logInfo(`  影响行数: ${result.rowCount || 0}`);
            recordTest(true);
            return true;
        }
        else {
            logError(`执行失败: ${JSON.stringify(response.data)}`);
            recordTest(false);
            return false;
        }
    }
    catch (error) {
        logError(`执行命令失败: ${error.message}`);
        if (error.response) {
            logError(`  响应: ${JSON.stringify(error.response.data)}`);
        }
        logWarning('💡 注意：此测试需要配置有效的 PostgreSQL 数据库连接');
        recordTest(false);
        return false;
    }
}
async function testInvalidQuery() {
    logInfo('\n📋 测试 5: 无效查询处理');
    try {
        const params = {
            query: 'INVALID SQL QUERY',
            params: [],
        };
        const response = await api.post('/query', params);
        if (!response.data.success) {
            logSuccess('正确处理了无效查询');
            recordTest(true);
            return true;
        }
        else {
            logError('应该返回错误但没有返回');
            recordTest(false);
            return false;
        }
    }
    catch (error) {
        if (error.response && (error.response.status === 400 || error.response.status === 500)) {
            logSuccess('正确处理了无效查询（返回错误）');
            recordTest(true);
            return true;
        }
        else {
            logError(`意外的错误: ${error.message}`);
            recordTest(false);
            return false;
        }
    }
}
async function runTests() {
    log('\n🚀 开始测试 PostgreSQL MCP API...', 'blue');
    log(`📡 API Base URL: ${API_BASE}\n`, 'cyan');
    logInfo('检查服务器连接...');
    try {
        await axios_1.default.get(`${BASE_URL}/api/postgresql-mcp/health`, { timeout: 5000 });
        logSuccess('服务器连接正常');
    }
    catch (error) {
        logError(`无法连接到服务器: ${error.message}`);
        logWarning('💡 请确保服务器运行在 http://localhost:3000');
        logWarning('💡 运行命令: npm run start:dev');
        process.exit(1);
    }
    await testHealthCheck();
    await testListTools();
    await testQuery();
    await testExecute();
    await testInvalidQuery();
    log('\n' + '='.repeat(50), 'blue');
    log(`📊 测试结果总结`, 'blue');
    log('='.repeat(50), 'blue');
    log(`总测试数: ${totalTests}`, 'cyan');
    log(`通过: ${passedTests}`, 'green');
    log(`失败: ${failedTests}`, failedTests > 0 ? 'red' : 'green');
    log(`成功率: ${totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(2) : 0}%`, 'cyan');
    log('='.repeat(50) + '\n', 'blue');
    if (failedTests === 0) {
        logSuccess('🎉 所有测试通过！');
        process.exit(0);
    }
    else {
        logError(`❌ ${failedTests} 个测试失败`);
        logWarning('💡 某些测试可能需要配置有效的 PostgreSQL 数据库连接');
        process.exit(1);
    }
}
runTests().catch((error) => {
    logError(`测试执行失败: ${error.message}`);
    process.exit(1);
});
//# sourceMappingURL=test-postgresql-mcp-api.js.map
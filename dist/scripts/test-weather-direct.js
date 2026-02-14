#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const weather_direct_service_1 = require("../src/mcp/weather-direct.service");
const weather_direct_module_1 = require("../src/mcp/weather-direct.module");
async function testWeatherDirect() {
    console.log('🧪 开始测试 Weather Direct API 集成...\n');
    const app = await core_1.NestFactory.createApplicationContext(weather_direct_module_1.WeatherDirectModule);
    const weatherService = app.get(weather_direct_service_1.WeatherDirectService);
    try {
        console.log('1️⃣ 检查服务可用性...');
        const isAvailable = weatherService.isServiceAvailable();
        console.log(`服务状态: ${isAvailable ? '✅ 可用' : '❌ 不可用'}\n`);
        if (!isAvailable) {
            throw new Error('Weather Direct Service 不可用');
        }
        console.log('2️⃣ 测试获取当前天气...');
        console.log('城市: New York');
        const currentWeather = await weatherService.getCurrentWeather('New York');
        console.log('当前天气:', JSON.stringify(currentWeather, null, 2));
        console.log('✅ 获取当前天气功能正常\n');
        console.log('3️⃣ 测试获取日期范围内的天气...');
        console.log('城市: Tokyo, 日期范围: 2026-02-07 到 2026-02-10');
        const forecast = await weatherService.getWeatherByDatetimeRange('Tokyo', '2026-02-07', '2026-02-10');
        console.log('天气预报:', JSON.stringify(forecast, null, 2));
        console.log('✅ 获取天气预报功能正常\n');
        console.log('4️⃣ 测试获取当前日期时间...');
        console.log('时区: Asia/Shanghai');
        const dateTime = await weatherService.getCurrentDateTime('Asia/Shanghai');
        console.log('当前日期时间:', JSON.stringify(dateTime, null, 2));
        console.log('✅ 获取当前日期时间功能正常\n');
        console.log('🎉 所有测试通过！');
    }
    catch (error) {
        console.error('❌ 测试失败:', error);
        if (error.message) {
            console.error('错误信息:', error.message);
        }
        if (error.stack) {
            console.error('堆栈跟踪:', error.stack);
        }
        process.exit(1);
    }
    finally {
        await app.close();
    }
}
testWeatherDirect().catch((error) => {
    console.error('未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=test-weather-direct.js.map
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const BASE_URL = 'https://api.exchangerate-api.com/v4';
async function testCurrencyExchange() {
    console.log('🔍 测试 Currency Exchange Direct API...\n');
    try {
        console.log('1️⃣  测试获取最新汇率（USD）...');
        const latestResponse = await axios_1.default.get(`${BASE_URL}/latest/USD`);
        if (latestResponse.data && latestResponse.data.rates) {
            console.log(`✅ 获取最新汇率成功`);
            console.log(`   基础货币: ${latestResponse.data.base}`);
            console.log(`   日期: ${latestResponse.data.date}`);
            console.log(`   支持的货币数量: ${Object.keys(latestResponse.data.rates).length}`);
            const commonCurrencies = ['EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD'];
            console.log(`   常见货币汇率:`);
            for (const currency of commonCurrencies) {
                if (latestResponse.data.rates[currency]) {
                    console.log(`     ${currency}: ${latestResponse.data.rates[currency]}`);
                }
            }
        }
        else {
            console.error(`❌ 获取最新汇率失败: 响应格式不正确`);
        }
        console.log('\n');
        console.log('2️⃣  测试货币转换（100 USD -> EUR）...');
        const usdToEurRate = latestResponse.data.rates['EUR'];
        if (usdToEurRate) {
            const amount = 100;
            const converted = amount * usdToEurRate;
            console.log(`✅ 货币转换成功`);
            console.log(`   ${amount} USD = ${converted.toFixed(2)} EUR`);
            console.log(`   汇率: 1 USD = ${usdToEurRate} EUR`);
        }
        else {
            console.error(`❌ 货币转换失败: EUR 汇率不可用`);
        }
        console.log('\n');
        console.log('3️⃣  测试获取历史汇率（7天前）...');
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const dateStr = sevenDaysAgo.toISOString().split('T')[0];
        try {
            const historicalResponse = await axios_1.default.get(`${BASE_URL}/history/USD/${dateStr}`);
            if (historicalResponse.data && historicalResponse.data.rates) {
                console.log(`✅ 获取历史汇率成功`);
                console.log(`   日期: ${historicalResponse.data.date}`);
                console.log(`   EUR 汇率（${dateStr}）: ${historicalResponse.data.rates['EUR'] || 'N/A'}`);
                if (latestResponse.data.rates['EUR'] && historicalResponse.data.rates['EUR']) {
                    const currentRate = latestResponse.data.rates['EUR'];
                    const historicalRate = historicalResponse.data.rates['EUR'];
                    const change = ((currentRate - historicalRate) / historicalRate * 100).toFixed(2);
                    console.log(`   汇率变化: ${change}%`);
                }
            }
            else {
                console.error(`❌ 获取历史汇率失败: 响应格式不正确`);
            }
        }
        catch (error) {
            if (error.response && error.response.status === 404) {
                console.log(`⚠️  历史汇率不可用（日期: ${dateStr}）`);
            }
            else {
                console.error(`❌ 获取历史汇率失败: ${error.message}`);
            }
        }
        console.log('\n✅ 所有测试完成！');
    }
    catch (error) {
        console.error('❌ 测试失败:', error.message);
        if (error.response) {
            console.error('   响应状态:', error.response.status);
            console.error('   响应数据:', JSON.stringify(error.response.data, null, 2));
        }
        else if (error.request) {
            console.error('   请求错误:', error.request);
        }
        else {
            console.error('   错误详情:', error);
        }
        process.exit(1);
    }
}
testCurrencyExchange().catch((error) => {
    console.error('未捕获的错误:', error);
    process.exit(1);
});
//# sourceMappingURL=test-currency-direct-simple.js.map
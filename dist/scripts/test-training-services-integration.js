"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const TRAIN_SERVICE_URL = process.env.TRAIN_SERVICE_URL || 'http://localhost:8000';
const VLLM_URL = process.env.VLLM_URL || 'http://localhost:8080';
const LLM_JUDGE_URL = process.env.LLM_JUDGE_URL || 'http://localhost:8003';
const NESTJS_URL = process.env.NESTJS_URL || 'http://localhost:3000';
async function checkService(name, url, healthPath = '/health') {
    try {
        const response = await axios_1.default.get(`${url}${healthPath}`, { timeout: 5000 });
        return {
            name,
            url,
            healthy: true,
            details: response.data,
        };
    }
    catch (error) {
        return {
            name,
            url,
            healthy: false,
            error: (error === null || error === void 0 ? void 0 : error.message) || String(error),
        };
    }
}
async function testLoraTrainService() {
    console.log('\n📦 测试 LoRA 训练服务...');
    const status = await checkService('LoRA Train', TRAIN_SERVICE_URL);
    console.log(`  状态: ${status.healthy ? '✅ 健康' : '❌ 不可用'}`);
    if (status.details) {
        console.log(`  详情:`, JSON.stringify(status.details, null, 2));
    }
    if (status.error) {
        console.log(`  错误: ${status.error}`);
    }
}
async function testVllmService() {
    var _a, _b;
    console.log('\n🚀 测试 vLLM 推理服务...');
    const status = await checkService('vLLM', VLLM_URL);
    console.log(`  状态: ${status.healthy ? '✅ 健康' : '❌ 不可用'}`);
    if (status.healthy) {
        try {
            const modelsResponse = await axios_1.default.get(`${VLLM_URL}/v1/models`, { timeout: 5000 });
            console.log(`  可用模型:`, ((_b = (_a = modelsResponse.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.map((m) => m.id).join(', ')) || '无');
        }
        catch (error) {
            console.log(`  获取模型列表失败: ${error === null || error === void 0 ? void 0 : error.message}`);
        }
    }
    if (status.error) {
        console.log(`  错误: ${status.error}`);
    }
}
async function testLlmJudgeService() {
    var _a;
    console.log('\n⚖️ 测试 LLM Judge 服务...');
    const status = await checkService('LLM Judge', LLM_JUDGE_URL);
    console.log(`  状态: ${status.healthy ? '✅ 健康' : '❌ 不可用'}`);
    if (status.details) {
        console.log(`  LLM Provider: ${status.details.llm_provider || 'unknown'}`);
        console.log(`  vLLM URL: ${status.details.vllm_url || 'unknown'}`);
    }
    if (status.error) {
        console.log(`  错误: ${status.error}`);
    }
    if (status.healthy) {
        console.log('\n  测试计划评分...');
        try {
            const scoreResponse = await axios_1.default.post(`${LLM_JUDGE_URL}/score`, {
                request_id: 'test-001',
                plan: [
                    {
                        day: 1,
                        activities: [
                            { name: '雷克雅未克市区游览', duration: '4h' },
                            { name: '黄金圈一日游', duration: '8h' },
                        ],
                        summary: '冰岛首都及周边',
                    },
                ],
                user_request: '规划一个冰岛 3 天行程',
                evidence: [{ type: 'weather', data: '晴天, 10°C' }],
            }, { timeout: 10000 });
            console.log(`  评分结果: ${scoreResponse.data.overall_score}/10`);
            console.log(`  Provider: ${scoreResponse.data.llm_provider}`);
            console.log(`  延迟: ${(_a = scoreResponse.data.latency_ms) === null || _a === void 0 ? void 0 : _a.toFixed(2)}ms`);
        }
        catch (error) {
            console.log(`  评分测试失败: ${error === null || error === void 0 ? void 0 : error.message}`);
        }
    }
}
async function testNestJsTrainingApi() {
    var _a, _b, _c;
    console.log('\n🔧 测试 NestJS 训练 API...');
    const status = await checkService('NestJS Training', NESTJS_URL, '/api/training/health');
    console.log(`  状态: ${status.healthy ? '✅ 健康' : '❌ 不可用'}`);
    if (status.details) {
        console.log(`  服务状态:`);
        console.log(`    - Train Service: ${((_a = status.details.services) === null || _a === void 0 ? void 0 : _a.train_service) ? '✅' : '❌'}`);
        console.log(`    - vLLM Service: ${((_b = status.details.services) === null || _b === void 0 ? void 0 : _b.vllm_service) ? '✅' : '❌'}`);
        console.log(`    - LLM Judge: ${((_c = status.details.services) === null || _c === void 0 ? void 0 : _c.llm_judge_service) ? '✅' : '❌'}`);
    }
    if (status.error) {
        console.log(`  错误: ${status.error}`);
    }
}
async function testLoraEvaluation() {
    var _a, _b;
    console.log('\n📊 测试 LoRA 模型评估...');
    try {
        const evalResponse = await axios_1.default.post(`${LLM_JUDGE_URL}/evaluate-lora`, {
            request_id: 'lora-eval-001',
            prompt: '规划一个冰岛 5 天自驾行程，包含黄金圈和南部海岸',
            baseline_response: `
        Day 1: 雷克雅未克 -> 黄金圈（辛格韦德利、间歇泉、黄金瀑布）
        Day 2: 南部海岸（塞里雅兰瀑布、斯科加瀑布、黑沙滩）
        Day 3: 冰川徒步 + 杰古沙龙冰河湖
        Day 4: 东部峡湾
        Day 5: 返回雷克雅未克
      `,
            lora_response: `
        Day 1: 抵达雷克雅未克，入住酒店，市区简单游览
        Day 2: 黄金圈一日游（辛格韦德利国家公园、Strokkur 间歇泉、黄金瀑布）
        Day 3: 南海岸（塞里雅兰瀑布、斯科加瀑布、Reynisfjara 黑沙滩）住维克镇
        Day 4: 杰古沙龙冰河湖 + 钻石沙滩，返程住霍夫
        Day 5: 返回雷克雅未克，送车，机场
        
        注意事项：
        - 建议租用 4WD 车辆
        - 冰川徒步需提前预订
        - 关注天气和路况
      `,
            task_type: 'planning',
        }, { timeout: 15000 });
        console.log(`  Baseline 评分: ${evalResponse.data.baseline_score}/10`);
        console.log(`  LoRA 评分: ${evalResponse.data.lora_score}/10`);
        console.log(`  Winner: ${evalResponse.data.winner}`);
        console.log(`  延迟: ${(_a = evalResponse.data.latency_ms) === null || _a === void 0 ? void 0 : _a.toFixed(2)}ms`);
        if (((_b = evalResponse.data.recommendations) === null || _b === void 0 ? void 0 : _b.length) > 0) {
            console.log(`  建议:`);
            evalResponse.data.recommendations.slice(0, 3).forEach((rec) => {
                console.log(`    - ${rec}`);
            });
        }
    }
    catch (error) {
        console.log(`  LoRA 评估失败: ${error === null || error === void 0 ? void 0 : error.message}`);
    }
}
async function main() {
    console.log('========================================');
    console.log('TripNARA 训练服务整合测试');
    console.log('========================================');
    console.log(`\n配置:`);
    console.log(`  Train Service: ${TRAIN_SERVICE_URL}`);
    console.log(`  vLLM: ${VLLM_URL}`);
    console.log(`  LLM Judge: ${LLM_JUDGE_URL}`);
    console.log(`  NestJS: ${NESTJS_URL}`);
    await testLoraTrainService();
    await testVllmService();
    await testLlmJudgeService();
    await testNestJsTrainingApi();
    await testLoraEvaluation();
    console.log('\n========================================');
    console.log('测试完成');
    console.log('========================================');
}
main().catch(console.error);
//# sourceMappingURL=test-training-services-integration.js.map
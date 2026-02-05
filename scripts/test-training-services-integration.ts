/**
 * 测试训练服务整合
 *
 * 验证：
 * 1. LoRA 训练服务 (端口 8000)
 * 2. vLLM 推理服务 (端口 8080)
 * 3. LLM Judge 服务 (端口 8003)
 * 4. NestJS 训练 API
 */

import axios from 'axios';

const TRAIN_SERVICE_URL = process.env.TRAIN_SERVICE_URL || 'http://localhost:8000';
const VLLM_URL = process.env.VLLM_URL || 'http://localhost:8080';
const LLM_JUDGE_URL = process.env.LLM_JUDGE_URL || 'http://localhost:8003';
const NESTJS_URL = process.env.NESTJS_URL || 'http://localhost:3000';

interface ServiceStatus {
  name: string;
  url: string;
  healthy: boolean;
  details?: any;
  error?: string;
}

async function checkService(name: string, url: string, healthPath: string = '/health'): Promise<ServiceStatus> {
  try {
    const response = await axios.get(`${url}${healthPath}`, { timeout: 5000 });
    return {
      name,
      url,
      healthy: true,
      details: response.data,
    };
  } catch (error: any) {
    return {
      name,
      url,
      healthy: false,
      error: error?.message || String(error),
    };
  }
}

async function testLoraTrainService(): Promise<void> {
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

async function testVllmService(): Promise<void> {
  console.log('\n🚀 测试 vLLM 推理服务...');
  
  const status = await checkService('vLLM', VLLM_URL);
  console.log(`  状态: ${status.healthy ? '✅ 健康' : '❌ 不可用'}`);
  
  if (status.healthy) {
    try {
      // 尝试列出模型
      const modelsResponse = await axios.get(`${VLLM_URL}/v1/models`, { timeout: 5000 });
      console.log(`  可用模型:`, modelsResponse.data?.data?.map((m: any) => m.id).join(', ') || '无');
    } catch (error: any) {
      console.log(`  获取模型列表失败: ${error?.message}`);
    }
  }
  if (status.error) {
    console.log(`  错误: ${status.error}`);
  }
}

async function testLlmJudgeService(): Promise<void> {
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
  
  // 测试评分功能
  if (status.healthy) {
    console.log('\n  测试计划评分...');
    try {
      const scoreResponse = await axios.post(`${LLM_JUDGE_URL}/score`, {
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
      console.log(`  延迟: ${scoreResponse.data.latency_ms?.toFixed(2)}ms`);
    } catch (error: any) {
      console.log(`  评分测试失败: ${error?.message}`);
    }
  }
}

async function testNestJsTrainingApi(): Promise<void> {
  console.log('\n🔧 测试 NestJS 训练 API...');
  
  const status = await checkService('NestJS Training', NESTJS_URL, '/api/training/health');
  console.log(`  状态: ${status.healthy ? '✅ 健康' : '❌ 不可用'}`);
  if (status.details) {
    console.log(`  服务状态:`);
    console.log(`    - Train Service: ${status.details.services?.train_service ? '✅' : '❌'}`);
    console.log(`    - vLLM Service: ${status.details.services?.vllm_service ? '✅' : '❌'}`);
    console.log(`    - LLM Judge: ${status.details.services?.llm_judge_service ? '✅' : '❌'}`);
  }
  if (status.error) {
    console.log(`  错误: ${status.error}`);
  }
}

async function testLoraEvaluation(): Promise<void> {
  console.log('\n📊 测试 LoRA 模型评估...');
  
  try {
    const evalResponse = await axios.post(`${LLM_JUDGE_URL}/evaluate-lora`, {
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
    console.log(`  延迟: ${evalResponse.data.latency_ms?.toFixed(2)}ms`);
    
    if (evalResponse.data.recommendations?.length > 0) {
      console.log(`  建议:`);
      evalResponse.data.recommendations.slice(0, 3).forEach((rec: string) => {
        console.log(`    - ${rec}`);
      });
    }
  } catch (error: any) {
    console.log(`  LoRA 评估失败: ${error?.message}`);
  }
}

async function main(): Promise<void> {
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

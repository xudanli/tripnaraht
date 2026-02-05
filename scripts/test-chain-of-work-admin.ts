/**
 * Chain-of-Work Admin 接口测试脚本
 * 
 * 测试所有管理端接口并验证数据完整性
 * 
 * 使用方法：
 *   npx ts-node scripts/test-chain-of-work-admin.ts
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

interface ChainOfWorkTestResult {
  name: string;
  passed: boolean;
  duration: number;
  data?: any;
  error?: string;
}

const results: ChainOfWorkTestResult[] = [];

async function request(method: string, path: string, body?: any): Promise<any> {
  const url = `${BASE_URL}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const text = await response.text();
  
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: response.status };
  }
}

async function runTest(name: string, testFn: () => Promise<any>): Promise<void> {
  const start = Date.now();
  try {
    const data = await testFn();
    results.push({
      name,
      passed: true,
      duration: Date.now() - start,
      data,
    });
    console.log(`✅ ${name} (${Date.now() - start}ms)`);
  } catch (error: any) {
    results.push({
      name,
      passed: false,
      duration: Date.now() - start,
      error: error.message,
    });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

async function main() {
  console.log('🚀 Chain-of-Work Admin 接口测试\n');
  console.log(`📍 API Base URL: ${BASE_URL}\n`);
  console.log('='.repeat(60) + '\n');

  // ============================================================================
  // 1. 统计接口测试
  // ============================================================================
  console.log('📊 1. 统计接口测试\n');
  
  await runTest('GET /api/chain-of-work/admin/stats', async () => {
    const data = await request('GET', '/api/chain-of-work/admin/stats');
    
    // 验证返回结构
    if (typeof data.total_drafts !== 'number') {
      throw new Error('缺少 total_drafts 字段');
    }
    if (typeof data.total_executions !== 'number') {
      throw new Error('缺少 total_executions 字段');
    }
    if (typeof data.success_rate !== 'number') {
      throw new Error('缺少 success_rate 字段');
    }
    if (!data.drafts_by_status || typeof data.drafts_by_status !== 'object') {
      throw new Error('缺少 drafts_by_status 字段');
    }
    if (!data.drafts_by_step_type || typeof data.drafts_by_step_type !== 'object') {
      throw new Error('缺少 drafts_by_step_type 字段');
    }
    
    console.log(`   📈 总草案数: ${data.total_drafts}`);
    console.log(`   📈 总执行数: ${data.total_executions}`);
    console.log(`   📈 成功率: ${data.success_rate}%`);
    console.log(`   📈 状态分布: ${JSON.stringify(data.drafts_by_status)}`);
    console.log(`   📈 步骤类型分布: ${JSON.stringify(data.drafts_by_step_type)}`);
    console.log(`   📈 Top Sub-Agents: ${JSON.stringify(data.top_sub_agents)}`);
    
    return data;
  });

  // ============================================================================
  // 2. 草案列表测试
  // ============================================================================
  console.log('\n📋 2. 草案列表测试\n');
  
  let firstDraftId: string | null = null;
  
  await runTest('GET /api/chain-of-work/admin/draft (列表)', async () => {
    const data = await request('GET', '/api/chain-of-work/admin/draft?page=1&page_size=5');
    
    if (!Array.isArray(data.drafts)) {
      throw new Error('drafts 不是数组');
    }
    if (!data.pagination) {
      throw new Error('缺少 pagination 字段');
    }
    
    console.log(`   📋 草案数量: ${data.drafts.length}`);
    console.log(`   📋 总数: ${data.pagination.total}`);
    console.log(`   📋 当前页: ${data.pagination.page}/${data.pagination.total_pages}`);
    
    if (data.drafts.length > 0) {
      firstDraftId = data.drafts[0].draft_id;
      console.log(`   📋 第一个草案: ${firstDraftId}`);
      console.log(`   📋 步骤数: ${data.drafts[0].step_count}`);
      console.log(`   📋 状态: ${data.drafts[0].status}`);
    }
    
    return data;
  });

  // ============================================================================
  // 3. 草案详情测试
  // ============================================================================
  console.log('\n📄 3. 草案详情测试\n');
  
  if (firstDraftId) {
    await runTest(`GET /api/chain-of-work/admin/draft/${firstDraftId}`, async () => {
      const data = await request('GET', `/api/chain-of-work/admin/draft/${firstDraftId}`);
      
      if (!data.draft) {
        throw new Error('草案不存在或返回 null');
      }
      
      console.log(`   📄 草案 ID: ${data.draft.draft_id}`);
      console.log(`   📄 工作流 ID: ${data.draft.workflow_id}`);
      console.log(`   📄 版本: ${data.draft.version}`);
      console.log(`   📄 编排模式: ${data.draft.orchestration_mode}`);
      console.log(`   📄 步骤数: ${data.draft.steps?.length || 0}`);
      
      if (data.draft.steps && data.draft.steps.length > 0) {
        console.log(`   📄 步骤列表:`);
        data.draft.steps.forEach((step: any, i: number) => {
          console.log(`      ${i + 1}. [${step.step_type || step.decisionType}] ${step.title} - ${step.status}`);
        });
      }
      
      if (data.execution_history && data.execution_history.length > 0) {
        console.log(`   📄 执行历史: ${data.execution_history.length} 条记录`);
      }
      
      return data;
    });
  } else {
    console.log('   ⚠️ 跳过草案详情测试（没有草案数据）');
  }

  // ============================================================================
  // 4. 执行接口测试
  // ============================================================================
  console.log('\n🚀 4. 执行接口测试\n');
  
  if (firstDraftId) {
    await runTest(`POST /api/chain-of-work/admin/draft/${firstDraftId}/execute`, async () => {
      const data = await request('POST', `/api/chain-of-work/admin/draft/${firstDraftId}/execute`, {
        options: { timeout_ms: 30000 },
      });
      
      console.log(`   🚀 执行 ID: ${data.execution_id}`);
      console.log(`   🚀 状态: ${data.status}`);
      console.log(`   🚀 消息: ${data.message}`);
      
      return data;
    });
  }

  // ============================================================================
  // 5. 执行历史测试
  // ============================================================================
  console.log('\n📜 5. 执行历史测试\n');
  
  await runTest('GET /api/chain-of-work/admin/execution', async () => {
    const data = await request('GET', '/api/chain-of-work/admin/execution?page=1&page_size=10');
    
    console.log(`   📜 执行记录数: ${data.executions?.length || 0}`);
    console.log(`   📜 总数: ${data.pagination?.total || 0}`);
    
    if (data.executions && data.executions.length > 0) {
      data.executions.slice(0, 3).forEach((exec: any, i: number) => {
        console.log(`   📜 ${i + 1}. ${exec.execution_id} - ${exec.status} (${exec.duration_ms}ms)`);
      });
    }
    
    return data;
  });

  // ============================================================================
  // 6. 配置接口测试
  // ============================================================================
  console.log('\n⚙️ 6. 配置接口测试\n');
  
  await runTest('GET /api/chain-of-work/admin/config', async () => {
    const data = await request('GET', '/api/chain-of-work/admin/config');
    
    console.log(`   ⚙️ 默认模型: ${data.default_model}`);
    console.log(`   ⚙️ 温度: ${data.default_temperature}`);
    console.log(`   ⚙️ 技能映射阈值: ${data.skill_mapping_threshold}`);
    console.log(`   ⚙️ 自动保存: ${data.auto_save_enabled}`);
    console.log(`   ⚙️ 编排模式: ${data.orchestration_modes?.join(', ')}`);
    console.log(`   ⚙️ 支持的步骤类型: ${data.supported_step_types?.join(', ')}`);
    
    return data;
  });

  // ============================================================================
  // 7. Decision Draft 接口测试
  // ============================================================================
  console.log('\n🎯 7. Decision Draft 接口测试\n');
  
  await runTest('GET /api/decision-draft/stats', async () => {
    const data = await request('GET', '/api/decision-draft/stats');
    
    if (data.statusCode === 404) {
      throw new Error('接口不存在');
    }
    
    console.log(`   🎯 总草案数: ${data.total_drafts || data.total || 0}`);
    console.log(`   🎯 总步骤数: ${data.total_steps || 0}`);
    
    return data;
  });

  await runTest('GET /api/decision-draft/admin/list', async () => {
    const data = await request('GET', '/api/decision-draft/admin/list?page=1&page_size=5');
    
    if (data.statusCode === 404) {
      throw new Error('接口不存在');
    }
    
    console.log(`   🎯 列表数量: ${data.items?.length || data.drafts?.length || 0}`);
    
    return data;
  });

  // ============================================================================
  // 8. 批量操作测试
  // ============================================================================
  console.log('\n🔄 8. 批量操作测试\n');
  
  await runTest('POST /api/chain-of-work/admin/draft/batch (validate)', async () => {
    if (!firstDraftId) {
      throw new Error('没有草案可验证');
    }
    
    const data = await request('POST', '/api/chain-of-work/admin/draft/batch', {
      action: 'validate',
      draft_ids: [firstDraftId],
    });
    
    console.log(`   🔄 成功数: ${data.success_count}`);
    console.log(`   🔄 失败数: ${data.failed_count}`);
    
    if (data.results && data.results.length > 0) {
      data.results.forEach((r: any) => {
        console.log(`   🔄 ${r.draft_id}: ${r.success ? '✅' : '❌'} ${r.error || ''}`);
      });
    }
    
    return data;
  });

  // ============================================================================
  // 9. 生成新草案测试
  // ============================================================================
  console.log('\n🆕 9. 生成新草案测试\n');
  
  await runTest('POST /api/chain-of-work/draft/generate', async () => {
    const data = await request('POST', '/api/chain-of-work/draft/generate', {
      trip_plan_request: {
        request_id: `test-${Date.now()}`,
        origin: '雷克雅未克',
        destination: '西峡湾',
        start_date: '2026-07-01',
        days: 3,
        mode: 'drive',
        party: {
          count: 2,
          fitness_level: 'medium',
        },
        preferences: {
          scenic_priority: true,
        },
      },
    });
    
    if (data.statusCode === 500) {
      console.log(`   ⚠️ 生成失败: ${data.message}`);
      return data;
    }
    
    if (data.draft) {
      console.log(`   🆕 草案 ID: ${data.draft.draft_id}`);
      console.log(`   🆕 工作流 ID: ${data.draft.workflow_id}`);
      console.log(`   🆕 步骤数: ${data.draft.steps?.length || 0}`);
      console.log(`   🆕 生成时间: ${data.generation_time_ms}ms`);
    }
    
    return data;
  });

  // ============================================================================
  // 测试结果汇总
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试结果汇总\n');
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  
  console.log(`✅ 通过: ${passed}/${total}`);
  console.log(`❌ 失败: ${failed}/${total}`);
  console.log(`⏱️ 总耗时: ${results.reduce((sum, r) => sum + r.duration, 0)}ms`);
  
  if (failed > 0) {
    console.log('\n❌ 失败的测试:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.error}`);
    });
  }
  
  // 数据完整性检查
  console.log('\n' + '='.repeat(60));
  console.log('🔍 数据完整性检查\n');
  
  const statsResult = results.find(r => r.name.includes('stats'));
  if (statsResult?.data) {
    const stats = statsResult.data;
    
    if (stats.total_drafts === 0) {
      console.log('⚠️ 警告: 没有决策草案数据');
    } else {
      console.log(`✅ 有 ${stats.total_drafts} 个决策草案`);
    }
    
    if (stats.total_executions === 0) {
      console.log('⚠️ 警告: 没有执行记录');
    }
    
    if (Object.keys(stats.drafts_by_status || {}).length === 0) {
      console.log('⚠️ 警告: 状态分布为空');
    }
    
    if (Object.keys(stats.drafts_by_step_type || {}).length === 0) {
      console.log('⚠️ 警告: 步骤类型分布为空');
    }
    
    if ((stats.top_skills || []).length === 0) {
      console.log('⚠️ 警告: 没有技能使用记录');
    }
    
    if ((stats.top_sub_agents || []).length === 0) {
      console.log('⚠️ 警告: 没有 Sub-Agent 使用记录');
    } else {
      console.log(`✅ 有 ${stats.top_sub_agents.length} 个 Sub-Agent 使用记录`);
    }
  }
  
  console.log('\n✨ 测试完成！\n');
}

main().catch(console.error);

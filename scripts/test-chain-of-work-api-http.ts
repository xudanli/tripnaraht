// scripts/test-chain-of-work-api-http.ts

/**
 * Chain-of-Work 引擎 HTTP API 接口测试脚本
 * 
 * 通过 HTTP 请求测试用户端和管理端的所有接口
 * 需要先启动 NestJS 服务器: npm run dev
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_PREFIX = '/api';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  duration_ms?: number;
  data?: any;
}

async function httpRequest(
  method: string,
  path: string,
  body?: any,
): Promise<{ status: number; data: any }> {
  const url = `${API_BASE_URL}${API_PREFIX}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const startTime = Date.now();
  const response = await fetch(url, options);
  const duration = Date.now() - startTime;

  let data: any;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return {
    status: response.status,
    data: { ...data, _duration_ms: duration },
  };
}

async function testChainOfWorkAPI() {
  console.log('🚀 开始 Chain-of-Work 引擎 HTTP API 接口测试...\n');
  console.log(`📍 API 地址: ${API_BASE_URL}${API_PREFIX}\n`);

  const results: TestResult[] = [];

  try {
    // ==================== 用户端接口测试 ====================
    console.log('📋 ==================== 用户端接口测试 ====================\n');

    // 测试 1: 生成步骤草案（管理端功能，但通过用户端查看）
    console.log('📝 测试 1: 生成步骤草案');
    try {
      const testRequest = {
        trip_plan_request: {
          request_id: 'test-http-001',
          origin: 'Reykjavik',
          destination: 'Akureyri',
          start_date: '2026-07-01',
          days: 3,
          mode: 'drive',
          party: {
            count: 2,
            fitness_level: 'medium',
          },
        },
        config: {
          model: 'claude-3-5-sonnet',
          temperature: 0.7,
        },
      };

      const result = await httpRequest('POST', '/chain-of-work/draft/generate', testRequest);
      
      if (result.status === 200 && result.data.draft) {
        const draft = result.data.draft;
        console.log(`✅ 步骤草案生成成功:`);
        console.log(`   - Draft ID: ${draft.draft_id}`);
        console.log(`   - 步骤数量: ${draft.steps.length}`);
        console.log(`   - 响应时间: ${result.data._duration_ms}ms`);
        console.log(`   - 步骤列表: ${draft.steps.map((s: any) => s.step_type).join(' → ')}`);

        results.push({
          name: '生成步骤草案',
          success: true,
          duration_ms: result.data._duration_ms,
          data: { draft_id: draft.draft_id, step_count: draft.steps.length },
        });

        // 测试 2: 保存步骤草案
        console.log('\n💾 测试 2: 保存步骤草案');
        try {
          const saveResult = await httpRequest('POST', '/chain-of-work/draft/save', {
            draft,
            is_auto_save: false,
          });

          if (saveResult.status === 200) {
            console.log(`✅ 步骤草案保存成功:`);
            console.log(`   - Version: ${saveResult.data.version}`);
            console.log(`   - Saved At: ${saveResult.data.saved_at}`);

            results.push({
              name: '保存步骤草案',
              success: true,
              duration_ms: saveResult.data._duration_ms,
              data: saveResult.data,
            });

            // 测试 3: 查询版本列表
            console.log('\n📚 测试 3: 查询版本列表');
            try {
              const versionResult = await httpRequest('GET', `/chain-of-work/version/${draft.workflow_id}?page=1&page_size=20`);

              if (versionResult.status === 200) {
                console.log(`✅ 版本列表查询成功:`);
                console.log(`   - 版本数量: ${versionResult.data.total}`);
                console.log(`   - 响应时间: ${versionResult.data._duration_ms}ms`);

                results.push({
                  name: '查询版本列表',
                  success: true,
                  duration_ms: versionResult.data._duration_ms,
                  data: { total: versionResult.data.total },
                });
              } else {
                throw new Error(`HTTP ${versionResult.status}: ${JSON.stringify(versionResult.data)}`);
              }
            } catch (error: any) {
              console.log(`❌ 版本列表查询失败: ${error.message}`);
              results.push({
                name: '查询版本列表',
                success: false,
                error: error.message,
              });
            }
          } else {
            throw new Error(`HTTP ${saveResult.status}: ${JSON.stringify(saveResult.data)}`);
          }
        } catch (error: any) {
          console.log(`❌ 步骤草案保存失败: ${error.message}`);
          results.push({
            name: '保存步骤草案',
            success: false,
            error: error.message,
          });
        }
      } else {
        throw new Error(`HTTP ${result.status}: ${JSON.stringify(result.data)}`);
      }
    } catch (error: any) {
      console.log(`❌ 步骤草案生成失败: ${error.message}`);
      results.push({
        name: '生成步骤草案',
        success: false,
        error: error.message,
      });
    }

    // ==================== 管理端接口测试 ====================
    console.log('\n\n📋 ==================== 管理端接口测试 ====================\n');

    // 测试 4: 获取统计信息
    console.log('📊 测试 4: 获取统计信息');
    try {
      const statsResult = await httpRequest('GET', '/chain-of-work/admin/stats');

      if (statsResult.status === 200) {
        console.log(`✅ 统计信息查询成功:`);
        console.log(`   - 总草案数: ${statsResult.data.total_drafts}`);
        console.log(`   - 总执行数: ${statsResult.data.total_executions}`);
        console.log(`   - 响应时间: ${statsResult.data._duration_ms}ms`);

        results.push({
          name: '获取统计信息',
          success: true,
          duration_ms: statsResult.data._duration_ms,
          data: statsResult.data,
        });
      } else {
        throw new Error(`HTTP ${statsResult.status}: ${JSON.stringify(statsResult.data)}`);
      }
    } catch (error: any) {
      console.log(`❌ 统计信息查询失败: ${error.message}`);
      results.push({
        name: '获取统计信息',
        success: false,
        error: error.message,
      });
    }

    // 测试 5: 查询所有草案列表
    console.log('\n📋 测试 5: 查询所有草案列表');
    try {
      const draftsResult = await httpRequest('GET', '/chain-of-work/admin/draft?page=1&page_size=20');

      if (draftsResult.status === 200) {
        console.log(`✅ 草案列表查询成功:`);
        console.log(`   - 草案数量: ${draftsResult.data.pagination.total}`);
        console.log(`   - 响应时间: ${draftsResult.data._duration_ms}ms`);

        results.push({
          name: '查询所有草案列表',
          success: true,
          duration_ms: draftsResult.data._duration_ms,
          data: { total: draftsResult.data.pagination.total },
        });
      } else {
        throw new Error(`HTTP ${draftsResult.status}: ${JSON.stringify(draftsResult.data)}`);
      }
    } catch (error: any) {
      console.log(`❌ 草案列表查询失败: ${error.message}`);
      results.push({
        name: '查询所有草案列表',
        success: false,
        error: error.message,
      });
    }

    // 测试 6: 获取配置
    console.log('\n⚙️  测试 6: 获取配置');
    try {
      const configResult = await httpRequest('GET', '/chain-of-work/admin/config');

      if (configResult.status === 200) {
        console.log(`✅ 配置查询成功:`);
        console.log(`   - 默认模型: ${configResult.data.default_model}`);
        console.log(`   - 默认温度: ${configResult.data.default_temperature}`);
        console.log(`   - Skills 映射阈值: ${configResult.data.skill_mapping_threshold}`);

        results.push({
          name: '获取配置',
          success: true,
          duration_ms: configResult.data._duration_ms,
          data: configResult.data,
        });
      } else {
        throw new Error(`HTTP ${configResult.status}: ${JSON.stringify(configResult.data)}`);
      }
    } catch (error: any) {
      console.log(`❌ 配置查询失败: ${error.message}`);
      results.push({
        name: '获取配置',
        success: false,
        error: error.message,
      });
    }

    // 测试 7: 更新配置
    console.log('\n⚙️  测试 7: 更新配置');
    try {
      const updateConfigResult = await httpRequest('PUT', '/chain-of-work/admin/config', {
        default_temperature: 0.8,
        skill_mapping_threshold: 0.75,
      });

      if (updateConfigResult.status === 200) {
        console.log(`✅ 配置更新成功:`);
        console.log(`   - 更新后的温度: ${updateConfigResult.data.config.default_temperature}`);
        console.log(`   - 更新后的阈值: ${updateConfigResult.data.config.skill_mapping_threshold}`);

        results.push({
          name: '更新配置',
          success: true,
          duration_ms: updateConfigResult.data._duration_ms,
          data: updateConfigResult.data,
        });
      } else {
        throw new Error(`HTTP ${updateConfigResult.status}: ${JSON.stringify(updateConfigResult.data)}`);
      }
    } catch (error: any) {
      console.log(`❌ 配置更新失败: ${error.message}`);
      results.push({
        name: '更新配置',
        success: false,
        error: error.message,
      });
    }

    // 测试 8: 查询执行历史
    console.log('\n📜 测试 8: 查询执行历史');
    try {
      const executionResult = await httpRequest('GET', '/chain-of-work/admin/execution?page=1&page_size=20');

      if (executionResult.status === 200) {
        console.log(`✅ 执行历史查询成功:`);
        console.log(`   - 执行数量: ${executionResult.data.pagination.total}`);
        console.log(`   - 响应时间: ${executionResult.data._duration_ms}ms`);

        results.push({
          name: '查询执行历史',
          success: true,
          duration_ms: executionResult.data._duration_ms,
          data: { total: executionResult.data.pagination.total },
        });
      } else {
        throw new Error(`HTTP ${executionResult.status}: ${JSON.stringify(executionResult.data)}`);
      }
    } catch (error: any) {
      console.log(`❌ 执行历史查询失败: ${error.message}`);
      results.push({
        name: '查询执行历史',
        success: false,
        error: error.message,
      });
    }

    // ==================== 总结 ====================
    console.log('\n\n📊 ==================== 测试总结 ====================\n');
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const avgDuration = results
      .filter(r => r.duration_ms)
      .reduce((sum, r) => sum + (r.duration_ms || 0), 0) / results.filter(r => r.duration_ms).length;

    console.log(`✅ 成功: ${successCount} 个`);
    console.log(`❌ 失败: ${failCount} 个`);
    console.log(`⏱️  平均响应时间: ${avgDuration.toFixed(0)}ms`);

    console.log('\n详细结果:');
    results.forEach((result, index) => {
      const icon = result.success ? '✅' : '❌';
      const duration = result.duration_ms ? ` (${result.duration_ms}ms)` : '';
      console.log(`   ${index + 1}. ${icon} ${result.name}${duration}`);
      if (!result.success && result.error) {
        console.log(`      错误: ${result.error}`);
      }
    });

    console.log('\n🎉 HTTP API 接口测试完成！');

    if (failCount > 0) {
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ HTTP API 接口测试失败:', error.message);
    if (error.stack) {
      console.error('\n错误堆栈:', error.stack);
    }
    process.exit(1);
  }
}

// 检查服务器是否运行
async function checkServer() {
  try {
    const response = await fetch(`${API_BASE_URL}/api-docs`);
    if (response.ok) {
      return true;
    }
  } catch (error) {
    return false;
  }
  return false;
}

// 运行测试
(async () => {
  console.log('🔍 检查服务器状态...');
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.error(`❌ 服务器未运行或无法访问: ${API_BASE_URL}`);
    console.error('   请先启动服务器: npm run dev');
    process.exit(1);
  }
  
  console.log('✅ 服务器运行正常\n');
  
  await testChainOfWorkAPI();
})();
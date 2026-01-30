#!/usr/bin/env tsx
/**
 * 测试证据修改接口
 */

import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  success: boolean;
  error?: string;
  data?: any;
}

async function testEvidenceModification() {
  console.log('='.repeat(70));
  console.log('🧪 测试证据修改接口');
  console.log('='.repeat(70));
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  // 需要替换为实际的tripId和evidenceId
  const tripId = process.env.TRIP_ID || '550e8400-e29b-41d4-a716-446655440000';
  const evidenceId = process.env.EVIDENCE_ID || 'ev-place-123-opening-hours';

  const results: TestResult[] = [];

  // 测试1: 获取证据列表（验证状态字段）
  console.log('📋 测试1: 获取证据列表（验证状态字段）');
  try {
    const response = await axios.get(`${API_BASE_URL}/api/trips/${tripId}/evidence`, {
      params: { limit: 10 },
    });

    if (response.data.success && response.data.data.items.length > 0) {
      const firstEvidence = response.data.data.items[0];
      console.log(`   ✅ 成功获取 ${response.data.data.total} 条证据`);
      console.log(`   📦 第一条证据:`);
      console.log(`      - ID: ${firstEvidence.id}`);
      console.log(`      - 类型: ${firstEvidence.type}`);
      console.log(`      - 状态: ${firstEvidence.status || 'new (默认)'}`);
      console.log(`      - 用户备注: ${firstEvidence.userNote || '(无)'}`);
      
      results.push({
        name: '获取证据列表',
        success: true,
        data: response.data.data,
      });

      // 使用第一条证据的ID进行后续测试
      const testEvidenceId = firstEvidence.id;
      
      // 测试2: 更新单个证据状态
      console.log(`\n📋 测试2: 更新单个证据状态 (${testEvidenceId})`);
      try {
        const updateResponse = await axios.patch(
          `${API_BASE_URL}/api/trips/${tripId}/evidence/${testEvidenceId}`,
          {
            status: 'acknowledged',
            userNote: '测试备注：已确认',
          }
        );

        if (updateResponse.data.success) {
          console.log(`   ✅ 成功更新证据状态`);
          console.log(`   📦 更新结果:`);
          console.log(`      - 状态: ${updateResponse.data.data.status}`);
          console.log(`      - 用户备注: ${updateResponse.data.data.userNote}`);
          console.log(`      - 更新时间: ${updateResponse.data.data.updatedAt}`);
          
          results.push({
            name: '更新单个证据状态',
            success: true,
            data: updateResponse.data.data,
          });

          // 测试3: 验证状态已更新（重新获取证据列表）
          console.log(`\n📋 测试3: 验证状态已更新`);
          try {
            const verifyResponse = await axios.get(`${API_BASE_URL}/api/trips/${tripId}/evidence`, {
              params: { limit: 10 },
            });

            const updatedEvidence = verifyResponse.data.data.items.find(
              (item: any) => item.id === testEvidenceId
            );

            if (updatedEvidence && updatedEvidence.status === 'acknowledged') {
              console.log(`   ✅ 状态已正确更新`);
              console.log(`   📦 验证结果:`);
              console.log(`      - 状态: ${updatedEvidence.status}`);
              console.log(`      - 用户备注: ${updatedEvidence.userNote}`);
              
              results.push({
                name: '验证状态已更新',
                success: true,
                data: updatedEvidence,
              });
            } else {
              console.log(`   ⚠️  状态未更新或未找到`);
              results.push({
                name: '验证状态已更新',
                success: false,
                error: '状态未更新或未找到',
              });
            }
          } catch (error: any) {
            console.log(`   ❌ 验证失败: ${error.message}`);
            results.push({
              name: '验证状态已更新',
              success: false,
              error: error.message,
            });
          }

          // 测试4: 测试状态转换（acknowledged -> resolved）
          console.log(`\n📋 测试4: 测试状态转换 (acknowledged -> resolved)`);
          try {
            const resolveResponse = await axios.patch(
              `${API_BASE_URL}/api/trips/${tripId}/evidence/${testEvidenceId}`,
              {
                status: 'resolved',
                userNote: '已解决：已准备备选方案',
              }
            );

            if (resolveResponse.data.success) {
              console.log(`   ✅ 状态转换成功`);
              console.log(`   📦 更新结果:`);
              console.log(`      - 状态: ${resolveResponse.data.data.status}`);
              console.log(`      - 解决时间: ${resolveResponse.data.data.resolvedAt || '(无)'}`);
              
              results.push({
                name: '状态转换测试',
                success: true,
                data: resolveResponse.data.data,
              });
            } else {
              console.log(`   ❌ 状态转换失败`);
              results.push({
                name: '状态转换测试',
                success: false,
                error: resolveResponse.data.error?.message || '未知错误',
              });
            }
          } catch (error: any) {
            console.log(`   ❌ 状态转换失败: ${error.response?.data?.error?.message || error.message}`);
            results.push({
              name: '状态转换测试',
              success: false,
              error: error.response?.data?.error?.message || error.message,
            });
          }

          // 测试5: 测试不允许的状态转换（resolved -> acknowledged）
          console.log(`\n📋 测试5: 测试不允许的状态转换 (resolved -> acknowledged)`);
          try {
            await axios.patch(
              `${API_BASE_URL}/api/trips/${tripId}/evidence/${testEvidenceId}`,
              {
                status: 'acknowledged',
              }
            );

            // 如果成功，说明校验有问题
            console.log(`   ❌ 状态转换应该失败，但却成功了（校验逻辑有问题）`);
            results.push({
              name: '不允许的状态转换测试',
              success: false,
              error: '状态转换应该失败，但却成功了',
            });
          } catch (error: any) {
            if (error.response?.status === 400) {
              console.log(`   ✅ 正确拒绝了不允许的状态转换`);
              console.log(`   📦 错误信息: ${error.response.data.error?.message || error.message}`);
              
              results.push({
                name: '不允许的状态转换测试',
                success: true,
                data: { error: error.response.data.error?.message },
              });
            } else {
              console.log(`   ⚠️  请求失败，但不是预期的400错误: ${error.message}`);
              results.push({
                name: '不允许的状态转换测试',
                success: false,
                error: error.message,
              });
            }
          }

        } else {
          console.log(`   ❌ 更新失败: ${updateResponse.data.error?.message || '未知错误'}`);
          results.push({
            name: '更新单个证据状态',
            success: false,
            error: updateResponse.data.error?.message || '未知错误',
          });
        }
      } catch (error: any) {
        console.log(`   ❌ 更新失败: ${error.response?.data?.error?.message || error.message}`);
        results.push({
          name: '更新单个证据状态',
          success: false,
          error: error.response?.data?.error?.message || error.message,
        });
      }

      // 测试6: 批量更新证据
      console.log(`\n📋 测试6: 批量更新证据`);
      try {
        // 先获取多个证据ID
        const evidenceList = response.data.data.items.slice(0, 3);
        const evidenceIds = evidenceList.map((item: any) => item.id);

        const batchResponse = await axios.put(
          `${API_BASE_URL}/api/trips/${tripId}/evidence/batch-update`,
          {
            updates: evidenceIds.map((id: string, index: number) => ({
              evidenceId: id,
              status: index === 0 ? 'acknowledged' : 'dismissed',
              userNote: `批量更新测试 ${index + 1}`,
            })),
          }
        );

        if (batchResponse.data.success) {
          console.log(`   ✅ 批量更新成功`);
          console.log(`   📦 更新结果:`);
          console.log(`      - 成功: ${batchResponse.data.data.updated}`);
          console.log(`      - 失败: ${batchResponse.data.data.failed}`);
          if (batchResponse.data.data.errors) {
            console.log(`      - 错误详情:`, batchResponse.data.data.errors);
          }
          
          results.push({
            name: '批量更新证据',
            success: true,
            data: batchResponse.data.data,
          });
        } else {
          console.log(`   ❌ 批量更新失败`);
          results.push({
            name: '批量更新证据',
            success: false,
            error: batchResponse.data.error?.message || '未知错误',
          });
        }
      } catch (error: any) {
        console.log(`   ❌ 批量更新失败: ${error.response?.data?.error?.message || error.message}`);
        results.push({
          name: '批量更新证据',
          success: false,
          error: error.response?.data?.error?.message || error.message,
        });
      }

    } else {
      console.log(`   ⚠️  未找到证据，跳过后续测试`);
      console.log(`   💡 提示: 请先创建一个行程并确保有证据数据`);
      results.push({
        name: '获取证据列表',
        success: false,
        error: '未找到证据',
      });
    }
  } catch (error: any) {
    console.log(`   ❌ 获取证据列表失败: ${error.response?.data?.error?.message || error.message}`);
    results.push({
      name: '获取证据列表',
      success: false,
      error: error.response?.data?.error?.message || error.message,
    });
  }

  // 统计结果
  console.log('\n' + '='.repeat(70));
  console.log('📊 测试结果统计');
  console.log('='.repeat(70));

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log(`\n✅ 成功: ${successCount} 个`);
  console.log(`❌ 失败: ${failCount} 个`);
  console.log(`📦 总计: ${results.length} 个\n`);

  if (failCount > 0) {
    console.log('❌ 失败的测试:');
    results.filter(r => !r.success).forEach(result => {
      console.log(`   • ${result.name}`);
      if (result.error) {
        console.log(`     错误: ${result.error}`);
      }
    });
    console.log('');
  }

  console.log('✅ 测试完成！');
}

testEvidenceModification().catch(console.error);

#!/usr/bin/env npx tsx
/**
 * 测试证据获取进度反馈功能
 * 
 * 测试内容：
 * 1. 创建异步任务
 * 2. 查询任务进度
 * 3. 取消任务（可选）
 */

import { EvidenceFetchTaskService, EvidenceFetchTaskStatus } from '../src/trips/services/evidence-fetch-task.service';

async function main() {
  console.log('🧪 开始测试证据获取进度反馈功能...\n');

  // 直接实例化服务（不依赖NestJS容器）
  const evidenceFetchTaskService = new EvidenceFetchTaskService();

  try {

    // 测试1: 创建任务
    console.log('📝 测试1: 创建任务');
    const tripId = 'test-trip-id';
    const totalPlaces = 10;
    const taskId = evidenceFetchTaskService.createTask(tripId, totalPlaces);
    console.log(`✅ 任务创建成功: taskId=${taskId}\n`);

    // 测试2: 获取任务进度（PENDING状态）
    console.log('📊 测试2: 获取任务进度（PENDING状态）');
    let progress = evidenceFetchTaskService.getTaskProgress(taskId);
    if (!progress) {
      throw new Error('任务不存在');
    }
    console.log(`状态: ${progress.status}`);
    console.log(`总POI数: ${progress.totalPlaces}`);
    console.log(`已处理: ${progress.processedPlaces}`);
    console.log(`可取消: ${progress.canCancel}\n`);

    // 测试3: 标记为运行中
    console.log('▶️  测试3: 标记任务为运行中');
    evidenceFetchTaskService.markRunning(taskId);
    progress = evidenceFetchTaskService.getTaskProgress(taskId);
    if (!progress) {
      throw new Error('任务不存在');
    }
    console.log(`状态: ${progress.status}\n`);

    // 测试4: 更新当前处理的POI
    console.log('📍 测试4: 更新当前处理的POI');
    evidenceFetchTaskService.updateCurrentPlace(
      taskId,
      123,
      '蓝湖温泉',
      ['weather', 'opening_hours'],
    );
    progress = evidenceFetchTaskService.getTaskProgress(taskId);
    if (!progress) {
      throw new Error('任务不存在');
    }
    console.log(`当前POI: ${progress.currentPlace?.name}`);
    console.log(`证据类型: ${progress.currentPlace?.evidenceTypes.join(', ')}\n`);

    // 测试5: 增加处理计数
    console.log('📈 测试5: 增加处理计数');
    for (let i = 0; i < 5; i++) {
      const status = i % 3 === 0 ? 'success' : i % 3 === 1 ? 'partial' : 'failed';
      evidenceFetchTaskService.incrementProcessed(taskId, status);
      
      // 模拟处理时间
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    progress = evidenceFetchTaskService.getTaskProgress(taskId);
    if (!progress) {
      throw new Error('任务不存在');
    }
    console.log(`已处理: ${progress.processedPlaces}/${progress.totalPlaces}`);
    console.log(`成功: ${progress.successCount}`);
    console.log(`部分成功: ${progress.partialCount}`);
    console.log(`失败: ${progress.failedCount}`);
    if (progress.estimatedTimeRemaining !== undefined) {
      console.log(`预计剩余时间: ${progress.estimatedTimeRemaining}秒`);
    }
    console.log();

    // 测试6: 标记任务完成
    console.log('✅ 测试6: 标记任务完成');
    evidenceFetchTaskService.markCompleted(taskId, 8, 1, 1);
    progress = evidenceFetchTaskService.getTaskProgress(taskId);
    if (!progress) {
      throw new Error('任务不存在');
    }
    console.log(`状态: ${progress.status}`);
    console.log(`完成时间: ${progress.completedAt}`);
    console.log(`可取消: ${progress.canCancel}\n`);

    // 测试7: 取消任务（新任务）
    console.log('❌ 测试7: 取消任务');
    const cancelTaskId = evidenceFetchTaskService.createTask(tripId, 5);
    evidenceFetchTaskService.markRunning(cancelTaskId);
    const cancelled = evidenceFetchTaskService.cancelTask(cancelTaskId);
    console.log(`取消结果: ${cancelled ? '成功' : '失败'}`);
    const cancelledProgress = evidenceFetchTaskService.getTaskProgress(cancelTaskId);
    if (cancelledProgress) {
      console.log(`状态: ${cancelledProgress.status}\n`);
    }

    // 测试8: 测试不存在的任务
    console.log('🔍 测试8: 查询不存在的任务');
    const nonExistentProgress = evidenceFetchTaskService.getTaskProgress('non-existent-task-id');
    console.log(`结果: ${nonExistentProgress === null ? '正确返回null' : '错误：应返回null'}\n`);

    // 测试9: 测试无法取消的任务
    console.log('🚫 测试9: 尝试取消已完成的任务');
    const cannotCancel = evidenceFetchTaskService.cancelTask(taskId);
    console.log(`取消结果: ${cannotCancel ? '错误：应返回false' : '正确：无法取消已完成的任务'}\n`);

    console.log('✅ 所有测试通过！');
  } catch (error: any) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ 程序执行失败:', error);
  process.exit(1);
});

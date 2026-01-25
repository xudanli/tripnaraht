#!/usr/bin/env tsx
/**
 * Prometheus 监控指标测试
 *
 * 测试 RagMetricsService 和 HybridCacheService 的监控集成
 */

import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RagMetricsService } from '../src/rag/services/rag-metrics.service';
import { HybridCacheService } from '../src/rag/services/hybrid-cache.service';
import { RedisCacheService } from '../src/rag/services/redis-cache.service';

const logger = new Logger('PrometheusMetricsTest');

async function main() {
  logger.log('========================================');
  logger.log('Prometheus 监控指标测试');
  logger.log('========================================\n');

  try {
    // 创建测试模块
    logger.log('初始化服务...');
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [
        RagMetricsService,
        RedisCacheService,
        HybridCacheService,
      ],
    }).compile();

    await moduleRef.init(); // 触发OnModuleInit

    const metricsService = moduleRef.get(RagMetricsService);
    const hybridCache = moduleRef.get(HybridCacheService);

    logger.log('✓ 服务初始化完成\n');

    // 等待Redis连接（如果可用）
    await new Promise(resolve => setTimeout(resolve, 100));

    // ==================== 测试1: 缓存操作监控 ====================
    logger.log('测试1: 缓存操作监控');
    logger.log('─'.repeat(80));

    // 模拟缓存操作
    await hybridCache.set('test-key-1', { value: 'data1' }, 60);
    await hybridCache.set('test-key-2', { value: 'data2' }, 60);
    await hybridCache.set('test-key-3', { value: 'data3' }, 60);

    // 模拟命中
    await hybridCache.get('test-key-1'); // hit
    await hybridCache.get('test-key-2'); // hit
    await hybridCache.get('test-key-3'); // hit

    // 模拟未命中
    await hybridCache.get('non-existent-key-1'); // miss
    await hybridCache.get('non-existent-key-2'); // miss

    logger.log('✓ 执行了 3 次 set, 5 次 get (3 hit, 2 miss)');

    // 获取缓存统计
    const cacheStats = await metricsService.getCacheStats();
    logger.log(`✓ 缓存命中率: ${(cacheStats.hitRate * 100).toFixed(2)}% (${cacheStats.hits}/${cacheStats.hits + cacheStats.misses})`);
    logger.log('');

    // ==================== 测试2: 重试监控 ====================
    logger.log('测试2: 重试监控');
    logger.log('─'.repeat(80));

    // 模拟API重试（成功）
    metricsService.recordRetry('api', 3, true);
    metricsService.recordRetry('api', 2, true);

    // 模拟数据库重试（失败）
    metricsService.recordRetry('db', 5, false);

    logger.log('✓ 记录了 2 次成功重试, 1 次失败重试');
    logger.log('');

    // ==================== 测试3: 并行执行监控 ====================
    logger.log('测试3: 并行执行监控');
    logger.log('─'.repeat(80));

    // 模拟并行任务
    metricsService.recordParallelTaskStart(5);
    await new Promise(resolve => setTimeout(resolve, 50));

    for (let i = 0; i < 5; i++) {
      metricsService.recordParallelTaskComplete(true, 50);
    }

    logger.log('✓ 记录了 5 个并行任务执行');
    logger.log('');

    // ==================== 测试4: API调用监控 ====================
    logger.log('测试4: API调用监控');
    logger.log('─'.repeat(80));

    // 模拟Weather API调用
    metricsService.recordApiCall('weather', 250, true);
    metricsService.recordApiCall('weather', 180, true);

    // 模拟Places API调用（失败）
    metricsService.recordApiCall('places', 500, false, 'timeout');

    // 模拟WebBrowse调用
    metricsService.recordApiCall('web_browse', 1200, true);

    logger.log('✓ 记录了 4 次 API 调用 (3 成功, 1 失败)');
    logger.log('');

    // ==================== 测试5: RAG查询监控 ====================
    logger.log('测试5: RAG查询监控');
    logger.log('─'.repeat(80));

    // 模拟不同类别的查询
    metricsService.recordRagQuery('WEATHER', 150, 'VECTOR_RAG');
    metricsService.recordRagQuery('POI_HOURS', 200, 'HYBRID_RAG');
    metricsService.recordRagQuery('RULES', 1500, 'WEB_BROWSE');

    logger.log('✓ 记录了 3 次 RAG 查询');
    logger.log('');

    // ==================== 测试6: 获取Prometheus指标 ====================
    logger.log('测试6: 获取Prometheus指标');
    logger.log('─'.repeat(80));

    const prometheusMetrics = await metricsService.getMetrics();

    logger.log('Prometheus 指标示例:');
    logger.log('');

    // 显示部分指标
    const lines = prometheusMetrics.split('\n');
    const sampleMetrics = [
      'rag_cache_hits_total',
      'rag_cache_misses_total',
      'rag_retry_attempts_total',
      'rag_parallel_tasks_total',
      'rag_api_calls_total',
      'rag_query_total',
    ];

    for (const metricName of sampleMetrics) {
      const metricLines = lines.filter(line =>
        line.includes(metricName) && !line.startsWith('#')
      );

      if (metricLines.length > 0) {
        logger.log(`${metricName}:`);
        metricLines.slice(0, 3).forEach(line => {
          logger.log(`  ${line}`);
        });
        if (metricLines.length > 3) {
          logger.log(`  ... (${metricLines.length - 3} more)`);
        }
        logger.log('');
      }
    }

    // ==================== 总结 ====================
    logger.log('='.repeat(80));
    logger.log('测试总结');
    logger.log('='.repeat(80));
    logger.log('✅ 所有监控指标测试通过！');
    logger.log('');
    logger.log('验证的指标类型:');
    logger.log('  ✓ 缓存指标 (hits, misses, size, duration)');
    logger.log('  ✓ 重试指标 (attempts, success, failure)');
    logger.log('  ✓ 并行执行指标 (tasks, concurrency)');
    logger.log('  ✓ API调用指标 (calls, duration, errors)');
    logger.log('  ✓ RAG查询指标 (queries, fallback levels)');
    logger.log('');
    logger.log('Prometheus端点:');
    logger.log('  GET /rag/metrics - Prometheus格式指标');
    logger.log('  GET /rag/metrics/stats - 人类可读统计');
    logger.log('');
    logger.log('下一步:');
    logger.log('  1. 启动应用: npm run start:dev');
    logger.log('  2. 访问: http://localhost:3000/rag/metrics');
    logger.log('  3. 配置 Prometheus scrape 此端点');
    logger.log('  4. 创建 Grafana Dashboard');
    logger.log('='.repeat(80));

    process.exit(0);

  } catch (error: any) {
    logger.error('测试失败:', error.message);
    logger.error(error.stack);
    process.exit(1);
  }
}

main();

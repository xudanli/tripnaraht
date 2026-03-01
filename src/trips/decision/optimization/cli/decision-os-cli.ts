#!/usr/bin/env node
/**
 * Decision OS CLI 管理工具
 * 
 * 用法:
 *   npx ts-node src/trips/decision/optimization/cli/decision-os-cli.ts <command> [options]
 * 
 * 命令:
 *   status      查看系统状态
 *   health      健康检查
 *   metrics     查看指标
 *   snapshots   管理 DSO 快照
 *   circuit     管理熔断器
 *   learning    学习相关操作
 */

import { DecisionOSClient, createDecisionOSClient, SDKClientConfig } from '../sdk';

// ========== 配置 ==========

interface CLIConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  verbose?: boolean;
}

function getConfig(): CLIConfig {
  return {
    baseUrl: process.env.DECISION_OS_URL ?? 'http://localhost:3000',
    apiKey: process.env.DECISION_OS_API_KEY,
    timeout: parseInt(process.env.DECISION_OS_TIMEOUT ?? '30000', 10),
    verbose: process.env.DECISION_OS_VERBOSE === 'true',
  };
}

// ========== 输出工具 ==========

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message: string): void {
  console.log(message);
}

function info(message: string): void {
  console.log(`${colors.cyan}[INFO]${colors.reset} ${message}`);
}

function success(message: string): void {
  console.log(`${colors.green}[SUCCESS]${colors.reset} ${message}`);
}

function warn(message: string): void {
  console.log(`${colors.yellow}[WARN]${colors.reset} ${message}`);
}

function error(message: string): void {
  console.error(`${colors.red}[ERROR]${colors.reset} ${message}`);
}

function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function table(data: Array<Record<string, unknown>>): void {
  if (data.length === 0) {
    log('(empty)');
    return;
  }

  const headers = Object.keys(data[0]);
  const colWidths = headers.map(h => 
    Math.max(h.length, ...data.map(row => String(row[h]).length))
  );

  const separator = colWidths.map(w => '-'.repeat(w + 2)).join('+');
  
  log(separator);
  log('| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |');
  log(separator);
  
  data.forEach(row => {
    log('| ' + headers.map((h, i) => String(row[h]).padEnd(colWidths[i])).join(' | ') + ' |');
  });
  
  log(separator);
}

// ========== 命令实现 ==========

async function cmdStatus(client: DecisionOSClient): Promise<void> {
  info('获取系统状态...');

  try {
    const response = await client.getHealth();
    const health = response.data;

    if (!health) {
      error('无法获取健康状态');
      process.exit(1);
    }

    log('\n========== Decision OS 状态 ==========\n');

    const statusColor = health.status === 'healthy' ? colors.green : 
                        health.status === 'degraded' ? colors.yellow : colors.red;
    log(`状态: ${statusColor}${health.status.toUpperCase()}${colors.reset}`);
    log(`运行时间: ${Math.floor(health.uptime / 1000 / 60)} 分钟`);

    log('\n组件状态:');
    health.components.forEach(comp => {
      const icon = comp.status === 'healthy' ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
      log(`  ${icon} ${comp.name} (${comp.latencyMs.toFixed(0)}ms)`);
    });

  } catch (err) {
    error(`获取状态失败: ${(err as Error).message}`);
    process.exit(1);
  }
}

async function cmdHealth(client: DecisionOSClient): Promise<void> {
  info('执行健康检查...');

  try {
    const [alive, ready] = await Promise.all([
      client.isAlive(),
      client.isReady(),
    ]);

    log('\n========== 健康检查 ==========\n');

    log(`Liveness:  ${alive ? `${colors.green}✓ ALIVE${colors.reset}` : `${colors.red}✗ NOT ALIVE${colors.reset}`}`);
    log(`Readiness: ${ready ? `${colors.green}✓ READY${colors.reset}` : `${colors.red}✗ NOT READY${colors.reset}`}`);

    if (alive && ready) {
      success('\n系统健康');
    } else {
      error('\n系统不健康');
      process.exit(1);
    }

  } catch (err) {
    error(`健康检查失败: ${(err as Error).message}`);
    process.exit(1);
  }
}

async function cmdMetrics(client: DecisionOSClient, format: string): Promise<void> {
  info('获取指标...');

  try {
    if (format === 'prometheus') {
      const response = await client.getPrometheusMetrics();
      log(response.data ?? '');
    } else {
      const response = await client.getMetricsSummary();
      json(response.data);
    }
  } catch (err) {
    error(`获取指标失败: ${(err as Error).message}`);
    process.exit(1);
  }
}

async function cmdSnapshots(client: DecisionOSClient, action: string, args: string[]): Promise<void> {
  try {
    switch (action) {
      case 'list': {
        const requestId = args[0];
        info(`查询快照${requestId ? ` (requestId=${requestId})` : ''}...`);
        
        const response = await client.getSnapshots({
          requestId,
          limit: 20,
        });

        const snapshots = response.data ?? [];

        log('\n========== DSO 快照 ==========\n');

        if (snapshots.length === 0) {
          warn('没有找到快照');
          return;
        }

        table(snapshots.map((s: { requestId: string; version: number; snapshotId: string; createdAt: string; size: number }) => ({
          snapshotId: s.snapshotId.substring(0, 12) + '...',
          requestId: s.requestId.substring(0, 12) + '...',
          version: s.version,
          createdAt: new Date(s.createdAt).toLocaleString(),
          size: `${(s.size / 1024).toFixed(1)}KB`,
        })));
        break;
      }

      case 'stability': {
        info('分析稳定性...');
        
        const response = await client.getStabilityAnalysis();
        const analysis = response.data;

        if (!analysis) {
          error('无法获取稳定性分析');
          process.exit(1);
        }

        log('\n========== Lyapunov 稳定性分析 ==========\n');
        log(`系统稳定: ${analysis.isStable ? `${colors.green}是${colors.reset}` : `${colors.red}否${colors.reset}`}`);
        log(`Lyapunov 值: ${analysis.lyapunovValue.toFixed(4)}`);
        log(`收敛率: ${analysis.convergenceRate.toFixed(4)}`);

        if (analysis.recentTrend.length > 0) {
          log('\n趋势追踪:');
          analysis.recentTrend.forEach((t: { timestamp: string; value: number }, i: number) => {
            const bar = '█'.repeat(Math.round(t.value * 20));
            log(`  V${i + 1}: ${t.value.toFixed(4)} ${bar}`);
          });
        }
        break;
      }

      case 'diff': {
        const [snapshotId1, snapshotId2] = args;
        if (!snapshotId1 || !snapshotId2) {
          error('用法: snapshots diff <snapshotId1> <snapshotId2>');
          process.exit(1);
        }

        info(`计算差异: ${snapshotId1} → ${snapshotId2}...`);
        
        const response = await client.computeDiff(snapshotId1, snapshotId2);
        const diff = response.data;

        if (!diff) {
          error('无法获取差异');
          process.exit(1);
        }

        log('\n========== 版本差异 ==========\n');
        log(`变更统计: 新增 ${diff.summary.added}, 删除 ${diff.summary.removed}, 修改 ${diff.summary.modified}`);

        if (diff.changes.length > 0) {
          log('\n详细变更:');
          diff.changes.forEach((change: { path: string; operation: string; oldValue?: unknown; newValue?: unknown }) => {
            const opColor = change.operation === 'add' ? colors.green :
                           change.operation === 'remove' ? colors.red : colors.yellow;
            log(`  ${opColor}[${change.operation.toUpperCase()}]${colors.reset} ${change.path}`);
            if (change.oldValue !== undefined) {
              log(`    ${colors.red}- ${JSON.stringify(change.oldValue)}${colors.reset}`);
            }
            if (change.newValue !== undefined) {
              log(`    ${colors.green}+ ${JSON.stringify(change.newValue)}${colors.reset}`);
            }
          });
        }
        break;
      }

      case 'rollback': {
        const snapshotId = args[0];
        const reason = args.slice(1).join(' ') || '手动回滚';
        
        if (!snapshotId) {
          error('用法: snapshots rollback <snapshotId> [reason]');
          process.exit(1);
        }

        warn(`即将回滚到快照: ${snapshotId}`);
        warn(`原因: ${reason}`);
        
        info('执行回滚...');
        
        const response = await client.rollback(snapshotId, reason);
        const result = response.data;

        if (result?.success) {
          success(`回滚成功! 新版本: ${result.newVersion}`);
        } else {
          error('回滚失败');
          process.exit(1);
        }
        break;
      }

      default:
        error(`未知操作: ${action}`);
        log('可用操作: list, stability, diff, rollback');
        process.exit(1);
    }
  } catch (err) {
    error(`快照操作失败: ${(err as Error).message}`);
    process.exit(1);
  }
}

async function cmdDecision(client: DecisionOSClient, tripId: string, options: Record<string, unknown>): Promise<void> {
  info(`执行决策: tripId=${tripId}...`);

  try {
    const response = await client.makeDecision({
      tripId,
      userId: options.userId as string,
      dso: options as Record<string, unknown>,
    });

    const decision = response.data;

    if (!decision) {
      error('决策失败');
      process.exit(1);
    }

    log('\n========== 决策结果 ==========\n');
    log(`决策 ID: ${decision.decisionId}`);
    log(`状态: ${decision.status}`);
    log(`置信度: ${decision.confidence.toFixed(3)}`);
    log(`处理时间: ${decision.processingTime}ms`);

    if (decision.selectedPlan) {
      log('\n选定方案:');
      log(`  ID: ${decision.selectedPlan.id}`);
      log(`  效用: ${decision.selectedPlan.utility.toFixed(3)}`);
    }

    if (decision.explanation) {
      log('\n决策解释:');
      log(`  ${decision.explanation.summary}`);
    }

    if (decision.alternatives && decision.alternatives.length > 0) {
      log('\n备选方案:');
      decision.alternatives.forEach((alt: { id: string; utility: number; summary: string }, i: number) => {
        log(`  ${i + 1}. ${alt.summary} (效用: ${alt.utility.toFixed(3)})`);
      });
    }

  } catch (err) {
    error(`决策失败: ${(err as Error).message}`);
    process.exit(1);
  }
}

// ========== 主程序 ==========

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const config = getConfig();
  const sdkConfig: SDKClientConfig = {
    baseUrl: config.baseUrl,
    timeout: config.timeout,
    headers: config.apiKey ? { 'X-API-Key': config.apiKey } : undefined,
  };
  
  const client = createDecisionOSClient(sdkConfig);

  const command = args[0];
  const subArgs = args.slice(1);

  try {
    switch (command) {
      case 'status':
        await cmdStatus(client);
        break;

      case 'health':
        await cmdHealth(client);
        break;

      case 'metrics':
        await cmdMetrics(client, subArgs[0] || 'summary');
        break;

      case 'snapshots':
        await cmdSnapshots(client, subArgs[0] || 'list', subArgs.slice(1));
        break;

      case 'decision': {
        const tripId = subArgs[0];
        if (!tripId) {
          error('请提供 tripId');
          process.exit(1);
        }
        await cmdDecision(client, tripId, parseOptions(subArgs.slice(1)));
        break;
      }

      default:
        error(`未知命令: ${command}`);
        printHelp();
        process.exit(1);
    }
  } catch (err) {
    error(`执行失败: ${(err as Error).message}`);
    process.exit(1);
  }
}

function printHelp(): void {
  log(`
${colors.cyan}Decision OS CLI${colors.reset}

用法: decision-os-cli <command> [options]

命令:
  ${colors.green}status${colors.reset}                     查看系统状态
  ${colors.green}health${colors.reset}                     健康检查
  ${colors.green}metrics${colors.reset} [format]           查看指标 (summary|prometheus)
  ${colors.green}snapshots list${colors.reset} [requestId] 列出快照
  ${colors.green}snapshots stability${colors.reset}        分析系统稳定性
  ${colors.green}snapshots diff${colors.reset} <id1> <id2> 比较两个快照
  ${colors.green}snapshots rollback${colors.reset} <id>    回滚到指定快照
  ${colors.green}decision${colors.reset} <tripId>          执行决策

环境变量:
  DECISION_OS_URL        API 地址 (默认: http://localhost:3000)
  DECISION_OS_API_KEY    API 密钥
  DECISION_OS_TIMEOUT    超时时间 (默认: 30000ms)
  DECISION_OS_VERBOSE    详细输出 (true/false)

示例:
  decision-os-cli status
  decision-os-cli health
  decision-os-cli metrics prometheus
  decision-os-cli snapshots list req-123
  decision-os-cli decision trip-456 --userId=user-789
`);
}

function parseOptions(args: string[]): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      options[key] = value ?? true;
    }
  }
  
  return options;
}

main().catch((err) => {
  error(`Fatal error: ${err.message}`);
  process.exit(1);
});

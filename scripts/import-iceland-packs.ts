#!/usr/bin/env ts-node

/**
 * 导入冰岛的准备度 Pack 数据
 * 
 * 使用方法:
 *   npx ts-node scripts/import-iceland-packs.ts
 */

import axios, { AxiosInstance } from 'axios';
import { readFileSync } from 'fs';
import { join } from 'path';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function logSuccess(message: string) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function logError(message: string) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function logInfo(message: string) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

function logWarning(message: string) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 冰岛的 Pack 文件列表
const ICELAND_PACKS = [
  'pack.is.iceland.json',
  'pack.is.is.json',
];

async function checkPackExists(packId: string): Promise<boolean> {
  try {
    const response = await api.get(`/api/readiness/admin/packs/${packId}`);
    return response.data && response.data.success;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return false;
    }
    throw error;
  }
}

async function importPack(filePath: string): Promise<boolean> {
  try {
    logInfo(`读取文件: ${filePath}`);
    const content = readFileSync(filePath, 'utf-8');
    const pack = JSON.parse(content);

    if (!pack.packId) {
      logError(`文件 ${filePath} 缺少 packId 字段`);
      return false;
    }

    logInfo(`检查 Pack 是否已存在: ${pack.packId}`);
    const exists = await checkPackExists(pack.packId);

    if (exists) {
      logWarning(`Pack ${pack.packId} 已存在，跳过导入`);
      return false;
    }

    logInfo(`导入 Pack: ${pack.packId}`);
    const response = await api.post('/api/readiness/admin/packs', {
      pack: pack,
    });

    if (response.data && response.data.success) {
      logSuccess(`成功导入: ${pack.packId}`);
      console.log(`  目的地: ${pack.destinationId}`);
      console.log(`  版本: ${pack.version}`);
      console.log(`  显示名称: ${pack.displayName || pack.displayNameEN || pack.displayNameCN}`);
      return true;
    } else {
      logError(`导入失败: ${pack.packId}`);
      console.log(`  错误: ${JSON.stringify(response.data?.error)}`);
      return false;
    }
  } catch (error: any) {
    logError(`导入失败: ${error.message}`);
    if (error.response) {
      console.log(`  状态码: ${error.response.status}`);
      console.log(`  响应: ${JSON.stringify(error.response.data)}`);
    }
    return false;
  }
}

async function main() {
  console.log(`${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║       冰岛准备度 Pack 导入工具                                ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);

  logInfo(`API Base URL: ${API_BASE_URL}`);

  const packsDir = join(__dirname, '../src/trips/readiness/data/packs');
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (const fileName of ICELAND_PACKS) {
    const filePath = join(packsDir, fileName);
    
    console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.cyan}处理: ${fileName}${colors.reset}`);
    console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

    const result = await importPack(filePath);
    
    if (result) {
      successCount++;
    } else {
      // 检查是否是因为已存在而跳过
      try {
        const content = readFileSync(filePath, 'utf-8');
        const pack = JSON.parse(content);
        const exists = await checkPackExists(pack.packId);
        if (exists) {
          skipCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }
  }

  // 总结
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}导入总结${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);

  console.log(`成功导入: ${colors.green}${successCount}${colors.reset} 个`);
  console.log(`已存在（跳过）: ${colors.yellow}${skipCount}${colors.reset} 个`);
  console.log(`导入失败: ${colors.red}${failCount}${colors.reset} 个`);
  console.log(`总计: ${ICELAND_PACKS.length} 个\n`);

  if (successCount > 0) {
    logSuccess('导入完成！');
  } else if (skipCount === ICELAND_PACKS.length) {
    logWarning('所有 Pack 都已存在，无需导入');
  } else if (failCount > 0) {
    logError('部分 Pack 导入失败，请检查错误信息');
    process.exit(1);
  }
}

// 运行导入
if (require.main === module) {
  main().catch((error) => {
    console.error('未捕获的错误:', error);
    process.exit(1);
  });
}

export { main };

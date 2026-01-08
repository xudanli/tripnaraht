#!/usr/bin/env node
/**
 * 通过 MCP Server 生成 Skeleton Pack 并保存到文件
 * 
 * 这个脚本通过调用 MCP Skills Server 来生成 Pack，避免了直接使用 NestJS 上下文
 * 
 * 用法：
 *   npx tsx scripts/generate-and-save-skeleton-pack.ts <countryCode>
 * 
 * 示例：
 *   npx tsx scripts/generate-and-save-skeleton-pack.ts IS
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const COUNTRY_MAP: Record<string, { name: string; nameCN: string }> = {
  IS: { name: 'Iceland', nameCN: '冰岛' },
  NO: { name: 'Norway', nameCN: '挪威' },
  CN: { name: 'China', nameCN: '中国' },
};

async function generateAndSaveSkeletonPack(countryCode: string) {
  console.log(`\n📦 通过 MCP Server 生成 Skeleton Pack: ${countryCode}\n`);

  const countryInfo = COUNTRY_MAP[countryCode.toUpperCase()];
  if (!countryInfo) {
    console.error(`❌ 未知的国家代码: ${countryCode}`);
    console.error(`支持的国家：${Object.keys(COUNTRY_MAP).join(', ')}`);
    process.exit(1);
  }

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/mcp/mcp-skills-server.ts'],
    env: process.env as Record<string, string>,
  });

  const client = new Client(
    {
      name: 'skeleton-pack-generator',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    // 连接到服务器
    console.log('步骤 1: 连接到 MCP Skills Server...');
    await client.connect(transport);
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('✅ 已连接\n');

    // 生成 Skeleton Pack
    console.log(`步骤 2: 生成 ${countryInfo.nameCN} 的 Skeleton Pack...`);
    const skeletonResult = await client.callTool({
      name: 'tripnara.countryPack.newSkeleton',
      arguments: {
        countryCode: countryCode.toUpperCase(),
        countryName: countryInfo.name,
        countryNameCN: countryInfo.nameCN,
        packType: 'readiness',
      },
    });

    const resultData = JSON.parse((skeletonResult.content as Array<{ type: string; text: string }>)[0].text);
    const skeleton = resultData.skeleton;
    
    if (!skeleton) {
      throw new Error('生成失败：返回结果为空');
    }

    console.log(`✅ Skeleton Pack 生成成功`);
    console.log(`   Pack ID: ${skeleton.packId}`);
    console.log(`   规则数量: ${skeleton.rules?.length || 0}`);
    if (skeleton.rules) {
      console.log(`   规则类别: ${skeleton.rules.map((r: any) => r.category).join(', ')}`);
    }
    if (skeleton.checklists) {
      console.log(`   清单数量: ${skeleton.checklists.length}`);
    }
    console.log('');

    // 获取改进建议
    console.log('步骤 3: 获取改进建议...');
    const suggestResult = await client.callTool({
      name: 'tripnara.countryPack.suggestImprovements',
      arguments: {
        countryCode: countryCode.toUpperCase(),
        packType: 'readiness',
        currentPackSnapshot: skeleton,
      },
    });

    const suggestData = JSON.parse((suggestResult.content as Array<{ type: string; text: string }>)[0].text);
    
    console.log(`\n📊 改进建议:`);
    console.log(`   缺失字段: ${suggestData.missingFields?.length || 0}`);
    console.log(`   质量缺口: ${suggestData.qualityGaps?.length || 0}`);
    console.log(`   待办事项: ${suggestData.priorityTodo?.length || 0}`);
    
    if (suggestData.qualityGaps && suggestData.qualityGaps.length > 0) {
      console.log(`\n   质量缺口详情:`);
      suggestData.qualityGaps.forEach((gap: any, idx: number) => {
        console.log(`     ${idx + 1}. [${gap.category}] ${gap.issue}`);
        console.log(`        当前: ${gap.current}, 建议: ${gap.recommended} (影响: ${gap.impact})`);
      });
    }
    
    if (suggestData.priorityTodo && suggestData.priorityTodo.length > 0) {
      console.log(`\n   优先级待办:`);
      suggestData.priorityTodo.forEach((todo: any, idx: number) => {
        console.log(`     ${idx + 1}. [${todo.priority}] ${todo.task}`);
        console.log(`        工作量: ${todo.estimatedEffort}, 影响: ${todo.impact}`);
      });
    }
    console.log('');

    // 保存到文件
    const outputDir = join(__dirname, '../src/trips/readiness/data/packs');
    const fileName = `${skeleton.packId}.json`;
    const filePath = join(outputDir, fileName);

    console.log('步骤 4: 保存 Pack 到文件...');
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(skeleton, null, 2), 'utf-8');
    console.log(`✅ Pack 已保存到文件: ${filePath}\n`);

    // 断开连接
    await client.close();

    console.log('✅ 完成！');
    console.log(`\n📝 下一步：`);
    console.log(`   1. 查看生成的 Pack 文件: ${filePath}`);
    console.log(`   2. 如需导入数据库，运行:`);
    console.log(`      npx tsx scripts/check-and-import-readiness-packs.ts import ${filePath}`);
    console.log('');

  } catch (error: any) {
    console.error('\n❌ 生成失败:', error.message);
    if (error.stack) {
      console.error('堆栈:', error.stack);
    }
    try {
      await client.close();
    } catch (e) {
      // 忽略关闭错误
    }
    process.exit(1);
  }
}

// 主函数
async function main() {
  const countryCode = process.argv[2];

  if (!countryCode) {
    console.error('用法: npx tsx scripts/generate-and-save-skeleton-pack.ts <countryCode>');
    console.error('示例: npx tsx scripts/generate-and-save-skeleton-pack.ts IS');
    process.exit(1);
  }

  await generateAndSaveSkeletonPack(countryCode);
}

main().catch(console.error);


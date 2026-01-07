#!/usr/bin/env node

/**
 * 测试 MCP Skills Server
 * 
 * 这个脚本会启动 MCP Server 并测试所有注册的 Skills
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testMcpSkillsServer() {
  console.log('🚀 启动 MCP Skills Server 测试...\n');

  // 创建 MCP 客户端传输（会自动启动服务器进程）
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/mcp/mcp-skills-server.ts'],
    env: process.env as Record<string, string>,
  });
  
  // 监听服务器进程的错误输出（stderr）
  // 注意：StdioClientTransport 会自动处理，但我们可以添加超时来诊断问题

  const client = new Client(
    {
      name: 'test-client',
      version: '1.0.0',
    },
    {
      capabilities: {},
    }
  );

  try {
    // 连接到服务器（这会自动启动服务器进程）
    console.log('正在连接到 MCP Skills Server...');
    console.log('等待服务器初始化（最多 10 秒）...');
    
    // 添加超时来诊断问题
    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('连接超时：服务器可能在启动过程中崩溃')), 10000);
    });
    
    await Promise.race([connectPromise, timeoutPromise]);
    console.log('✅ 已连接到 MCP Skills Server\n');
    
    // 等待一下，确保服务器完全初始化
    await new Promise(resolve => setTimeout(resolve, 500));

    // 测试 1: 列出所有 Skills
    console.log('📋 测试 1: 列出所有可用的 Skills...');
    const listResult = await client.callTool({
      name: 'tripnara.listSkills',
      arguments: {},
    });
    const skillsData = JSON.parse((listResult.content as Array<{ type: string; text: string }>)[0].text);
    console.log(`✅ 找到 ${skillsData.skills.length} 个 Skills:`);
    skillsData.skills.forEach((skill: any, index: number) => {
      console.log(`   ${index + 1}. ${skill.name} (${skill.category})`);
      console.log(`      描述: ${skill.description}`);
    });
    console.log('');

    // 测试 2: 测试 DEM Skill
    console.log('🧪 测试 2: 测试 skill.dem.getProfile...');
    try {
      const demResult = await client.callTool({
        name: 'tripnara.dem.getProfile',
        arguments: {
          polyline: [
            { lat: 64.1283, lng: -21.8278 }, // 雷克雅未克
            { lat: 64.1466, lng: -21.9426 }, // 附近点
          ],
          samples: 10,
        },
      });
      console.log('✅ DEM Skill 调用成功');
      console.log('   结果:', (demResult.content as Array<{ type: string; text: string }>)[0].text.substring(0, 200) + '...');
    } catch (error: any) {
      console.log('⚠️  DEM Skill 调用失败:', error.message);
    }
    console.log('');

    // 测试 3: 测试 CountryPack Skill
    console.log('🧪 测试 3: 测试 skill.countryPack.newSkeleton...');
    try {
      const skeletonResult = await client.callTool({
        name: 'tripnara.countryPack.newSkeleton',
        arguments: {
          countryCode: 'IS',
          countryName: 'Iceland',
          countryNameCN: '冰岛',
          packType: 'readiness',
        },
      });
      console.log('✅ CountryPack Skill 调用成功');
      const skeletonData = JSON.parse((skeletonResult.content as Array<{ type: string; text: string }>)[0].text);
      console.log(`   生成的 Pack ID: ${skeletonData.skeleton.packId}`);
      console.log(`   国家代码: ${skeletonData.skeleton.geo.countryCode}`);
    } catch (error: any) {
      console.log('⚠️  CountryPack Skill 调用失败:', error.message);
    }
    console.log('');

    // 测试 4: 测试 RouteDirection Skill
    console.log('🧪 测试 4: 测试 skill.routeDirection.pickForIntent...');
    try {
      const routeResult = await client.callTool({
        name: 'tripnara.routeDirection.pickForIntent',
        arguments: {
          countryCode: 'IS',
          season: 7, // 7月
          userIntentTags: ['hiking', 'scenic'],
        },
      });
      console.log('✅ RouteDirection Skill 调用成功');
      const routeData = JSON.parse((routeResult.content as Array<{ type: string; text: string }>)[0].text);
      console.log(`   推荐的 RouteDirection ID: ${routeData.routeDirectionId || 'N/A'}`);
    } catch (error: any) {
      console.log('⚠️  RouteDirection Skill 调用失败:', error.message);
    }
    console.log('');

    // 列出所有可用工具
    console.log('🔧 获取所有可用工具...');
    const toolsResult = await client.listTools();
    console.log(`✅ 找到 ${toolsResult.tools.length} 个工具:`);
    toolsResult.tools.forEach((tool, index) => {
      console.log(`   ${index + 1}. ${tool.name}`);
    });
    console.log('');

    console.log('✅ 测试完成！');
  } catch (error: any) {
    console.error('❌ 测试失败:', error);
    if (error.message) {
      console.error('错误消息:', error.message);
    }
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
    console.error('\n💡 提示: 服务器可能在启动过程中遇到错误。');
    console.error('   请检查服务器的 stderr 输出，或直接运行服务器查看错误：');
    console.error('   npx tsx src/mcp/mcp-skills-server.ts');
  } finally {
    // 断开连接（会自动关闭服务器进程）
    try {
      await client.close();
      console.log('🔌 已断开连接');
    } catch (closeError) {
      console.error('关闭连接时出错:', closeError);
    }
  }
}

// 运行测试
testMcpSkillsServer().catch(console.error);


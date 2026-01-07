#!/usr/bin/env node

/**
 * TripNARA MCP Skills Server
 * 
 * Model Context Protocol server exposing TripNARA Skills as MCP tools.
 * 
 * 架构：
 * - Skills = 能力颗粒（最小可复用能力）
 * - MCP = 能力的"插座标准"
 * - Agent = 会用这些能力的人
 */

// ✅ 必须放在文件最最最顶端，在任何 import NestFactory 之前
import * as dotenv from 'dotenv';
import * as path from 'path';

// 显式指向根目录的 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { NestFactory } from '@nestjs/core';
import { McpAppModule } from './mcp-app.module';
import { SkillsRegistryService } from '../skills/services/skills-registry.service';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getSchemaForSkill } from './mcp-schema-builders';

// Helper function to format tool response
function formatResponse(data: any): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

async function createMcpServer() {
  // 创建 NestJS 应用上下文（用于获取 Skills）
  // 使用专门的 McpAppModule，只包含必要的模块
  console.error('Creating NestJS application context...');
  let app;
  let skillsRegistry;
  
  try {
    console.error('Calling NestFactory.createApplicationContext...');
    app = await NestFactory.createApplicationContext(McpAppModule, {
      logger: ['error', 'warn', 'log'], // 只记录重要日志
    });
    console.error('NestJS application context created');
    
    console.error('Getting SkillsRegistryService...');
    try {
      skillsRegistry = app.get(SkillsRegistryService, { strict: false });
      console.error('Got SkillsRegistryService');
      if (!skillsRegistry) {
        throw new Error('SkillsRegistryService is null or undefined');
      }
    } catch (error: any) {
      console.error('Error getting SkillsRegistryService:', error);
      console.error('Error message:', error.message);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
      throw error;
    }
  } catch (error: any) {
    console.error('Error creating application context:', error);
    if (error.message) {
      console.error('Error message:', error.message);
    }
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw error;
  }

  // 创建 MCP Server
  console.error('Creating MCP Server instance...');
  const server = new McpServer(
    {
      name: 'tripnara-route-intel',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  );
  console.error('MCP Server instance created');

  // 注册所有 Skills 为 MCP 工具
  console.error('Calling getAllSkills()...');
  const allSkills = skillsRegistry.getAllSkills();
  console.error(`Found ${allSkills.length} skills`);
  console.error(`Registering ${allSkills.length} skills as MCP tools...`);
  
  try {
    for (const skill of allSkills) {
      const toolName = `tripnara.${skill.metadata.name}`;
      
      try {
        server.registerTool(
          toolName,
          {
            description: skill.metadata.description,
            inputSchema: getSchemaForSkill(skill.metadata.name),
          },
          async (args: any) => {
            try {
              const result = await skill.execute(args);
              return formatResponse(result);
            } catch (error: any) {
              return formatResponse({
                error: error.message || 'Unknown error',
                stack: error.stack,
              });
            }
          }
        );
        console.error(`  ✓ Registered tool: ${toolName}`);
      } catch (error: any) {
        console.error(`  ✗ Failed to register tool ${toolName}:`, error.message);
        throw error;
      }
    }
  } catch (error: any) {
    console.error('Error registering tools:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw error;
  }

  // 注册工具列表查询工具
  console.error('Registering tripnara.listSkills tool...');
  try {
    server.registerTool(
      'tripnara.listSkills',
      {
        description: '列出所有可用的 TripNARA Skills',
      },
      async () => {
        const metadata = skillsRegistry.getAllSkillMetadata();
        return formatResponse({
          skills: metadata.map(m => ({
            name: `tripnara.${m.name}`,
            description: m.description,
            category: m.category,
            version: m.version,
          })),
        });
      }
    );
    console.error('Registered tripnara.listSkills tool');
  } catch (error: any) {
    console.error('Error registering tripnara.listSkills:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw error;
  }
  
  console.error(`Registered ${allSkills.length + 1} tools successfully (${allSkills.length} skills + 1 list tool)`);

  return { server, app, allSkills };
}

// Main function to start the server
async function main() {
  try {
    console.error('Initializing MCP Skills Server...');
    console.error('Calling createMcpServer...');
    let server, app, allSkills;
    try {
      const result = await createMcpServer();
      server = result.server;
      app = result.app;
      allSkills = result.allSkills;
      console.error(`Created server with ${allSkills.length} skills`);
    } catch (error: any) {
      console.error('Error in createMcpServer:', error);
      if (error.message) {
        console.error('Error message:', error.message);
      }
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
      throw error;
    }
    
    // Start MCP server
    console.error('Connecting to stdio transport...');
    try {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      
      // Log to stderr (stdout is used for JSON-RPC communication)
      console.error('TripNARA MCP Skills Server started and ready');
      console.error(`Registered ${allSkills.length} tools`);
    } catch (error: any) {
      console.error('Error connecting to stdio transport:', error);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
      throw error;
    }
    
    // Keep the process alive - server.connect() should handle this, but just in case
    // The server will keep running and listening for JSON-RPC messages on stdin
  } catch (error: any) {
    console.error('Failed to start MCP server:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('\nShutting down MCP server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\nShutting down MCP server...');
  process.exit(0);
});

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  if (error.stack) {
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the server
main().catch(async (error) => {
  console.error('Failed to start MCP server:', error);
  if (error.message) {
    console.error('Error message:', error.message);
  }
  if (error.stack) {
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
});


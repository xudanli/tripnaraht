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
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 显式指向根目录的 .env 文件
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 强制开启 MCP 模式相关开关（必须在 createApplicationContext 之前设置）
// 说明：仅靠 argv 识别在 `npx tsx ...` 场景下不稳定
process.env.MCP_MODE ??= 'true';
process.env.DISABLE_REDIS ??= 'true';
process.env.ALLOW_NO_DATABASE ??= 'true';

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
  // Dynamic imports: ensure MCP env flags above are applied before Nest loads modules
  const [{ NestFactory }, { McpAppModule }, { SKILLS_REGISTRY_TOKEN }, { McpServer }, { getSchemaForSkill }] =
    await Promise.all([
      import('@nestjs/core'),
      import('./mcp-app.module'),
      import('../skills/services/skills-registry.token'),
      import('@modelcontextprotocol/sdk/server/mcp.js'),
      import('./mcp-schema-builders'),
    ]);

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
    console.error('NestJS application context created successfully');
    
    console.error('Getting SkillsRegistryService...');
    try {
      skillsRegistry = app.get(SKILLS_REGISTRY_TOKEN, { strict: false });
      if (!skillsRegistry) {
        throw new Error('SkillsRegistryService is null or undefined');
      }
      console.error('Got SkillsRegistryService successfully');
    } catch (getError: any) {
      console.error('Error getting SkillsRegistryService:', getError);
      console.error('Error message:', getError.message);
      if (getError.stack) {
        console.error('Stack trace:', getError.stack);
      }
      throw getError;
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
  
  console.error(`Registered ${allSkills.length} tools successfully`);

  // 注册 Prompts（可选）
  try {
    const { ALL_MCP_PROMPTS } = await import('./mcp-prompts');
    console.error(`Registering ${ALL_MCP_PROMPTS.length} prompts...`);
    
    for (const prompt of ALL_MCP_PROMPTS) {
      try {
        server.registerPrompt(
          prompt.name,
          {
            description: prompt.description,
            arguments: prompt.arguments || [],
          },
          async () => {
            return {
              messages: prompt.messages,
            };
          }
        );
        console.error(`  ✓ Registered prompt: ${prompt.name}`);
      } catch (error: any) {
        console.error(`  ✗ Failed to register prompt ${prompt.name}:`, error.message);
      }
    }
  } catch (error: any) {
    // Prompts 是可选的，如果导入失败也不影响使用
    console.error('Note: Prompts not available (optional feature)');
  }

  return { server, app, allSkills };
}

// Main function to start the server
async function main() {
  try {
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    console.error('Initializing MCP Skills Server...');
    console.error('Calling createMcpServer...');
    const { server, app, allSkills } = await createMcpServer();
    console.error(`Created server with ${allSkills.length} skills`);
    
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
  if (error.message) {
    console.error('Error message:', error.message);
  }
  if (error.stack) {
    console.error('Stack trace:', error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  if (reason instanceof Error) {
    console.error('Error message:', reason.message);
    if (reason.stack) {
      console.error('Stack trace:', reason.stack);
    }
  }
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


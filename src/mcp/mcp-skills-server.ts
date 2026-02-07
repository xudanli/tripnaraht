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
// 确保 ContextEngineModule 默认启用（与 McpAppModule 保持一致）
process.env.ENABLE_CONTEXT_ENGINE_MODULE ??= 'true';

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
    try {
      // 添加超时保护，避免无限等待
      // 使用更详细的日志级别，以便看到 onModuleInit 的日志
      const createPromise = NestFactory.createApplicationContext(McpAppModule, {
        logger: ['error', 'warn', 'log', 'debug', 'verbose'], // 包含更多日志以调试 onModuleInit
      });
      
      // 添加进度日志
      const progressInterval = setInterval(() => {
        console.error('⏳ [MCP] 仍在等待应用上下文创建...');
      }, 5000); // 每 5 秒输出一次进度
      
      // 增加超时时间到 60 秒，以便有足够时间看到日志
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => {
          clearInterval(progressInterval);
          reject(new Error('createApplicationContext timeout after 60s'));
        }, 60000)
      );
      
      console.error('Waiting for createApplicationContext to complete...');
      try {
        app = await Promise.race([createPromise, timeoutPromise]);
        clearInterval(progressInterval);
      } catch (error) {
        clearInterval(progressInterval);
        throw error;
      }
      console.error('NestJS application context created successfully');
    } catch (ctxError: any) {
      console.error('Error in createApplicationContext:', ctxError.message);
      if (ctxError.stack) {
        console.error('Stack:', ctxError.stack);
      }
      throw ctxError;
    }
    
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

  // 注册 PostgreSQL MCP 工具
  let postgresqlMcpService: any = null;
  try {
    const { PostgreSQLMcpService } = await import('./postgresql-mcp.service');
    postgresqlMcpService = app.get(PostgreSQLMcpService, { strict: false });
    
    if (postgresqlMcpService && postgresqlMcpService.isAvailable()) {
      console.error('PostgreSQL MCP service available, registering tools...');

      // 注册 postgresql.query 工具
      server.registerTool(
        'postgresql.query',
        {
          description: '执行 SQL 查询（SELECT）。用于数据分析、统计查询等只读操作。返回查询结果。',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'SQL 查询语句（SELECT）',
              },
              params: {
                type: 'array',
                description: '查询参数（可选）',
                items: {
                  type: ['string', 'number', 'boolean', 'null'],
                },
              },
            },
            required: ['query'],
          },
        },
        async (args: any) => {
          try {
            const result = await postgresqlMcpService.query(args.query, args.params);
            return formatResponse(result);
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: postgresql.query');

      // 注册 postgresql.execute 工具
      server.registerTool(
        'postgresql.execute',
        {
          description: '执行 SQL 命令（INSERT, UPDATE, DELETE）。用于数据修改操作。返回执行结果。',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'SQL 命令语句（INSERT, UPDATE, DELETE）',
              },
              params: {
                type: 'array',
                description: '命令参数（可选）',
                items: {
                  type: ['string', 'number', 'boolean', 'null'],
                },
              },
            },
            required: ['query'],
          },
        },
        async (args: any) => {
          try {
            const result = await postgresqlMcpService.execute(args.query, args.params);
            return formatResponse(result);
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: postgresql.execute');
    } else {
      console.error('⚠️  PostgreSQL MCP service not available, skipping tool registration');
    }
  } catch (error: any) {
    // PostgreSQL MCP 工具是可选的，如果连接失败也不影响其他功能
    console.error('⚠️  Failed to register PostgreSQL MCP tools:', error.message);
    console.error('Note: PostgreSQL MCP tools will not be available');
  }

  // 注册 Airbnb MCP 工具
  let airbnbClient: any = null;
  try {
    const { getAirbnbClient } = await import('./airbnb-client');
    airbnbClient = getAirbnbClient();
    
    console.error('Connecting to Airbnb MCP server...');
    await airbnbClient.connect();
    console.error('✅ Airbnb MCP client connected');

    // 注册 airbnb_search 工具
    server.registerTool(
      'airbnb.search',
      {
        description: '搜索 Airbnb 房源。支持位置、日期、客人数量、价格范围等过滤条件。',
        inputSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: '搜索位置，例如 "San Francisco, CA"',
            },
            placeId: {
              type: 'string',
              description: 'Google Maps Place ID（如果提供，会覆盖 location）',
            },
            checkin: {
              type: 'string',
              description: '入住日期，格式 YYYY-MM-DD',
            },
            checkout: {
              type: 'string',
              description: '退房日期，格式 YYYY-MM-DD',
            },
            adults: {
              type: 'number',
              description: '成人数（默认: 1）',
            },
            children: {
              type: 'number',
              description: '儿童数（默认: 0）',
            },
            infants: {
              type: 'number',
              description: '婴儿数（默认: 0）',
            },
            pets: {
              type: 'number',
              description: '宠物数（默认: 0）',
            },
            minPrice: {
              type: 'number',
              description: '最低价格（每晚）',
            },
            maxPrice: {
              type: 'number',
              description: '最高价格（每晚）',
            },
            cursor: {
              type: 'string',
              description: '分页游标，用于浏览更多结果',
            },
            ignoreRobotsText: {
              type: 'boolean',
              description: '是否忽略 robots.txt（默认: false）',
            },
          },
          required: ['location'],
        },
      },
      async (args: any) => {
        try {
          const result = await airbnbClient.searchListings(args);
          return formatResponse(result);
        } catch (error: any) {
          return formatResponse({
            error: error.message || 'Unknown error',
            stack: error.stack,
          });
        }
      }
    );
    console.error('  ✓ Registered tool: airbnb.search');

    // 注册 airbnb_listing_details 工具
    server.registerTool(
      'airbnb.listingDetails',
      {
        description: '获取特定 Airbnb 房源的详细信息，包括设施、规则、位置等。',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Airbnb 房源 ID',
            },
            checkin: {
              type: 'string',
              description: '入住日期，格式 YYYY-MM-DD',
            },
            checkout: {
              type: 'string',
              description: '退房日期，格式 YYYY-MM-DD',
            },
            adults: {
              type: 'number',
              description: '成人数（默认: 1）',
            },
            children: {
              type: 'number',
              description: '儿童数（默认: 0）',
            },
            infants: {
              type: 'number',
              description: '婴儿数（默认: 0）',
            },
            pets: {
              type: 'number',
              description: '宠物数（默认: 0）',
            },
            ignoreRobotsText: {
              type: 'boolean',
              description: '是否忽略 robots.txt（默认: false）',
            },
          },
          required: ['id'],
        },
      },
      async (args: any) => {
        try {
          const result = await airbnbClient.getListingDetails(args);
          return formatResponse(result);
        } catch (error: any) {
          return formatResponse({
            error: error.message || 'Unknown error',
            stack: error.stack,
          });
        }
      }
    );
    console.error('  ✓ Registered tool: airbnb.listingDetails');
  } catch (error: any) {
    // Airbnb 工具是可选的，如果连接失败也不影响其他功能
    console.error('⚠️  Failed to register Airbnb tools:', error.message);
    console.error('Note: Airbnb tools will not be available');
  }

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

  // 注册 Google Maps Direct API 工具（直接使用 Google Maps API，不依赖 Smithery）
  let googleMapsDirectService: any = null;
  try {
    const { GoogleMapsDirectService } = await import('./google-maps-direct.service');
    googleMapsDirectService = app.get(GoogleMapsDirectService, { strict: false });
    
    if (googleMapsDirectService && googleMapsDirectService.isServiceAvailable()) {
      console.error('Google Maps Direct API service available, registering tools...');

    // 注册 google_maps.getRoute 工具（直接使用 Google Maps API）
    server.registerTool(
      'google_maps.getRoute',
      {
        description: '计算两个地点之间的路线。支持多种交通方式（驾车、步行、骑行、公交）和路线偏好。',
        inputSchema: {
          type: 'object',
          properties: {
            origin: {
              type: 'string',
              description: '起点地址或地点名称',
            },
            destination: {
              type: 'string',
              description: '终点地址或地点名称',
            },
            mode: {
              type: 'string',
              description: '交通方式：driving, walking, bicycling, transit',
              enum: ['driving', 'walking', 'bicycling', 'transit'],
            },
            waypoints: {
              type: 'array',
              description: '途经点列表（可选）',
              items: {
                type: 'string',
              },
            },
            avoid: {
              type: 'array',
              description: '避开选项：tolls, highways, ferries',
              items: {
                type: 'string',
                enum: ['tolls', 'highways', 'ferries'],
              },
            },
            alternatives: {
              type: 'boolean',
              description: '是否计算替代路线',
            },
            language: {
              type: 'string',
              description: '语言代码，例如 en, zh-CN',
            },
            units: {
              type: 'string',
              description: '单位系统：metric（公里）或 imperial（英里）',
              enum: ['metric', 'imperial'],
            },
          },
          required: ['origin', 'destination'],
        },
      },
      async (args: any) => {
        try {
          const result = await googleMapsDirectService.getRoute({
            origin: args.origin,
            destination: args.destination,
            mode: args.mode,
            waypoints: args.waypoints,
            avoid: args.avoid,
            alternatives: args.alternatives,
            language: args.language,
            units: args.units,
          });
          return formatResponse(result);
        } catch (error: any) {
          return formatResponse({
            error: error.message || 'Unknown error',
            stack: error.stack,
          });
        }
      }
    );
    console.error('  ✓ Registered tool: google_maps.getRoute');

    // 注册 google_maps.computeDistanceMatrix 工具（直接使用 Google Maps API）
    server.registerTool(
      'google_maps.computeDistanceMatrix',
      {
        description: '计算多个起点和终点之间的距离矩阵（距离和时间）。用于批量计算多个地点间的路线。',
        inputSchema: {
          type: 'object',
          properties: {
            origins: {
              type: 'array',
              description: '起点列表，每个可以是地址或经纬度坐标',
              items: {
                type: 'string',
              },
            },
            destinations: {
              type: 'array',
              description: '终点列表，每个可以是地址或经纬度坐标',
              items: {
                type: 'string',
              },
            },
            mode: {
              type: 'string',
              description: '交通方式：driving, walking, bicycling, transit',
              enum: ['driving', 'walking', 'bicycling', 'transit'],
            },
            units: {
              type: 'string',
              description: '单位系统：metric（公里）或 imperial（英里）',
              enum: ['metric', 'imperial'],
            },
            language: {
              type: 'string',
              description: '语言代码，例如 en, zh-CN',
            },
            avoid: {
              type: 'array',
              description: '避开选项：tolls, highways, ferries',
              items: {
                type: 'string',
                enum: ['tolls', 'highways', 'ferries'],
              },
            },
          },
          required: ['origins', 'destinations'],
        },
      },
      async (args: any) => {
        try {
          const result = await googleMapsDirectService.computeDistanceMatrix({
            origins: args.origins,
            destinations: args.destinations,
            mode: args.mode,
            units: args.units,
            language: args.language,
            avoid: args.avoid,
          });
          return formatResponse(result);
        } catch (error: any) {
          return formatResponse({
            error: error.message || 'Unknown error',
            stack: error.stack,
          });
        }
      }
    );
    console.error('  ✓ Registered tool: google_maps.computeDistanceMatrix');

    // 注册 google_maps.geocode 工具
    server.registerTool(
      'google_maps.geocode',
      {
        description: '地理编码：将地址转换为坐标，或将坐标转换为地址（反向地理编码）。',
        inputSchema: {
          type: 'object',
          properties: {
            address: {
              type: 'string',
              description: '要编码的地址（地址转坐标）',
            },
            latlng: {
              type: 'object',
              description: '要反向编码的坐标（坐标转地址）',
              properties: {
                lat: { type: 'number' },
                lng: { type: 'number' },
              },
            },
            language: {
              type: 'string',
              description: '语言代码，例如 en, zh-CN',
            },
            region: {
              type: 'string',
              description: '区域代码，例如 us, cn',
            },
          },
        },
      },
      async (args: any) => {
        try {
          const result = await googleMapsDirectService.geocode({
            address: args.address,
            latlng: args.latlng,
            language: args.language,
            region: args.region,
          });
          return formatResponse(result);
        } catch (error: any) {
          return formatResponse({
            error: error.message || 'Unknown error',
            stack: error.stack,
          });
        }
      }
    );
    console.error('  ✓ Registered tool: google_maps.geocode');

    // 注册 google_maps.searchPlaces 工具
    server.registerTool(
      'google_maps.searchPlaces',
      {
        description: '搜索地点。根据查询文本搜索地点，支持位置偏好和类型过滤。',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '搜索查询文本',
            },
            location: {
              type: 'object',
              description: '位置偏好（经纬度）',
              properties: {
                lat: { type: 'number' },
                lng: { type: 'number' },
              },
            },
            radius: {
              type: 'number',
              description: '搜索半径（米）',
            },
            language: {
              type: 'string',
              description: '语言代码',
            },
            type: {
              type: 'string',
              description: '地点类型（如 restaurant, hotel, tourist_attraction）',
            },
          },
          required: ['query'],
        },
      },
      async (args: any) => {
        try {
          const result = await googleMapsDirectService.searchPlaces({
            query: args.query,
            location: args.location,
            radius: args.radius,
            language: args.language,
            type: args.type,
          });
          return formatResponse(result);
        } catch (error: any) {
          return formatResponse({
            error: error.message || 'Unknown error',
            stack: error.stack,
          });
        }
      }
    );
    console.error('  ✓ Registered tool: google_maps.searchPlaces');
    } else {
      console.error('⚠️  Google Maps Direct API service not available (API Key not configured)');
    }
  } catch (error: any) {
    // Google Maps 工具是可选的，如果连接失败也不影响其他功能
    console.error('⚠️  Failed to register Google Maps Direct API tools:', error.message);
    console.error('Note: Google Maps tools will not be available');
  }

  // 注册 Weather Direct API 工具（直接使用 Open-Meteo API，无需 Python）
  let weatherDirectService: any = null;
  try {
    const { WeatherDirectService } = await import('./weather-direct.service');
    weatherDirectService = app.get(WeatherDirectService, { strict: false });

    if (weatherDirectService && weatherDirectService.isServiceAvailable()) {
      console.error('Weather Direct API service available, registering tools...');

      // 注册 weather.getCurrentWeather 工具
      server.registerTool(
        'weather.getCurrentWeather',
        {
          description: '获取指定城市的当前天气信息，包括温度、天气描述等。使用 Open-Meteo API，无需 API Key。',
          inputSchema: {
            type: 'object',
            properties: {
              city: {
                type: 'string',
                description: '城市名称，例如 "New York", "Beijing", "Tokyo"',
              },
            },
            required: ['city'],
          },
        },
        async (args: any) => {
          try {
            const result = await weatherDirectService.getCurrentWeather(args.city);
            return formatResponse(result);
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: weather.getCurrentWeather');

      // 注册 weather.getWeatherByDatetimeRange 工具
      server.registerTool(
        'weather.getWeatherByDatetimeRange',
        {
          description: '获取指定城市在日期范围内的天气数据。用于获取多日天气预报。',
          inputSchema: {
            type: 'object',
            properties: {
              city: {
                type: 'string',
                description: '城市名称',
              },
              start_date: {
                type: 'string',
                description: '开始日期，格式 YYYY-MM-DD',
              },
              end_date: {
                type: 'string',
                description: '结束日期，格式 YYYY-MM-DD',
              },
            },
            required: ['city', 'start_date', 'end_date'],
          },
        },
        async (args: any) => {
          try {
            const result = await weatherDirectService.getWeatherByDatetimeRange(
              args.city,
              args.start_date,
              args.end_date,
            );
            return formatResponse(result);
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: weather.getWeatherByDatetimeRange');

      // 注册 weather.getCurrentDateTime 工具
      server.registerTool(
        'weather.getCurrentDateTime',
        {
          description: '获取指定时区的当前日期时间。',
          inputSchema: {
            type: 'object',
            properties: {
              timezone: {
                type: 'string',
                description: '时区，例如 "America/New_York", "Asia/Shanghai", "Europe/London"',
              },
            },
          },
        },
        async (args: any) => {
          try {
            const result = await weatherDirectService.getCurrentDateTime(args.timezone);
            return formatResponse(result);
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: weather.getCurrentDateTime');
    } else {
      console.error('⚠️  Weather Direct API service not available');
    }
  } catch (error: any) {
    // Weather 工具是可选的，如果连接失败也不影响其他功能
    console.error('⚠️  Failed to register Weather Direct API tools:', error.message);
    console.error('Note: Weather tools will not be available');
  }

  // 注册 Rail MCP 工具（可选，需要 OAuth 认证）
  let railClient: any = null;
  
  // 可以通过环境变量禁用 Rail MCP（如果不需要或不想认证）
  const enableRailMcp = process.env.ENABLE_RAIL_MCP !== 'false';
  
  if (enableRailMcp) {
    try {
      const { getRailClient } = await import('./rail-client');
      railClient = getRailClient();
      
      console.error('Connecting to Rail MCP server...');
      await railClient.connect();
      console.error('✅ Rail MCP client connected');

    // 先获取可用工具列表
    const tools = await railClient.listTools();
    const toolList = tools.tools || [];
    
    console.error(`Found ${toolList.length} Rail tools`);

    // 动态注册所有 Rail 工具
    for (const tool of toolList) {
      try {
        server.registerTool(
          `rail.${tool.name}`,
          {
            description: tool.description || `Rail tool: ${tool.name}`,
            inputSchema: tool.inputSchema || {
              type: 'object',
              properties: {},
            },
          },
          async (args: any) => {
            try {
              const result = await railClient.callTool(tool.name, args);
              return formatResponse(result);
            } catch (error: any) {
              return formatResponse({
                error: error.message || 'Unknown error',
                stack: error.stack,
              });
            }
          }
        );
        console.error(`  ✓ Registered tool: rail.${tool.name}`);
      } catch (error: any) {
        console.error(`  ⚠️  Failed to register tool rail.${tool.name}:`, error.message);
      }
    }
  } catch (error: any) {
    // Rail 工具是可选的，如果连接失败也不影响其他功能
      console.error('⚠️  Failed to register Rail MCP tools:', error.message);
      console.error('Note: Rail tools will not be available');
      console.error('💡 提示: 如果不需要 Rail 功能，可以设置 ENABLE_RAIL_MCP=false 禁用');
    }
  } else {
    console.error('ℹ️  Rail MCP 已禁用 (ENABLE_RAIL_MCP=false)');
  }

  // 注册 File Extractor MCP 工具
  let fileExtractorClient: any = null;
  try {
    const { getFileExtractorClient } = await import('./file-extractor-client');
    fileExtractorClient = getFileExtractorClient();
    
    console.error('Connecting to File Extractor MCP server...');
    await fileExtractorClient.connect();
    console.error('✅ File Extractor MCP client connected');

    // 先获取可用工具列表
    const tools = await fileExtractorClient.listTools();
    const toolList = tools.tools || [];
    
    console.error(`Found ${toolList.length} File Extractor tools`);

    // 动态注册所有 File Extractor 工具
    for (const tool of toolList) {
      try {
        server.registerTool(
          `file_extractor.${tool.name}`,
          {
            description: tool.description || `File Extractor tool: ${tool.name}`,
            inputSchema: tool.inputSchema || {
              type: 'object',
              properties: {},
            },
          },
          async (args: any) => {
            try {
              const result = await fileExtractorClient.callTool(tool.name, args);
              return formatResponse(result);
            } catch (error: any) {
              return formatResponse({
                error: error.message || 'Unknown error',
                stack: error.stack,
              });
            }
          }
        );
        console.error(`  ✓ Registered tool: file_extractor.${tool.name}`);
      } catch (error: any) {
        console.error(`  ⚠️  Failed to register tool file_extractor.${tool.name}:`, error.message);
      }
    }
  } catch (error: any) {
    // File Extractor 工具是可选的，如果连接失败也不影响其他功能
    console.error('⚠️  Failed to register File Extractor MCP tools:', error.message);
    console.error('Note: File Extractor tools will not be available');
  }

  // 注册 Stripe Direct API 工具（直接使用 Stripe API，用户级别认证存储在数据库）
  let stripeDirectService: any = null;
  try {
    const { StripeDirectService } = await import('./stripe-direct.service');
    stripeDirectService = app.get(StripeDirectService, { strict: false });
    
    if (stripeDirectService && stripeDirectService.isServiceAvailable()) {
      console.error('Stripe Direct API service available, registering tools...');

      // 注册 stripe.createPaymentIntent 工具
      server.registerTool(
        'stripe.createPaymentIntent',
        {
          description: '创建支付意图。用于处理用户支付。需要用户已连接 Stripe 账户。',
          inputSchema: {
            type: 'object',
            properties: {
              userId: {
                type: 'string',
                description: '用户 ID',
              },
              amount: {
                type: 'number',
                description: '支付金额（单位：分，例如 1000 = $10.00）',
              },
              currency: {
                type: 'string',
                description: '货币代码（默认: usd）',
              },
              metadata: {
                type: 'object',
                description: '附加元数据（例如 tripId, bookingId）',
              },
            },
            required: ['userId', 'amount'],
          },
        },
        async (args: any) => {
          try {
            const result = await stripeDirectService.createPaymentIntent({
              userId: args.userId,
              amount: args.amount,
              currency: args.currency,
              metadata: args.metadata,
            });
            return formatResponse({
              id: result.id,
              clientSecret: result.client_secret,
              status: result.status,
              amount: result.amount,
              currency: result.currency,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: stripe.createPaymentIntent');

      // 注册 stripe.confirmPaymentIntent 工具
      server.registerTool(
        'stripe.confirmPaymentIntent',
        {
          description: '确认支付意图。完成支付流程。',
          inputSchema: {
            type: 'object',
            properties: {
              paymentIntentId: {
                type: 'string',
                description: '支付意图 ID',
              },
              paymentMethodId: {
                type: 'string',
                description: '支付方式 ID（可选）',
              },
            },
            required: ['paymentIntentId'],
          },
        },
        async (args: any) => {
          try {
            const result = await stripeDirectService.confirmPaymentIntent(
              args.paymentIntentId,
              args.paymentMethodId,
            );
            return formatResponse({
              id: result.id,
              status: result.status,
              amount: result.amount,
              currency: result.currency,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: stripe.confirmPaymentIntent');

      // 注册 stripe.getPaymentIntent 工具
      server.registerTool(
        'stripe.getPaymentIntent',
        {
          description: '获取支付意图状态。查询支付状态。',
          inputSchema: {
            type: 'object',
            properties: {
              paymentIntentId: {
                type: 'string',
                description: '支付意图 ID',
              },
            },
            required: ['paymentIntentId'],
          },
        },
        async (args: any) => {
          try {
            const result = await stripeDirectService.getPaymentIntent(args.paymentIntentId);
            return formatResponse({
              id: result.id,
              status: result.status,
              amount: result.amount,
              currency: result.currency,
              metadata: result.metadata,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: stripe.getPaymentIntent');

      // 注册 stripe.refundPayment 工具
      server.registerTool(
        'stripe.refundPayment',
        {
          description: '处理退款。为已完成的支付创建退款。',
          inputSchema: {
            type: 'object',
            properties: {
              paymentIntentId: {
                type: 'string',
                description: '支付意图 ID',
              },
              amount: {
                type: 'number',
                description: '退款金额（单位：分，可选，不提供则全额退款）',
              },
              reason: {
                type: 'string',
                description: '退款原因（duplicate, fraudulent, requested_by_customer）',
              },
            },
            required: ['paymentIntentId'],
          },
        },
        async (args: any) => {
          try {
            const result = await stripeDirectService.refundPayment(
              args.paymentIntentId,
              args.amount,
              args.reason,
            );
            return formatResponse({
              id: result.id,
              amount: result.amount,
              currency: result.currency,
              status: result.status,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: stripe.refundPayment');
    }
  } catch (error: any) {
    console.error('⚠️  Failed to register Stripe Direct API tools:', error.message);
    console.error('Note: Stripe tools will not be available');
  }

  // 注册 Stripe MCP 工具（可选，需要 OAuth 认证）
  let stripeClient: any = null;

  // 可以通过环境变量禁用 Stripe MCP（如果不需要或不想认证）
  const enableStripeMcp = process.env.ENABLE_STRIPE_MCP !== 'false';

  if (enableStripeMcp) {
    try {
      const { getStripeClient } = await import('./stripe-client');
      stripeClient = getStripeClient();

      console.error('Connecting to Stripe MCP server...');
      await stripeClient.connect();
      console.error('✅ Stripe MCP client connected');

      // 先获取可用工具列表
      const tools = await stripeClient.listTools();
      const toolList = tools.tools || [];

      console.error(`Found ${toolList.length} Stripe tools`);

      // 动态注册所有 Stripe 工具
      for (const tool of toolList) {
        try {
          server.registerTool(
            `stripe.${tool.name}`,
            {
              description: tool.description || `Stripe tool: ${tool.name}`,
              inputSchema: tool.inputSchema || {
                type: 'object',
                properties: {},
              },
            },
            async (args: any) => {
              try {
                const result = await stripeClient.callTool(tool.name, args);
                return formatResponse(result);
              } catch (error: any) {
                return formatResponse({
                  error: error.message || 'Unknown error',
                  stack: error.stack,
                });
              }
            }
          );
          console.error(`  ✓ Registered tool: stripe.${tool.name}`);
        } catch (error: any) {
          console.error(`  ⚠️  Failed to register tool stripe.${tool.name}:`, error.message);
        }
      }
    } catch (error: any) {
      console.error('⚠️  Failed to register Stripe MCP tools:', error.message);
      console.error('Note: Stripe tools will not be available');
      console.error('💡 提示: 如果不需要 Stripe 功能，可以设置 ENABLE_STRIPE_MCP=false 禁用');
    }
  } else {
    console.error('ℹ️  Stripe MCP 已禁用 (ENABLE_STRIPE_MCP=false)');
  }

  // 注册 Browserbase MCP 工具
  let browserbaseMcpService: any = null;
  try {
    const { BrowserbaseMcpService } = await import('./browserbase-mcp.service');
    browserbaseMcpService = app.get(BrowserbaseMcpService, { strict: false });
    
    if (browserbaseMcpService && browserbaseMcpService.isAvailable()) {
      console.error('Browserbase MCP service available, registering tools...');

      // 注册 browserbase_create_session 工具
      server.registerTool(
        'browserbase.createSession',
        {
          description: '创建 Browserbase 浏览器会话。用于自动化浏览器操作。',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: '初始 URL（可选）',
              },
              userAgent: {
                type: 'string',
                description: 'User Agent（可选）',
              },
              viewport: {
                type: 'object',
                description: '视口设置（可选）',
                properties: {
                  width: { type: 'number', description: '宽度' },
                  height: { type: 'number', description: '高度' },
                },
              },
            },
          },
        },
        async (args: any) => {
          try {
            const result = await browserbaseMcpService.createSession(args);
            return formatResponse(result);
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: browserbase.createSession');

      // 注册 browserbase_navigate 工具
      server.registerTool(
        'browserbase.navigate',
        {
          description: '在浏览器会话中导航到指定 URL。',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: '会话 ID',
              },
              url: {
                type: 'string',
                description: '目标 URL',
              },
              waitUntil: {
                type: 'string',
                enum: ['load', 'domcontentloaded', 'networkidle'],
                description: '等待条件（可选）',
              },
            },
            required: ['sessionId', 'url'],
          },
        },
        async (args: any) => {
          try {
            const result = await browserbaseMcpService.navigate(args);
            return formatResponse(result);
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: browserbase.navigate');

      // 注册 browserbase_screenshot 工具
      server.registerTool(
        'browserbase.screenshot',
        {
          description: '对浏览器会话进行截图。',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: '会话 ID',
              },
              fullPage: {
                type: 'boolean',
                description: '是否全页截图（可选）',
              },
              quality: {
                type: 'number',
                description: '图片质量 0-100（可选）',
              },
            },
            required: ['sessionId'],
          },
        },
        async (args: any) => {
          try {
            const result = await browserbaseMcpService.screenshot(args);
            return formatResponse(result);
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: browserbase.screenshot');

      // 注册 browserbase_click 工具
      server.registerTool(
        'browserbase.click',
        {
          description: '在浏览器会话中点击指定元素。',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: '会话 ID',
              },
              selector: {
                type: 'string',
                description: 'CSS 选择器',
              },
              waitForNavigation: {
                type: 'boolean',
                description: '是否等待导航（可选）',
              },
            },
            required: ['sessionId', 'selector'],
          },
        },
        async (args: any) => {
          try {
            const result = await browserbaseMcpService.click(args);
            return formatResponse(result);
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: browserbase.click');

      // 注册 browserbase_evaluate 工具
      server.registerTool(
        'browserbase.evaluate',
        {
          description: '在浏览器会话中执行 JavaScript 代码。',
          inputSchema: {
            type: 'object',
            properties: {
              sessionId: {
                type: 'string',
                description: '会话 ID',
              },
              script: {
                type: 'string',
                description: 'JavaScript 代码',
              },
            },
            required: ['sessionId', 'script'],
          },
        },
        async (args: any) => {
          try {
            const result = await browserbaseMcpService.evaluate(args);
            return formatResponse(result);
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: browserbase.evaluate');
    } else {
      console.error('⚠️  Browserbase MCP service not available, skipping tool registration');
    }
  } catch (error: any) {
    console.error('⚠️  Failed to register Browserbase MCP tools:', error.message);
    console.error('Note: Browserbase MCP tools will not be available');
  }

  // 注册 Currency Exchange Direct API 工具（可选）
  let currencyDirectService: any = null;
  try {
    const { CurrencyDirectService } = await import('./currency-direct.service');
    currencyDirectService = app.get(CurrencyDirectService, { strict: false });
    
    if (currencyDirectService && currencyDirectService.isServiceAvailable()) {
      console.error('Currency Direct API service available, registering tools...');

      // 注册 currency.getLatestRates 工具
      server.registerTool(
        'currency.getLatestRates',
        {
          description: '获取最新汇率。支持指定基础货币和目标货币。',
          inputSchema: {
            type: 'object',
            properties: {
              base: {
                type: 'string',
                description: '基础货币代码（默认: USD）',
              },
              symbols: {
                type: 'array',
                items: { type: 'string' },
                description: '目标货币代码数组（可选，默认返回所有）',
              },
            },
          },
        },
        async (args: any) => {
          try {
            const result = await currencyDirectService.getLatestRates(args);
            return formatResponse(result);
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: currency.getLatestRates');

      // 注册 currency.convert 工具
      server.registerTool(
        'currency.convert',
        {
          description: '货币转换。将一种货币转换为另一种货币。',
          inputSchema: {
            type: 'object',
            properties: {
              amount: {
                type: 'number',
                description: '金额',
              },
              from: {
                type: 'string',
                description: '源货币代码',
              },
              to: {
                type: 'string',
                description: '目标货币代码',
              },
              date: {
                type: 'string',
                description: '历史日期（YYYY-MM-DD，可选）',
              },
            },
            required: ['amount', 'from', 'to'],
          },
        },
        async (args: any) => {
          try {
            const result = await currencyDirectService.convertCurrency(args);
            return formatResponse(result);
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: currency.convert');

      // 注册 currency.getRateTrend 工具
      server.registerTool(
        'currency.getRateTrend',
        {
          description: '获取汇率趋势。返回最近 N 天的汇率变化。',
          inputSchema: {
            type: 'object',
            properties: {
              from: {
                type: 'string',
                description: '源货币代码',
              },
              to: {
                type: 'string',
                description: '目标货币代码',
              },
              days: {
                type: 'number',
                description: '天数（默认: 7）',
              },
            },
            required: ['from', 'to'],
          },
        },
        async (args: any) => {
          try {
            const trends = await currencyDirectService.getRateTrend(
              args.from,
              args.to,
              args.days || 7
            );
            return formatResponse({
              success: true,
              from: args.from,
              to: args.to,
              trends,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: currency.getRateTrend');
    } else {
      console.error('⚠️  Currency Direct API service not available');
    }
  } catch (error: any) {
    console.error('⚠️  Failed to register Currency Direct API tools:', error.message);
    console.error('Note: Currency Direct API tools will not be available');
  }

  // 注册 Hotel Direct API 工具（可选）
  let hotelDirectService: any = null;
  try {
    const { HotelDirectService } = await import('./hotel-direct.service');
    hotelDirectService = app.get(HotelDirectService, { strict: false });
    
    if (hotelDirectService && hotelDirectService.isServiceAvailable()) {
      console.error('Hotel Direct API service available, registering tools...');

      // 注册 hotel.search 工具
      server.registerTool(
        'hotel.search',
        {
          description: '搜索酒店。支持自然语言查询和多维度过滤（位置、价格、评分、入住日期等）。',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '自然语言查询，如 "纽约市中心酒店" 或 "hotel"',
              },
              location: {
                type: 'object',
                description: '位置坐标（可选）',
                properties: {
                  lat: { type: 'number', description: '纬度' },
                  lng: { type: 'number', description: '经度' },
                },
              },
              radius: {
                type: 'number',
                description: '搜索半径（米，默认 10000）',
              },
              type: {
                type: 'string',
                description: '酒店类型（如 "lodging"）',
              },
              priceLevel: {
                type: 'number',
                description: '价格等级（1=便宜，2=中等，3=较贵，4=昂贵）',
                enum: [1, 2, 3, 4],
              },
              minRating: {
                type: 'number',
                description: '最低评分（0-5，默认无限制）',
              },
              checkIn: {
                type: 'string',
                description: '入住日期（YYYY-MM-DD，可选）',
              },
              checkOut: {
                type: 'string',
                description: '退房日期（YYYY-MM-DD，可选）',
              },
              guests: {
                type: 'number',
                description: '入住人数（可选）',
              },
              language: {
                type: 'string',
                description: '语言代码（默认: en）',
              },
            },
          },
        },
        async (args: any) => {
          try {
            const result = await hotelDirectService.searchHotels(args);
            return formatResponse(result);
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: hotel.search');

      // 注册 hotel.getDetails 工具
      server.registerTool(
        'hotel.getDetails',
        {
          description: '获取酒店详情。包括评分、设施、照片、评价等信息。',
          inputSchema: {
            type: 'object',
            properties: {
              placeId: {
                type: 'string',
                description: 'Google Places place_id',
              },
              language: {
                type: 'string',
                description: '语言代码（默认: en）',
              },
            },
            required: ['placeId'],
          },
        },
        async (args: any) => {
          try {
            const details = await hotelDirectService.getHotelDetails(
              args.placeId,
              args.language
            );
            return formatResponse({
              success: true,
              hotel: details,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: hotel.getDetails');

      // 注册 hotel.nearbySearch 工具
      server.registerTool(
        'hotel.nearbySearch',
        {
          description: '附近搜索酒店。基于位置坐标搜索附近的酒店。',
          inputSchema: {
            type: 'object',
            properties: {
              location: {
                type: 'object',
                description: '位置坐标',
                properties: {
                  lat: { type: 'number', description: '纬度' },
                  lng: { type: 'number', description: '经度' },
                },
                required: ['lat', 'lng'],
              },
              radius: {
                type: 'number',
                description: '搜索半径（米，默认 10000）',
              },
              type: {
                type: 'string',
                description: '酒店类型（如 "lodging"）',
              },
              keyword: {
                type: 'string',
                description: '关键词（如 "luxury", "boutique"）',
              },
              priceLevel: {
                type: 'number',
                description: '价格等级（1=便宜，2=中等，3=较贵，4=昂贵）',
                enum: [1, 2, 3, 4],
              },
              minRating: {
                type: 'number',
                description: '最低评分（0-5）',
              },
              language: {
                type: 'string',
                description: '语言代码（默认: en）',
              },
            },
            required: ['location'],
          },
        },
        async (args: any) => {
          try {
            const results = await hotelDirectService.nearbySearch(args);
            return formatResponse({
              success: true,
              results,
              count: results.length,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: hotel.nearbySearch');

      // 注册 hotel.recommend 工具
      server.registerTool(
        'hotel.recommend',
        {
          description: '智能推荐酒店。基于用户偏好和上下文（位置、入住日期、人数）推荐酒店。',
          inputSchema: {
            type: 'object',
            properties: {
              userId: {
                type: 'string',
                description: '用户 ID',
              },
              location: {
                type: 'object',
                description: '位置坐标',
                properties: {
                  lat: { type: 'number', description: '纬度' },
                  lng: { type: 'number', description: '经度' },
                },
                required: ['lat', 'lng'],
              },
              checkIn: {
                type: 'string',
                description: '入住日期（YYYY-MM-DD，可选）',
              },
              checkOut: {
                type: 'string',
                description: '退房日期（YYYY-MM-DD，可选）',
              },
              guests: {
                type: 'number',
                description: '入住人数（可选）',
              },
              radius: {
                type: 'number',
                description: '搜索半径（米，默认 10000）',
              },
            },
            required: ['userId', 'location'],
          },
        },
        async (args: any) => {
          try {
            const context = {
              location: args.location,
              checkIn: args.checkIn,
              checkOut: args.checkOut,
              guests: args.guests,
              radius: args.radius,
            };
            const recommendations = await hotelDirectService.recommendHotels(
              args.userId,
              context
            );
            return formatResponse({
              success: true,
              recommendations,
              count: recommendations.length,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: hotel.recommend');
    } else {
      console.error('⚠️  Hotel Direct API service not available');
    }
  } catch (error: any) {
    console.error('⚠️  Failed to register Hotel Direct API tools:', error.message);
    console.error('Note: Hotel Direct API tools will not be available');
  }

  // 注册 Translation Direct API 工具（可选）
  let translationDirectService: any = null;
  try {
    const { TranslationDirectService } = await import('./translation-direct.service');
    translationDirectService = app.get(TranslationDirectService, { strict: false });
    
    if (translationDirectService && translationDirectService.isServiceAvailable()) {
      console.error('Translation Direct API service available, registering tools...');

      // 注册 translation.translate 工具
      server.registerTool(
        'translation.translate',
        {
          description: '翻译文本。支持单个文本或文本数组，自动检测源语言。',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                oneOf: [
                  { type: 'string' },
                  { type: 'array', items: { type: 'string' } },
                ],
                description: '要翻译的文本（单个字符串或字符串数组）',
              },
              target: {
                type: 'string',
                description: '目标语言代码（如 "en", "zh", "ja"）',
              },
              source: {
                type: 'string',
                description: '源语言代码（可选，不提供则自动检测）',
              },
              format: {
                type: 'string',
                enum: ['text', 'html'],
                description: '文本格式（默认: text）',
              },
            },
            required: ['text', 'target'],
          },
        },
        async (args: any) => {
          try {
            const result = await translationDirectService.translate(args);
            return formatResponse({
              success: true,
              result,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: translation.translate');

      // 注册 translation.detectLanguage 工具
      server.registerTool(
        'translation.detectLanguage',
        {
          description: '检测文本的语言。返回语言代码和置信度。',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: '要检测语言的文本',
              },
            },
            required: ['text'],
          },
        },
        async (args: any) => {
          try {
            const result = await translationDirectService.detectLanguage(args.text);
            return formatResponse({
              success: true,
              ...result,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: translation.detectLanguage');

      // 注册 translation.getSupportedLanguages 工具
      server.registerTool(
        'translation.getSupportedLanguages',
        {
          description: '获取支持的语言列表。可选参数：target（用于获取语言名称的目标语言）。',
          inputSchema: {
            type: 'object',
            properties: {
              target: {
                type: 'string',
                description: '目标语言代码（可选，用于获取语言名称）',
              },
            },
          },
        },
        async (args: any) => {
          try {
            const languages = await translationDirectService.getSupportedLanguages(args.target);
            return formatResponse({
              success: true,
              languages,
              count: languages.length,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: translation.getSupportedLanguages');

      // 注册 translation.smartTranslate 工具（基于用户设置）
      server.registerTool(
        'translation.smartTranslate',
        {
          description: '智能翻译（基于用户设置）。自动使用用户的默认目标语言和自动检测设置。',
          inputSchema: {
            type: 'object',
            properties: {
              userId: {
                type: 'string',
                description: '用户 ID',
              },
              text: {
                type: 'string',
                description: '要翻译的文本',
              },
              targetLanguage: {
                type: 'string',
                description: '目标语言代码（可选，不提供则使用用户默认设置）',
              },
            },
            required: ['userId', 'text'],
          },
        },
        async (args: any) => {
          try {
            const result = await translationDirectService.smartTranslate(
              args.userId,
              args.text,
              args.targetLanguage
            );
            return formatResponse({
              success: true,
              ...result,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: translation.smartTranslate');
    } else {
      console.error('⚠️  Translation Direct API service not available');
    }
  } catch (error: any) {
    console.error('⚠️  Failed to register Translation Direct API tools:', error.message);
    console.error('Note: Translation Direct API tools will not be available');
  }

  // 注册 Image Direct API 工具（可选）
  let imageDirectService: any = null;
  try {
    const { ImageDirectService } = await import('./image-direct.service');
    imageDirectService = app.get(ImageDirectService, { strict: false });
    
    if (imageDirectService && imageDirectService.isServiceAvailable()) {
      console.error('Image Direct API service available, registering tools...');

      // 注册 image.search 工具
      server.registerTool(
        'image.search',
        {
          description: '搜索图片。支持关键词搜索，可指定方向、尺寸、颜色等过滤条件。',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: '搜索关键词',
              },
              perPage: {
                type: 'number',
                description: '每页数量（1-80，默认 15）',
              },
              page: {
                type: 'number',
                description: '页码（默认 1）',
              },
              orientation: {
                type: 'string',
                enum: ['landscape', 'portrait', 'square'],
                description: '图片方向',
              },
              size: {
                type: 'string',
                enum: ['large', 'medium', 'small'],
                description: '图片尺寸',
              },
              color: {
                type: 'string',
                description: '颜色过滤（hex color，如 "#FF0000"）',
              },
            },
            required: ['query'],
          },
        },
        async (args: any) => {
          try {
            const result = await imageDirectService.searchImages(args);
            return formatResponse({
              success: true,
              ...result,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: image.search');

      // 注册 image.getCurated 工具
      server.registerTool(
        'image.getCurated',
        {
          description: '获取推荐图片。返回精选的高质量图片。',
          inputSchema: {
            type: 'object',
            properties: {
              perPage: {
                type: 'number',
                description: '每页数量（默认 15）',
              },
              page: {
                type: 'number',
                description: '页码（默认 1）',
              },
            },
          },
        },
        async (args: any) => {
          try {
            const result = await imageDirectService.getCuratedPhotos(args);
            return formatResponse({
              success: true,
              ...result,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: image.getCurated');

      // 注册 image.recommend 工具（基于用户偏好）
      server.registerTool(
        'image.recommend',
        {
          description: '智能推荐图片（基于用户偏好）。自动使用用户的偏好设置进行推荐。',
          inputSchema: {
            type: 'object',
            properties: {
              userId: {
                type: 'string',
                description: '用户 ID',
              },
              query: {
                type: 'string',
                description: '搜索关键词（可选，不提供则使用默认）',
              },
              perPage: {
                type: 'number',
                description: '每页数量（默认 15）',
              },
              page: {
                type: 'number',
                description: '页码（默认 1）',
              },
            },
            required: ['userId'],
          },
        },
        async (args: any) => {
          try {
            const result = await imageDirectService.recommendImages(
              args.userId,
              {
                query: args.query,
                perPage: args.perPage,
                page: args.page,
              }
            );
            return formatResponse({
              success: true,
              ...result,
            });
          } catch (error: any) {
            return formatResponse({
              error: error.message || 'Unknown error',
              stack: error.stack,
            });
          }
        }
      );
      console.error('  ✓ Registered tool: image.recommend');
    } else {
      console.error('⚠️  Image Direct API service not available');
    }
  } catch (error: any) {
    console.error('⚠️  Failed to register Image Direct API tools:', error.message);
    console.error('Note: Image Direct API tools will not be available');
  }

  return { server, app, allSkills, airbnbClient, postgresqlMcpService, browserbaseMcpService, googleMapsDirectService, weatherDirectService, railClient, fileExtractorClient, stripeClient, stripeDirectService, restaurantDirectService, currencyDirectService, hotelDirectService, translationDirectService, imageDirectService };
}

// Main function to start the server
async function main() {
  let airbnbClient: any = null;
  let googleMapsDirectService: any = null;
  let railClient: any = null;
  try {
    const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
    console.error('Initializing MCP Skills Server...');
    console.error('Calling createMcpServer...');
    const { server, app, allSkills, airbnbClient: client, googleMapsDirectService: mapsService, weatherDirectService: weatherService, railClient: rail, fileExtractorClient: fileExtractor, stripeClient: stripe, stripeDirectService: stripeDirect, restaurantDirectService: restaurantDirect, currencyDirectService: currencyDirect, hotelDirectService: hotelDirect, translationDirectService: translationDirect, imageDirectService: imageDirect } = await createMcpServer();
    airbnbClient = client;
    googleMapsDirectService = mapsService;
    railClient = rail;
    const fileExtractorClient = fileExtractor;
    const stripeClientInstance = stripe;
    globalAirbnbClient = client;
    if (rail) {
      globalRailClient = rail;
    }
    if (fileExtractorClient) {
      globalFileExtractorClient = fileExtractorClient;
    }
    if (stripeClientInstance) {
      globalStripeClient = stripeClientInstance;
    }
    const weatherDirectService = weatherService;
    console.error(`Created server with ${allSkills.length} skills`);
    
    // Start MCP server
    console.error('Connecting to stdio transport...');
    try {
      const transport = new StdioServerTransport();
      await server.connect(transport);
      
      // Log to stderr (stdout is used for JSON-RPC communication)
      console.error('TripNARA MCP Skills Server started and ready');
      console.error(`Registered ${allSkills.length} tools`);
      if (airbnbClient) {
        console.error('Airbnb tools available: airbnb.search, airbnb.listingDetails');
      }
      if (googleMapsDirectService && googleMapsDirectService.isServiceAvailable()) {
        console.error('Google Maps Direct API tools available: google_maps.getRoute, google_maps.computeDistanceMatrix, google_maps.geocode, google_maps.searchPlaces');
      }
      if (weatherDirectService && weatherDirectService.isServiceAvailable()) {
        console.error('Weather Direct API tools available: weather.getCurrentWeather, weather.getWeatherByDatetimeRange, weather.getCurrentDateTime');
      }
      if (railClient) {
        console.error('Rail MCP tools available (check logs above for specific tools)');
      }
      if (fileExtractorClient) {
        console.error('File Extractor MCP tools available: file_extractor.extract_metadata, file_extractor.extract_file_content');
      }
      if (stripeDirectService && stripeDirectService.isServiceAvailable()) {
        console.error('Stripe Direct API tools available: stripe.createPaymentIntent, stripe.confirmPaymentIntent, stripe.getPaymentIntent, stripe.refundPayment');
      }
      if (stripeClientInstance) {
        console.error('Stripe MCP tools available (check logs above for specific tools)');
      }
      if (restaurantDirectService && restaurantDirectService.isServiceAvailable()) {
        console.error('Restaurant Direct API tools available: restaurant.search, restaurant.getDetails, restaurant.nearbySearch, restaurant.recommend');
      }
      if (currencyDirectService && currencyDirectService.isServiceAvailable()) {
        console.error('Currency Direct API tools available: currency.getLatestRates, currency.convert, currency.getRateTrend');
      }
      if (hotelDirectService && hotelDirectService.isServiceAvailable()) {
        console.error('Hotel Direct API tools available: hotel.search, hotel.getDetails, hotel.nearbySearch, hotel.recommend');
      }
      if (translationDirectService && translationDirectService.isServiceAvailable()) {
        console.error('Translation Direct API tools available: translation.translate, translation.detectLanguage, translation.getSupportedLanguages, translation.smartTranslate');
      }
      if (imageDirectService && imageDirectService.isServiceAvailable()) {
        console.error('Image Direct API tools available: image.search, image.getCurated, image.recommend');
      }
      if (postgresqlMcpService && postgresqlMcpService.isAvailable()) {
        console.error('PostgreSQL MCP tools available: postgresql.query, postgresql.execute');
      }
      if (browserbaseMcpService && browserbaseMcpService.isAvailable()) {
        console.error('Browserbase MCP tools available: browserbase.createSession, browserbase.navigate, browserbase.screenshot, browserbase.click, browserbase.evaluate');
      }
    } catch (error: any) {
      console.error('Error connecting to stdio transport:', error);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
      // 确保断开连接
      if (airbnbClient) {
        try {
          await airbnbClient.disconnect();
        } catch (disconnectError) {
          console.error('Error disconnecting Airbnb client:', disconnectError);
        }
      }
      if (railClient) {
        try {
          await railClient.disconnect();
        } catch (disconnectError) {
          console.error('Error disconnecting Rail client:', disconnectError);
        }
      }
      if (fileExtractorClient) {
        try {
          await fileExtractorClient.disconnect();
        } catch (disconnectError) {
          console.error('Error disconnecting File Extractor client:', disconnectError);
        }
      }
      // Weather Direct Service 和 Google Maps Direct Service 不需要断开连接
      throw error;
    }
    
    // Keep the process alive - server.connect() should handle this, but just in case
    // The server will keep running and listening for JSON-RPC messages on stdin
  } catch (error: any) {
    console.error('Failed to start MCP server:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    // 确保断开连接
    if (airbnbClient) {
      try {
        await airbnbClient.disconnect();
      } catch (disconnectError) {
        console.error('Error disconnecting Airbnb client:', disconnectError);
      }
    }
    if (railClient) {
      try {
        await railClient.disconnect();
      } catch (disconnectError) {
        console.error('Error disconnecting Rail client:', disconnectError);
      }
    }
    if (fileExtractorClient) {
      try {
        await fileExtractorClient.disconnect();
      } catch (disconnectError) {
        console.error('Error disconnecting File Extractor client:', disconnectError);
      }
    }
    if (stripeClientInstance) {
      try {
        await stripeClientInstance.disconnect();
      } catch (disconnectError) {
        console.error('Error disconnecting Stripe client:', disconnectError);
      }
    }
    // Weather Direct Service 和 Google Maps Direct Service 不需要断开连接
    process.exit(1);
  }
}

// Graceful shutdown
let globalAirbnbClient: any = null;
let globalRailClient: any = null;
let globalFileExtractorClient: any = null;

process.on('SIGINT', async () => {
  console.error('\nShutting down MCP server...');
  if (globalAirbnbClient) {
    try {
      await globalAirbnbClient.disconnect();
    } catch (error) {
      console.error('Error disconnecting Airbnb client:', error);
    }
  }
  if (globalRailClient) {
    try {
      await globalRailClient.disconnect();
    } catch (error) {
      console.error('Error disconnecting Rail client:', error);
    }
  }
  // Weather Direct Service 和 Google Maps Direct Service 不需要断开连接
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\nShutting down MCP server...');
  if (globalAirbnbClient) {
    try {
      await globalAirbnbClient.disconnect();
    } catch (error) {
      console.error('Error disconnecting Airbnb client:', error);
    }
  }
  if (globalRailClient) {
    try {
      await globalRailClient.disconnect();
    } catch (error) {
      console.error('Error disconnecting Rail client:', error);
    }
  }
  if (globalFileExtractorClient) {
    try {
      await globalFileExtractorClient.disconnect();
    } catch (error) {
      console.error('Error disconnecting File Extractor client:', error);
    }
  }
  if (globalStripeClient) {
    try {
      await globalStripeClient.disconnect();
    } catch (error) {
      console.error('Error disconnecting Stripe client:', error);
    }
  }
  // Weather Direct Service 和 Google Maps Direct Service 不需要断开连接
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
  // 确保断开连接
  if (globalAirbnbClient) {
    try {
      await globalAirbnbClient.disconnect();
    } catch (disconnectError) {
      console.error('Error disconnecting Airbnb client:', disconnectError);
    }
  }
  if (globalWeatherClient) {
    try {
      await globalWeatherClient.disconnect();
    } catch (disconnectError) {
      console.error('Error disconnecting Weather client:', disconnectError);
    }
  }
  // Google Maps Direct Service 不需要断开连接
  process.exit(1);
});


// src/agent/assistants/planning-assistant/services/mcp-tool-registry.service.ts

/**
 * MCP Tool Registry Service
 * 
 * 职责:
 * - 统一管理所有 MCP 工具的能力定义
 * - 支持工具注册和动态发现
 * - 提供工具查询和分类功能
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * MCP 工具参数定义
 */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description: string;
  defaultValue?: any;
}

/**
 * MCP 工具定义
 */
export interface McpToolDefinition {
  serviceName: string;        // 服务名称（如 'airbnb'）
  toolName: string;          // 工具名称（如 'airbnb.listingDetails'）
  displayName: string;       // 显示名称（如 '获取房源详情'）
  description: string;        // 工具描述
  category: string;          // 分类（如 'accommodation'）
  parameters: ToolParameter[]; // 参数定义
  returnType: string;        // 返回类型
  examples: string[];        // 使用示例（自然语言）
  authRequired?: boolean;     // 是否需要认证
}

@Injectable()
export class McpToolRegistryService implements OnModuleInit {
  private readonly logger = new Logger(McpToolRegistryService.name);
  private tools: Map<string, McpToolDefinition[]> = new Map();

  async onModuleInit() {
    this.logger.log('🚀 MCP Tool Registry Service 初始化');
    this.registerDefaultTools();
    this.logger.log(`✅ 已注册 ${this.getTotalToolCount()} 个工具`);
  }

  /**
   * 注册工具
   */
  registerTool(serviceName: string, tool: McpToolDefinition): void {
    if (!this.tools.has(serviceName)) {
      this.tools.set(serviceName, []);
    }
    this.tools.get(serviceName)!.push(tool);
    this.logger.debug(`注册工具: ${serviceName}.${tool.toolName}`);
  }

  /**
   * 注册多个工具
   */
  registerTools(serviceName: string, tools: McpToolDefinition[]): void {
    tools.forEach(tool => this.registerTool(serviceName, tool));
  }

  /**
   * 获取服务的所有工具
   */
  getServiceTools(serviceName: string): McpToolDefinition[] {
    return this.tools.get(serviceName) || [];
  }

  /**
   * 根据分类查找工具
   */
  findToolsByCategory(category: string): McpToolDefinition[] {
    const allTools: McpToolDefinition[] = [];
    for (const tools of this.tools.values()) {
      allTools.push(...tools.filter(t => t.category === category));
    }
    return allTools;
  }

  /**
   * 根据工具名称查找工具
   */
  findToolByFullName(fullName: string): McpToolDefinition | undefined {
    // 格式: serviceName.toolName 或 toolName
    const parts = fullName.split('.');
    if (parts.length === 2) {
      const [serviceName, toolName] = parts;
      return this.tools.get(serviceName)?.find(t => t.toolName === toolName || t.toolName === fullName);
    } else {
      // 搜索所有服务
      for (const tools of this.tools.values()) {
        const tool = tools.find(t => t.toolName === fullName);
        if (tool) return tool;
      }
    }
    return undefined;
  }

  /**
   * 获取所有工具
   */
  getAllTools(): McpToolDefinition[] {
    const allTools: McpToolDefinition[] = [];
    for (const tools of this.tools.values()) {
      allTools.push(...tools);
    }
    return allTools;
  }

  /**
   * 获取工具总数
   */
  getTotalToolCount(): number {
    let count = 0;
    for (const tools of this.tools.values()) {
      count += tools.length;
    }
    return count;
  }

  /**
   * 注册默认工具（Phase 1: MVP）
   */
  private registerDefaultTools(): void {
    // Airbnb 工具
    this.registerTools('airbnb', [
      {
        serviceName: 'airbnb',
        toolName: 'airbnb.search',
        displayName: '搜索房源',
        description: '根据位置、日期、人数等条件搜索 Airbnb 房源',
        category: 'accommodation',
        parameters: [
          { name: 'location', type: 'string', required: true, description: '位置（城市、地址或坐标，如 "64.1466,-21.9426" 或 "Reykjavik"）' },
          { name: 'adults', type: 'number', required: false, description: '成人数', defaultValue: 1 },
          { name: 'checkin', type: 'string', required: false, description: '入住日期（YYYY-MM-DD）' },
          { name: 'checkout', type: 'string', required: false, description: '退房日期（YYYY-MM-DD）' },
        ],
        returnType: 'AirbnbListing[]',
        examples: [
          '搜索冰岛的 Airbnb',
          '找东京的民宿',
          '推荐巴黎的短租',
          '冰岛有什么 Airbnb 房源'
        ],
        authRequired: false,
      },
      {
        serviceName: 'airbnb',
        toolName: 'airbnb.listingDetails',
        displayName: '获取房源详情',
        description: '获取 Airbnb 房源的详细信息，包括设施、规则、评价、价格等',
        category: 'accommodation',
        parameters: [
          { name: 'listingId', type: 'string', required: true, description: '房源 ID（例如从搜索结果中获取）' },
          { name: 'checkin', type: 'string', required: false, description: '入住日期（YYYY-MM-DD）' },
          { name: 'checkout', type: 'string', required: false, description: '退房日期（YYYY-MM-DD）' },
        ],
        returnType: 'AirbnbListingDetails',
        examples: [
          '这个房源怎么样？房源 ID 是 12345',
          '查看房源详情',
          '这个 Airbnb 有什么设施？',
          '房源 67890 的价格是多少？'
        ],
        authRequired: false,
      }
    ]);

    // Weather 工具
    this.registerTools('weather', [
      {
        serviceName: 'weather',
        toolName: 'weather.getCurrentWeather',
        displayName: '获取当前天气',
        description: '获取指定位置的当前天气信息',
        category: 'weather',
        parameters: [
          { name: 'location', type: 'string', required: true, description: '位置（城市名称、地址或坐标，如 "Reykjavik" 或 "64.1466,-21.9426"）' },
        ],
        returnType: 'WeatherData',
        examples: [
          '冰岛现在天气怎么样？',
          '查询当前天气',
          'Reykjavik 的天气'
        ],
        authRequired: false,
      },
      {
        serviceName: 'weather',
        toolName: 'weather.getWeatherByDatetimeRange',
        displayName: '获取天气预报',
        description: '获取指定位置和时间范围的天气预报（支持多日预报）',
        category: 'weather',
        parameters: [
          { name: 'location', type: 'string', required: true, description: '位置（城市名称、地址或坐标）' },
          { name: 'startDate', type: 'string', required: false, description: '开始日期（YYYY-MM-DD），默认为今天' },
          { name: 'endDate', type: 'string', required: false, description: '结束日期（YYYY-MM-DD），默认为7天后' },
        ],
        returnType: 'WeatherForecast[]',
        examples: [
          '冰岛下周的天气怎么样？',
          '查询天气预报',
          '2月15日到2月22日的天气',
          '未来一周的天气'
        ],
        authRequired: false,
      }
    ]);

    // Exa 工具（扩展）
    this.registerTools('exa', [
      {
        serviceName: 'exa',
        toolName: 'exa.webSearch',
        displayName: 'Web 搜索',
        description: '使用 Exa 进行 Web 搜索，获取相关信息',
        category: 'search',
        parameters: [
          { name: 'query', type: 'string', required: true, description: '搜索查询（自然语言）' },
          { name: 'numResults', type: 'number', required: false, description: '返回结果数量', defaultValue: 5 },
        ],
        returnType: 'SearchResult[]',
        examples: [
          '搜索冰岛旅游攻略',
          '查一下相关信息',
          '网上搜索',
          '搜索攻略'
        ],
        authRequired: false,
      },
      {
        serviceName: 'exa',
        toolName: 'exa.webSearchAdvanced',
        displayName: '高级 Web 搜索',
        description: '使用 Exa 进行高级 Web 搜索，支持更多过滤选项和内容类型',
        category: 'search',
        parameters: [
          { name: 'query', type: 'string', required: true, description: '搜索查询（自然语言）' },
          { name: 'numResults', type: 'number', required: false, description: '返回结果数量', defaultValue: 5 },
          { name: 'category', type: 'string', required: false, description: '内容类别过滤' },
        ],
        returnType: 'SearchResult[]',
        examples: [
          '深度搜索冰岛旅游信息',
          '高级搜索攻略',
          '搜索特定类别的信息'
        ],
        authRequired: false,
      },
      {
        serviceName: 'exa',
        toolName: 'exa.deepSearch',
        displayName: '深度搜索',
        description: '使用 Exa 进行深度搜索，获取更详细和相关的信息',
        category: 'search',
        parameters: [
          { name: 'query', type: 'string', required: true, description: '搜索查询（自然语言）' },
          { name: 'numResults', type: 'number', required: false, description: '返回结果数量', defaultValue: 5 },
        ],
        returnType: 'SearchResult[]',
        examples: [
          '深度研究冰岛',
          '详细搜索相关信息',
          '深度查询'
        ],
        authRequired: false,
      },
      {
        serviceName: 'exa',
        toolName: 'exa.crawlUrl',
        displayName: '网页爬取',
        description: '爬取指定 URL 的网页内容',
        category: 'search',
        parameters: [
          { name: 'url', type: 'string', required: true, description: '要爬取的网页 URL' },
        ],
        returnType: 'CrawledContent',
        examples: [
          '爬取这个网页的内容',
          '获取网页内容',
          '提取网页信息'
        ],
        authRequired: false,
      }
    ]);

    // Google Calendar 工具（Phase 2）
    this.registerTools('google-calendar', [
      {
        serviceName: 'google-calendar',
        toolName: 'google-calendar.createEvent',
        displayName: '创建日历事件',
        description: '在 Google Calendar 中创建新事件',
        category: 'calendar',
        parameters: [
          { name: 'summary', type: 'string', required: true, description: '事件标题' },
          { name: 'start', type: 'string', required: true, description: '开始时间（ISO 8601 格式或自然语言，如 "2026-02-15T10:00:00"）' },
          { name: 'end', type: 'string', required: true, description: '结束时间（ISO 8601 格式或自然语言）' },
          { name: 'description', type: 'string', required: false, description: '事件描述' },
          { name: 'location', type: 'string', required: false, description: '事件地点' },
          { name: 'calendarId', type: 'string', required: false, description: '日历 ID（默认为主日历）' },
        ],
        returnType: 'CalendarEvent',
        examples: [
          '创建一个日历事件：明天下午3点开会',
          '添加到日历：2月15日参观博物馆',
          '创建事件：冰岛旅行开始'
        ],
        authRequired: true,
      },
      {
        serviceName: 'google-calendar',
        toolName: 'google-calendar.findFreeSlots',
        displayName: '查找空闲时间段',
        description: '查找指定时间范围内的空闲时间段',
        category: 'calendar',
        parameters: [
          { name: 'timeMin', type: 'string', required: true, description: '开始时间（ISO 8601 格式）' },
          { name: 'timeMax', type: 'string', required: true, description: '结束时间（ISO 8601 格式）' },
          { name: 'durationMinutes', type: 'number', required: false, description: '需要的空闲时长（分钟）', defaultValue: 60 },
          { name: 'calendarId', type: 'string', required: false, description: '日历 ID（默认为主日历）' },
        ],
        returnType: 'FreeSlot[]',
        examples: [
          '查找下周的空闲时间',
          '什么时候有空？',
          '查看空闲时间段'
        ],
        authRequired: true,
      },
      {
        serviceName: 'google-calendar',
        toolName: 'google-calendar.quickAdd',
        displayName: '快速添加事件',
        description: '使用自然语言快速添加日历事件',
        category: 'calendar',
        parameters: [
          { name: 'text', type: 'string', required: true, description: '自然语言描述（如 "明天下午3点开会"）' },
          { name: 'calendarId', type: 'string', required: false, description: '日历 ID（默认为主日历）' },
        ],
        returnType: 'CalendarEvent',
        examples: [
          '快速添加：明天下午3点开会',
          '添加到日历：2月15日参观博物馆',
          '快速创建事件'
        ],
        authRequired: true,
      },
      {
        serviceName: 'google-calendar',
        toolName: 'google-calendar.listEvents',
        displayName: '列出日历事件',
        description: '列出指定时间范围内的日历事件',
        category: 'calendar',
        parameters: [
          { name: 'timeMin', type: 'string', required: false, description: '开始时间（ISO 8601 格式）' },
          { name: 'timeMax', type: 'string', required: false, description: '结束时间（ISO 8601 格式）' },
          { name: 'maxResults', type: 'number', required: false, description: '最大返回数量', defaultValue: 10 },
          { name: 'calendarId', type: 'string', required: false, description: '日历 ID（默认为主日历）' },
        ],
        returnType: 'CalendarEvent[]',
        examples: [
          '查看我的日历事件',
          '列出下周的事件',
          '显示日历'
        ],
        authRequired: true,
      }
    ]);

    // Rail 工具（铁路查询）
    this.registerTools('rail', [
      {
        serviceName: 'rail',
        toolName: 'rail.searchRoutes',
        displayName: '搜索铁路路线',
        description: '根据出发地、目的地和日期搜索铁路路线',
        category: 'transport',
        parameters: [
          { name: 'origin', type: 'string', required: true, description: '出发地（城市或车站名，如 "巴黎"、"Paris"）' },
          { name: 'destination', type: 'string', required: true, description: '目的地（城市或车站名，如 "伦敦"、"London"）' },
          { name: 'date', type: 'string', required: false, description: '出发日期（YYYY-MM-DD）' },
        ],
        returnType: 'RailRoute[]',
        examples: [
          '查询从巴黎到伦敦的火车',
          '巴黎到伦敦的铁路',
          '查火车票',
          '高铁时刻表'
        ],
        authRequired: true, // Rail MCP 需要 OAuth
      },
      {
        serviceName: 'rail',
        toolName: 'rail.getSchedule',
        displayName: '获取铁路时刻表',
        description: '获取指定路线的铁路时刻表',
        category: 'transport',
        parameters: [
          { name: 'origin', type: 'string', required: true, description: '出发地' },
          { name: 'destination', type: 'string', required: true, description: '目的地' },
          { name: 'date', type: 'string', required: true, description: '日期（YYYY-MM-DD）' },
        ],
        returnType: 'RailSchedule[]',
        examples: [
          '巴黎到伦敦的火车时刻表',
          '查询某天的班次'
        ],
        authRequired: true,
      }
    ]);

    // Hotel 工具
    this.registerTools('hotel', [
      {
        serviceName: 'hotel',
        toolName: 'hotel.search',
        displayName: '搜索酒店',
        description: '根据位置、日期、价格、评分等条件搜索酒店',
        category: 'accommodation',
        parameters: [
          { name: 'query', type: 'string', required: false, description: '搜索查询（自然语言，如 "纽约市中心酒店"）' },
          { name: 'location', type: 'string', required: false, description: '位置（城市名称、地址或坐标对象，如 "Reykjavik" 或 {lat: 64.1466, lng: -21.9426}）' },
          { name: 'radius', type: 'number', required: false, description: '搜索半径（米）', defaultValue: 10000 },
          { name: 'priceLevel', type: 'number', required: false, description: '价格等级（1=便宜，4=昂贵）' },
          { name: 'minRating', type: 'number', required: false, description: '最低评分（0-5）' },
          { name: 'checkIn', type: 'string', required: false, description: '入住日期（YYYY-MM-DD）' },
          { name: 'checkOut', type: 'string', required: false, description: '退房日期（YYYY-MM-DD）' },
          { name: 'guests', type: 'number', required: false, description: '入住人数' },
          { name: 'language', type: 'string', required: false, description: '语言代码', defaultValue: 'en' },
        ],
        returnType: 'HotelDetails[]',
        examples: [
          '搜索冰岛的酒店',
          '找东京的酒店',
          '推荐巴黎的酒店',
          '冰岛有什么酒店',
          '搜索纽约市中心的高评分酒店'
        ],
        authRequired: false,
      },
      {
        serviceName: 'hotel',
        toolName: 'hotel.getDetails',
        displayName: '获取酒店详情',
        description: '获取酒店的详细信息，包括地址、评分、价格、评价等',
        category: 'accommodation',
        parameters: [
          { name: 'placeId', type: 'string', required: true, description: '酒店 Place ID（例如从搜索结果中获取）' },
          { name: 'language', type: 'string', required: false, description: '语言代码', defaultValue: 'en' },
        ],
        returnType: 'HotelDetails',
        examples: [
          '这个酒店怎么样？Place ID 是 ChIJ...',
          '查看酒店详情',
          '这个酒店有什么设施？',
          '酒店详情'
        ],
        authRequired: false,
      }
    ]);

  }
}

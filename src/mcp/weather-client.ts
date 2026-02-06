/**
 * Weather MCP Client
 * 
 * 客户端连接到 @isdaniel/mcp_weather_server
 * 提供天气查询功能，使用 Open-Meteo API（无需 API Key）
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class WeatherMcpClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private isConnected = false;

  /**
   * 连接到 Weather MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      // 创建 stdio 传输层
      // Weather MCP 服务器是 Python 包，需要通过 python3 -m mcp_weather_server 运行
      this.transport = new StdioClientTransport({
        command: 'python3',
        args: ['-m', 'mcp_weather_server'],
      });

      // 创建 MCP 客户端
      this.client = new Client({
        name: 'tripnara-weather-client',
        version: '1.0.0',
      });

      await this.client.connect(this.transport);
      this.isConnected = true;
      console.error('✅ Weather MCP client connected');
    } catch (error) {
      console.error('❌ Failed to connect to Weather MCP server:', error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.error('Error disconnecting Weather client:', error);
      }
      this.client = null;
      this.transport = null;
      this.isConnected = false;
    }
  }

  /**
   * 确保已连接
   */
  private async ensureConnected(): Promise<Client> {
    if (!this.isConnected || !this.client) {
      await this.connect();
    }
    if (!this.client) {
      throw new Error('Weather client not initialized');
    }
    return this.client;
  }

  /**
   * 列出所有可用的工具
   */
  async listTools(): Promise<any> {
    const client = await this.ensureConnected();
    return await client.listTools();
  }

  /**
   * 获取当前天气
   */
  async getCurrentWeather(params: {
    city: string;
  }): Promise<any> {
    const client = await this.ensureConnected();
    const result = await client.callTool({
      name: 'get_current_weather',
      arguments: params,
    });
    return result;
  }

  /**
   * 获取日期范围内的天气
   */
  async getWeatherByDatetimeRange(params: {
    city: string;
    start_date: string; // YYYY-MM-DD
    end_date: string; // YYYY-MM-DD
  }): Promise<any> {
    const client = await this.ensureConnected();
    const result = await client.callTool({
      name: 'get_weather_by_datetime_range',
      arguments: params,
    });
    return result;
  }

  /**
   * 获取当前日期时间
   */
  async getCurrentDateTime(params: {
    timezone?: string; // 例如 'America/New_York', 'Asia/Shanghai'
  }): Promise<any> {
    const client = await this.ensureConnected();
    const result = await client.callTool({
      name: 'get_current_datetime',
      arguments: params,
    });
    return result;
  }
}

// 单例实例
let weatherClientInstance: WeatherMcpClient | null = null;

/**
 * 获取 Weather MCP 客户端单例
 */
export function getWeatherClient(): WeatherMcpClient {
  if (!weatherClientInstance) {
    weatherClientInstance = new WeatherMcpClient();
  }
  return weatherClientInstance;
}

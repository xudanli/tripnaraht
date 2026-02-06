/**
 * Google Calendar Service
 * 
 * NestJS 服务层，封装 Google Calendar MCP 客户端
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { GoogleCalendarMcpClient } from './google-calendar-client';

@Injectable()
export class GoogleCalendarService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private client: GoogleCalendarMcpClient;
  private isConnected: boolean = false;

  constructor() {
    this.client = new GoogleCalendarMcpClient();
  }

  async onModuleInit() {
    // 延迟连接：不在模块初始化时自动连接，而是在第一次使用时连接
    // 这样可以避免重复启动 transport 的问题
    this.logger.log('Google Calendar Service initialized (lazy connection)');
  }

  async onModuleDestroy() {
    try {
      await this.disconnect();
    } catch (error: any) {
      this.logger.warn(`Failed to disconnect from Google Calendar MCP: ${error.message}`);
    }
  }

  /**
   * 连接到 Google Calendar MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await this.client.connect();
      this.isConnected = true;
      this.logger.log('Connected to Google Calendar MCP server');
    } catch (error: any) {
      this.logger.error(`Failed to connect: ${error.message}`);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.client.disconnect();
      this.isConnected = false;
      this.logger.log('Disconnected from Google Calendar MCP server');
    } catch (error: any) {
      this.logger.error(`Failed to disconnect: ${error.message}`);
    }
  }

  /**
   * 确保已连接
   */
  private async ensureConnected(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      await this.connect();
    } catch (error: any) {
      // 如果连接失败是因为 transport 已经启动，尝试检查客户端状态
      if (error.message?.includes('already started')) {
        // Transport 可能已经启动，检查客户端是否可用
        try {
          // 尝试调用一个简单的方法来验证连接状态
          await this.client.listTools();
          this.isConnected = true;
          this.logger.log('Transport already started, connection verified');
          return;
        } catch (verifyError: any) {
          // 如果验证失败，重新连接
          this.logger.warn('Connection verification failed, reconnecting...');
          this.isConnected = false;
          // 尝试断开后重新连接
          try {
            await this.client.disconnect();
          } catch {
            // 忽略断开错误
          }
          await this.connect();
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * 列出所有可用工具
   */
  async listTools(): Promise<any> {
    await this.ensureConnected();
    return await this.client.listTools();
  }

  /**
   * 列出日历事件
   */
  async listEvents(params: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
  } = {}): Promise<any> {
    await this.ensureConnected();
    return await this.client.listEvents(params);
  }

  /**
   * 创建日历事件
   */
  async createEvent(params: {
    calendarId?: string;
    summary: string;
    start: { dateTime: string; timeZone?: string } | { date: string };
    end: { dateTime: string; timeZone?: string } | { date: string };
    description?: string;
    location?: string;
    attendees?: Array<{ email: string }>;
  }): Promise<any> {
    await this.ensureConnected();
    return await this.client.createEvent(params);
  }

  /**
   * 删除日历事件
   */
  async deleteEvent(params: {
    calendarId: string;
    eventId: string;
  }): Promise<any> {
    await this.ensureConnected();
    return await this.client.deleteEvent(params);
  }

  /**
   * 更新日历事件
   */
  async updateEvent(params: {
    calendarId: string;
    eventId: string;
    summary?: string;
    start?: { dateTime: string; timeZone?: string } | { date: string };
    end?: { dateTime: string; timeZone?: string } | { date: string };
    description?: string;
    location?: string;
  }): Promise<any> {
    await this.ensureConnected();
    return await this.client.updateEvent(params);
  }

  /**
   * 查找日历事件
   */
  async findEvent(params: {
    calendarId?: string;
    query?: string;
    timeMin?: string;
    timeMax?: string;
  }): Promise<any> {
    await this.ensureConnected();
    return await this.client.findEvent(params);
  }

  /**
   * 获取当前日期时间
   */
  async getCurrentDateTime(): Promise<any> {
    await this.ensureConnected();
    return await this.client.getCurrentDateTime();
  }

  /**
   * 查找空闲时间段
   */
  async findFreeSlots(params: {
    calendarId?: string;
    timeMin: string;
    timeMax: string;
    durationMinutes?: number;
  }): Promise<any> {
    await this.ensureConnected();
    return await this.client.findFreeSlots(params);
  }

  /**
   * 列出所有日历
   */
  async listCalendars(): Promise<any> {
    await this.ensureConnected();
    return await this.client.listCalendars();
  }

  /**
   * 快速添加事件（自然语言）
   */
  async quickAdd(params: {
    calendarId?: string;
    text: string;
  }): Promise<any> {
    await this.ensureConnected();
    return await this.client.quickAdd(params);
  }
}

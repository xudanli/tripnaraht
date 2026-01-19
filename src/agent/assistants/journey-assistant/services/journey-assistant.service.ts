// src/agent/assistants/journey-assistant/services/journey-assistant.service.ts

/**
 * 行程助手智能体服务 (V2.1 重构)
 * 
 * 架构定位：用户交互层入口
 * 
 * 职责（V2.1 收紧后）：
 * ✅ 对话响应 - 旅途中的问答、导航、推荐
 * ✅ 状态展示 - 展示当前行程状态、提醒
 * ✅ 下发变更意图 - 通过 CoreGateway.applyChangeIntent() 触发变更
 * ✅ 触发编排动作 - 通过 CoreGateway 触发核心动作
 * 
 * ❌ 移除（下沉到核心层）：
 * - 直接修改行程 → CoreGateway.applyChangeIntent()
 * - 执行回滚 → CoreGateway.rollback()
 * 
 * 依赖注入（V2.1 规范）：
 * - CoreGateway: 触发核心动作的唯一入口
 * - LLMExecutor: LLM 调用的唯一入口（用于对话）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LlmService } from '../../../../llm/services/llm.service';
import { ExecutionAgentService } from '../../../services/execution-agent.service';
import { PersonaShellService } from '../../../services/persona-shell.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { LLMExecutorService } from '../../../infra/llm-executor.service';
import { CoreGatewayService, ChangeIntent } from '../../../infra/core-gateway.service';
import {
  JourneyState,
  JourneyAssistantRequest,
  JourneyAssistantResponse,
  TripPhase,
  Reminder,
  ReminderType,
  TripEvent,
  EventType,
  EmergencyOption,
  ScheduleItem,
  JourneyIntent,
  PushNotification,
} from '../interfaces/journey-assistant.interface';
import { randomUUID as uuidv4 } from 'crypto';

@Injectable()
export class JourneyAssistantService {
  private readonly logger = new Logger(JourneyAssistantService.name);
  
  // 活跃行程状态缓存
  private journeyStates: Map<string, JourneyState> = new Map();
  
  // 待推送通知队列
  private notificationQueue: PushNotification[] = [];

  constructor(
    // V2.1 Infra 层服务
    @Optional() private readonly coreGateway?: CoreGatewayService,
    @Optional() private readonly llmExecutor?: LLMExecutorService,
    // 保留用于展示/对话
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly llmService?: LlmService,
    @Optional() private readonly executionAgent?: ExecutionAgentService,
    @Optional() private readonly personaShell?: PersonaShellService,
  ) {
    this.logger.log('🚀 行程助手智能体已初始化 (V2.1 架构)');
  }

  /**
   * 处理用户请求
   */
  async handle(request: JourneyAssistantRequest): Promise<JourneyAssistantResponse> {
    const startTime = Date.now();
    this.logger.debug(`[行程助手] 收到请求: tripId=${request.tripId}, action=${request.action}`);

    try {
      switch (request.action) {
        case 'chat':
          return this.handleChat(request);
        case 'get_status':
          return this.handleGetStatus(request);
        case 'get_reminders':
          return this.handleGetReminders(request);
        case 'handle_event':
          return this.handleEvent(request);
        case 'adjust_schedule':
          return this.handleAdjustSchedule(request);
        default:
          return this.createErrorResponse('Unknown action');
      }
    } catch (error: any) {
      this.logger.error(`[行程助手] 处理失败: ${error.message}`, error.stack);
      return this.createErrorResponse(error.message);
    } finally {
      this.logger.debug(`[行程助手] 处理完成: 耗时=${Date.now() - startTime}ms`);
    }
  }

  /**
   * 处理对话
   */
  private async handleChat(request: JourneyAssistantRequest): Promise<JourneyAssistantResponse> {
    if (!request.message) {
      return this.createErrorResponse('Message is required for chat');
    }

    // 加载行程状态
    const state = await this.loadJourneyState(request.tripId, request.userId);
    
    // 分析意图
    const intent = await this.analyzeIntent(request.message, state);
    this.logger.debug(`[行程助手] 意图分析: ${intent}`);

    switch (intent) {
      case 'NEARBY_SEARCH':
        return this.handleNearbySearch(request, state);
      case 'SCHEDULE_QUERY':
        return this.handleScheduleQuery(request, state);
      case 'NAVIGATION':
        return this.handleNavigation(request, state);
      case 'RECOMMENDATION':
        return this.handleRecommendation(request, state);
      case 'EMERGENCY':
        return this.handleEmergencyChat(request, state);
      case 'ADJUSTMENT':
        return this.handleAdjustmentChat(request, state);
      default:
        return this.handleGeneralChat(request, state);
    }
  }

  /**
   * 获取行程状态
   */
  private async handleGetStatus(request: JourneyAssistantRequest): Promise<JourneyAssistantResponse> {
    const state = await this.loadJourneyState(request.tripId, request.userId);
    
    const statusMessage = this.generateStatusMessage(state);
    
    return {
      message: statusMessage.en,
      messageCN: statusMessage.cn,
      journeyState: state,
      suggestedActions: this.getSuggestedActions(state),
    };
  }

  /**
   * 获取提醒列表
   */
  private async handleGetReminders(request: JourneyAssistantRequest): Promise<JourneyAssistantResponse> {
    const state = await this.loadJourneyState(request.tripId, request.userId);
    const reminders = await this.generateReminders(state);
    
    return {
      message: `You have ${reminders.length} upcoming reminders.`,
      messageCN: `你有 ${reminders.length} 条待办提醒。`,
      reminders,
      journeyState: state,
    };
  }

  /**
   * 处理突发事件
   */
  private async handleEvent(request: JourneyAssistantRequest): Promise<JourneyAssistantResponse> {
    if (!request.eventId) {
      return this.createErrorResponse('Event ID is required');
    }

    const state = await this.loadJourneyState(request.tripId, request.userId);
    const event = state.activeEvents.find(e => e.id === request.eventId);
    
    if (!event) {
      return this.createErrorResponse('Event not found');
    }

    // 如果用户已选择方案
    if (request.selectedOptionId) {
      return this.executeSelectedOption(request, state, event);
    }

    // 生成应对方案
    const options = await this.generateEmergencyOptions(event, state);
    
    return {
      message: this.generateEventMessage(event).en,
      messageCN: this.generateEventMessage(event).cn,
      event,
      options,
      journeyState: state,
    };
  }

  /**
   * 调整行程 (V2.1: 通过 CoreGateway 下发 ChangeIntent)
   * 
   * V2.1 架构：JourneyAssistant 只下发变更意图，不直接修改行程
   * 实际的变更执行由 ExecutionCoreAgent 负责
   */
  private async handleAdjustSchedule(request: JourneyAssistantRequest): Promise<JourneyAssistantResponse> {
    if (!request.adjustmentParams) {
      return this.createErrorResponse('Adjustment parameters are required');
    }

    const state = await this.loadJourneyState(request.tripId, request.userId);
    const { itemId, newTime, cancel, replace } = request.adjustmentParams;

    // 找到要调整的项目
    const item = state.todaySchedule.find(i => i.id === itemId);
    if (!item) {
      return {
        adjustmentResult: {
          success: false,
          message: 'Schedule item not found',
          messageCN: '未找到该行程项',
        },
      };
    }

    // V2.1: 通过 CoreGateway 下发 ChangeIntent
    if (this.coreGateway) {
      const changeIntent: ChangeIntent = {
        intentId: uuidv4(),
        type: cancel ? 'cancel' : 'schedule',
        target: {
          itemId,
          dayIndex: state.currentDay,
        },
        from: cancel ? item.status : item.startTime,
        to: cancel ? 'cancelled' : newTime,
        constraints: {},
        reason: request.message || 'User requested adjustment',
        urgency: 'normal',
        userConfirmed: true, // 用户已通过 UI 确认
      };

      try {
        this.logger.debug(`[行程助手] 通过 CoreGateway 下发 ChangeIntent: ${changeIntent.type}`);
        
        const result = await this.coreGateway.applyChangeIntent({
          userId: request.userId,
          tripId: request.tripId,
          intent: changeIntent,
        });

        if (result.success) {
          // 重新加载状态（核心层已更新）
          const updatedState = await this.loadJourneyState(request.tripId, request.userId);
          
          return {
            message: 'Schedule updated successfully!',
            messageCN: '行程已更新！',
            adjustmentResult: {
              success: true,
              message: 'Schedule updated via ExecutionCore',
              messageCN: '行程已通过执行核心更新',
              updatedSchedule: updatedState.todaySchedule,
            },
            journeyState: updatedState,
          };
        } else {
          this.logger.warn(`[行程助手] CoreGateway 返回失败: ${result.error?.message}`);
        }
      } catch (error: any) {
        this.logger.warn(`[行程助手] CoreGateway 调用失败: ${error.message}，使用降级方案`);
      }
    }

    // 降级方案：直接修改本地状态（向后兼容）
    this.logger.warn('[行程助手] CoreGateway 不可用，使用降级方案直接修改');
    if (cancel) {
      item.status = 'cancelled';
    } else if (newTime) {
      item.startTime = newTime;
      item.status = 'modified';
    }

    await this.saveJourneyState(state);

    return {
      message: 'Schedule updated successfully!',
      messageCN: '行程已更新！',
      adjustmentResult: {
        success: true,
        message: 'Schedule updated (fallback mode)',
        messageCN: '行程已更新（降级模式）',
        updatedSchedule: state.todaySchedule,
      },
      journeyState: state,
    };
  }

  // ==================== 意图处理方法 ====================

  /**
   * 处理附近搜索
   */
  private async handleNearbySearch(request: JourneyAssistantRequest, state: JourneyState): Promise<JourneyAssistantResponse> {
    const searchType = this.extractSearchType(request.message || '');
    
    // 模拟搜索结果
    const results = [
      { name: 'Restaurant A', nameCN: '餐厅A', distance: '200m', rating: 4.5 },
      { name: 'Restaurant B', nameCN: '餐厅B', distance: '350m', rating: 4.3 },
      { name: 'Restaurant C', nameCN: '餐厅C', distance: '500m', rating: 4.7 },
    ];

    return {
      message: `I found ${results.length} ${searchType} near you:

1. **Restaurant A** - 200m away ⭐ 4.5
2. **Restaurant B** - 350m away ⭐ 4.3
3. **Restaurant C** - 500m away ⭐ 4.7

Would you like me to navigate you to any of these?`,
      messageCN: `我在附近找到了 ${results.length} 家${this.translateSearchType(searchType)}：

1. **餐厅A** - 200米 ⭐ 4.5
2. **餐厅B** - 350米 ⭐ 4.3
3. **餐厅C** - 500米 ⭐ 4.7

需要我帮你导航到哪一家吗？`,
      searchResults: {
        type: searchType,
        items: results,
      },
      journeyState: state,
      suggestedActions: [
        { action: 'navigate_1', label: 'Navigate to Restaurant A', labelCN: '导航到餐厅A' },
        { action: 'navigate_2', label: 'Navigate to Restaurant B', labelCN: '导航到餐厅B' },
        { action: 'navigate_3', label: 'Navigate to Restaurant C', labelCN: '导航到餐厅C' },
      ],
    };
  }

  /**
   * 处理行程查询
   */
  private async handleScheduleQuery(request: JourneyAssistantRequest, state: JourneyState): Promise<JourneyAssistantResponse> {
    const schedule = state.todaySchedule;
    
    let scheduleText = '';
    let scheduleTextCN = '';
    
    schedule.forEach((item, index) => {
      const time = item.startTime.split('T')[1]?.substring(0, 5) || item.startTime;
      scheduleText += `${index + 1}. ${time} - ${item.title}\n`;
      scheduleTextCN += `${index + 1}. ${time} - ${item.titleCN}\n`;
    });

    return {
      message: `Here's your schedule for today (Day ${state.currentDay}):

${scheduleText}
Currently: ${this.getCurrentActivity(state)?.title || 'Free time'}

Anything you'd like to adjust?`,
      messageCN: `这是你今天的行程（第${state.currentDay}天）：

${scheduleTextCN}
当前：${this.getCurrentActivity(state)?.titleCN || '自由时间'}

需要调整什么吗？`,
      journeyState: state,
    };
  }

  /**
   * 处理导航请求
   */
  private async handleNavigation(request: JourneyAssistantRequest, state: JourneyState): Promise<JourneyAssistantResponse> {
    return {
      message: `I'll help you navigate! Opening maps...

🚗 Estimated time: 15 minutes
📍 Distance: 3.2 km

Safe travels!`,
      messageCN: `我来帮你导航！正在打开地图...

🚗 预计时间：15分钟
📍 距离：3.2公里

一路顺风！`,
      journeyState: state,
      suggestedActions: [
        { action: 'open_maps', label: 'Open in Maps', labelCN: '在地图中打开' },
        { action: 'share_location', label: 'Share my location', labelCN: '分享我的位置' },
      ],
    };
  }

  /**
   * 处理推荐请求
   */
  private async handleRecommendation(request: JourneyAssistantRequest, state: JourneyState): Promise<JourneyAssistantResponse> {
    return {
      message: `Based on your location and time, I recommend:

🍜 **For food**: Try the local seafood restaurant nearby
🏛️ **For sightseeing**: The museum is just 10 minutes away
🛍️ **For shopping**: The local market closes at 6 PM

What are you in the mood for?`,
      messageCN: `根据你的位置和时间，我推荐：

🍜 **吃饭**：附近的海鲜餐厅很不错
🏛️ **观光**：博物馆就在10分钟路程
🛍️ **购物**：当地市场6点关门

你想做什么？`,
      journeyState: state,
      suggestedActions: [
        { action: 'food', label: 'Find food', labelCN: '找吃的' },
        { action: 'sightseeing', label: 'Go sightseeing', labelCN: '去观光' },
        { action: 'shopping', label: 'Go shopping', labelCN: '去购物' },
      ],
    };
  }

  /**
   * 处理紧急求助
   */
  private async handleEmergencyChat(request: JourneyAssistantRequest, state: JourneyState): Promise<JourneyAssistantResponse> {
    return {
      message: `🚨 I'm here to help! What's the emergency?

**Quick actions:**
- 🏥 Find nearest hospital
- 👮 Contact local police
- 🏛️ Contact embassy
- 📞 Emergency hotline: 112

Stay calm, I'll guide you through this.`,
      messageCN: `🚨 我来帮你！发生了什么紧急情况？

**快速操作：**
- 🏥 查找最近医院
- 👮 联系当地警察
- 🏛️ 联系大使馆
- 📞 紧急热线：112

保持冷静，我会帮你处理。`,
      journeyState: state,
      suggestedActions: [
        { action: 'find_hospital', label: 'Find hospital', labelCN: '找医院' },
        { action: 'call_police', label: 'Call police', labelCN: '报警' },
        { action: 'contact_embassy', label: 'Contact embassy', labelCN: '联系大使馆' },
        { action: 'emergency_call', label: 'Emergency call', labelCN: '紧急呼叫' },
      ],
    };
  }

  /**
   * 处理调整请求
   */
  private async handleAdjustmentChat(request: JourneyAssistantRequest, state: JourneyState): Promise<JourneyAssistantResponse> {
    return {
      message: `Sure, I can help you adjust your plans!

What would you like to change?
- 📅 Reschedule an activity
- ❌ Cancel something
- ➕ Add a new activity
- 🔄 Swap activities

Just tell me what you need!`,
      messageCN: `没问题，我来帮你调整！

你想改什么？
- 📅 改时间
- ❌ 取消活动
- ➕ 添加新活动
- 🔄 交换活动顺序

告诉我你的需求！`,
      journeyState: state,
    };
  }

  /**
   * 处理通用对话
   */
  private async handleGeneralChat(request: JourneyAssistantRequest, state: JourneyState): Promise<JourneyAssistantResponse> {
    return {
      message: `I'm your journey assistant! 🧳

I can help you with:
- 📍 Find nearby places
- 📅 Check your schedule
- 🗺️ Navigation
- 🍽️ Recommendations
- 🚨 Emergency assistance

What do you need?`,
      messageCN: `我是你的行程助手！🧳

我可以帮你：
- 📍 查找附近地点
- 📅 查看行程安排
- 🗺️ 导航
- 🍽️ 推荐
- 🚨 紧急求助

需要什么帮助？`,
      journeyState: state,
    };
  }

  // ==================== 主动提醒系统 ====================

  /**
   * 定时检查并生成提醒（每30分钟）
   */
  @Cron('0 */30 * * * *')
  async proactiveReminderCheck(): Promise<void> {
    this.logger.debug('[行程助手] 执行主动提醒检查');
    
    try {
      // 获取所有活跃行程
      const activeTrips = await this.getActiveTrips();
      
      for (const tripId of activeTrips) {
        const state = this.journeyStates.get(tripId);
        if (!state) continue;
        
        const reminders = await this.generateReminders(state);
        const urgentReminders = reminders.filter(r => r.priority === 'urgent' || r.priority === 'high');
        
        if (urgentReminders.length > 0) {
          await this.sendPushNotifications(state.userId, tripId, urgentReminders);
        }
      }
    } catch (error: any) {
      this.logger.error(`[行程助手] 主动提醒检查失败: ${error.message}`);
    }
  }

  /**
   * 生成提醒
   */
  private async generateReminders(state: JourneyState): Promise<Reminder[]> {
    const reminders: Reminder[] = [];
    const now = new Date();

    // 基于当前行程阶段生成提醒
    switch (state.phase) {
      case 'PRE_TRIP':
        reminders.push(...this.generatePreTripReminders(state, now));
        break;
      case 'DEPARTURE_DAY':
        reminders.push(...this.generateDepartureDayReminders(state, now));
        break;
      case 'ON_TRIP':
        reminders.push(...this.generateOnTripReminders(state, now));
        break;
      case 'RETURN_DAY':
        reminders.push(...this.generateReturnDayReminders(state, now));
        break;
    }

    return reminders.sort((a, b) => 
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );
  }

  /**
   * 生成出发前提醒
   */
  private generatePreTripReminders(state: JourneyState, now: Date): Reminder[] {
    return [
      {
        id: uuidv4(),
        type: 'DOCUMENT',
        title: 'Check your documents',
        titleCN: '检查证件',
        message: "Make sure you have your passport, visa (if needed), and travel insurance.",
        messageCN: '确保你已准备好护照、签证（如需要）和旅行保险。',
        priority: 'high',
        scheduledAt: now.toISOString(),
        actionRequired: true,
        actions: [
          { action: 'mark_done', label: 'Done', labelCN: '已完成' },
          { action: 'view_checklist', label: 'View checklist', labelCN: '查看清单' },
        ],
      },
      {
        id: uuidv4(),
        type: 'PACKING',
        title: 'Start packing',
        titleCN: '开始打包',
        message: 'Your trip is in 3 days. Time to start packing!',
        messageCN: '距离出发还有3天，是时候开始打包了！',
        priority: 'medium',
        scheduledAt: now.toISOString(),
        actions: [
          { action: 'view_packing_list', label: 'View packing list', labelCN: '查看打包清单' },
        ],
      },
    ];
  }

  /**
   * 生成出发当天提醒
   */
  private generateDepartureDayReminders(state: JourneyState, now: Date): Reminder[] {
    return [
      {
        id: uuidv4(),
        type: 'FLIGHT',
        title: 'Flight departure reminder',
        titleCN: '航班出发提醒',
        message: 'Your flight departs in 4 hours. Time to head to the airport!',
        messageCN: '你的航班将在4小时后起飞，是时候出发去机场了！',
        priority: 'urgent',
        scheduledAt: now.toISOString(),
        actionRequired: true,
        actions: [
          { action: 'view_flight_details', label: 'View flight', labelCN: '查看航班' },
          { action: 'navigate_airport', label: 'Navigate to airport', labelCN: '导航到机场' },
        ],
      },
    ];
  }

  /**
   * 生成旅途中提醒
   */
  private generateOnTripReminders(state: JourneyState, now: Date): Reminder[] {
    const reminders: Reminder[] = [];
    
    // 今日活动提醒
    state.todaySchedule.forEach(item => {
      if (item.status === 'upcoming') {
        const startTime = new Date(item.startTime);
        const timeDiff = startTime.getTime() - now.getTime();
        
        // 1小时内的活动
        if (timeDiff > 0 && timeDiff <= 60 * 60 * 1000) {
          reminders.push({
            id: uuidv4(),
            type: 'ACTIVITY',
            title: `Upcoming: ${item.title}`,
            titleCN: `即将开始：${item.titleCN}`,
            message: `${item.title} starts in ${Math.round(timeDiff / 60000)} minutes.`,
            messageCN: `${item.titleCN} 将在 ${Math.round(timeDiff / 60000)} 分钟后开始。`,
            priority: 'medium',
            scheduledAt: now.toISOString(),
            relatedItemId: item.id,
            actions: [
              { action: 'navigate', label: 'Navigate', labelCN: '导航' },
              { action: 'view_details', label: 'View details', labelCN: '查看详情' },
            ],
          });
        }
      }
    });

    return reminders;
  }

  /**
   * 生成返程当天提醒
   */
  private generateReturnDayReminders(state: JourneyState, now: Date): Reminder[] {
    return [
      {
        id: uuidv4(),
        type: 'FLIGHT',
        title: 'Return flight reminder',
        titleCN: '返程航班提醒',
        message: "Don't forget to check out and head to the airport!",
        messageCN: '别忘了退房并前往机场！',
        priority: 'urgent',
        scheduledAt: now.toISOString(),
        actions: [
          { action: 'view_flight', label: 'View flight', labelCN: '查看航班' },
          { action: 'checkout_reminder', label: 'Hotel checkout', labelCN: '酒店退房' },
        ],
      },
    ];
  }

  // ==================== 辅助方法 ====================

  /**
   * 加载行程状态
   */
  private async loadJourneyState(tripId: string, userId: string): Promise<JourneyState> {
    let state = this.journeyStates.get(tripId);
    
    if (!state) {
      // 创建新状态
      state = {
        tripId,
        userId,
        phase: 'ON_TRIP',
        currentDay: 1,
        totalDays: 10,
        currentDate: new Date().toISOString().split('T')[0],
        todaySchedule: this.generateSampleSchedule(),
        upcomingReminders: [],
        activeEvents: [],
        pendingDecisions: [],
        stats: {
          completedActivities: 3,
          totalActivities: 15,
          spentBudget: 1200,
          totalBudget: 5000,
        },
        lastUpdated: new Date().toISOString(),
      };
      this.journeyStates.set(tripId, state);
    }
    
    return state;
  }

  /**
   * 保存行程状态
   */
  private async saveJourneyState(state: JourneyState): Promise<void> {
    state.lastUpdated = new Date().toISOString();
    this.journeyStates.set(state.tripId, state);
  }

  /**
   * 生成示例日程
   */
  private generateSampleSchedule(): ScheduleItem[] {
    const today = new Date().toISOString().split('T')[0];
    return [
      {
        id: 's1',
        type: 'activity',
        title: 'Golden Circle Tour',
        titleCN: '黄金圈一日游',
        startTime: `${today}T09:00:00`,
        endTime: `${today}T17:00:00`,
        location: {
          name: 'Thingvellir',
          nameCN: '辛格维利尔',
          lat: 64.2559,
          lng: -21.1298,
        },
        status: 'in_progress',
      },
      {
        id: 's2',
        type: 'meal',
        title: 'Dinner at Grillið',
        titleCN: '在Grillið晚餐',
        startTime: `${today}T19:00:00`,
        endTime: `${today}T21:00:00`,
        location: {
          name: 'Grillið Restaurant',
          nameCN: 'Grillið餐厅',
          lat: 64.1466,
          lng: -21.9426,
        },
        status: 'upcoming',
      },
    ];
  }

  /**
   * 分析意图
   */
  private async analyzeIntent(message: string, state: JourneyState): Promise<JourneyIntent> {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('附近') || lowerMessage.includes('nearby') || 
        lowerMessage.includes('where') || lowerMessage.includes('哪里')) {
      return 'NEARBY_SEARCH';
    }
    
    if (lowerMessage.includes('行程') || lowerMessage.includes('schedule') ||
        lowerMessage.includes('今天') || lowerMessage.includes('today')) {
      return 'SCHEDULE_QUERY';
    }
    
    if (lowerMessage.includes('导航') || lowerMessage.includes('navigate') ||
        lowerMessage.includes('怎么去') || lowerMessage.includes('how to get')) {
      return 'NAVIGATION';
    }
    
    if (lowerMessage.includes('推荐') || lowerMessage.includes('recommend') ||
        lowerMessage.includes('建议') || lowerMessage.includes('suggest')) {
      return 'RECOMMENDATION';
    }
    
    if (lowerMessage.includes('紧急') || lowerMessage.includes('emergency') ||
        lowerMessage.includes('帮助') || lowerMessage.includes('help') ||
        lowerMessage.includes('sos')) {
      return 'EMERGENCY';
    }
    
    if (lowerMessage.includes('改') || lowerMessage.includes('调整') ||
        lowerMessage.includes('change') || lowerMessage.includes('adjust') ||
        lowerMessage.includes('cancel') || lowerMessage.includes('取消')) {
      return 'ADJUSTMENT';
    }
    
    return 'GENERAL';
  }

  /**
   * 生成状态消息
   */
  private generateStatusMessage(state: JourneyState): { en: string; cn: string } {
    return {
      en: `📍 Day ${state.currentDay} of ${state.totalDays}

Current status: ${state.phase.replace('_', ' ')}
Today's activities: ${state.todaySchedule.length}
Completed: ${state.stats.completedActivities}/${state.stats.totalActivities}
Budget used: $${state.stats.spentBudget}/$${state.stats.totalBudget}`,
      cn: `📍 第 ${state.currentDay} 天 / 共 ${state.totalDays} 天

当前状态：${this.translatePhase(state.phase)}
今日活动：${state.todaySchedule.length} 项
已完成：${state.stats.completedActivities}/${state.stats.totalActivities}
已用预算：¥${state.stats.spentBudget * 7}/¥${state.stats.totalBudget * 7}`,
    };
  }

  /**
   * 翻译阶段
   */
  private translatePhase(phase: TripPhase): string {
    const translations: Record<TripPhase, string> = {
      PRE_TRIP: '出发前',
      DEPARTURE_DAY: '出发当天',
      ON_TRIP: '旅途中',
      RETURN_DAY: '返程当天',
      POST_TRIP: '旅行结束',
    };
    return translations[phase] || phase;
  }

  /**
   * 获取建议操作
   */
  private getSuggestedActions(state: JourneyState): JourneyAssistantResponse['suggestedActions'] {
    return [
      { action: 'view_schedule', label: "View today's schedule", labelCN: '查看今日行程' },
      { action: 'nearby_food', label: 'Find food nearby', labelCN: '附近美食' },
      { action: 'get_reminders', label: 'View reminders', labelCN: '查看提醒' },
    ];
  }

  /**
   * 获取当前活动
   */
  private getCurrentActivity(state: JourneyState): ScheduleItem | undefined {
    return state.todaySchedule.find(item => item.status === 'in_progress');
  }

  /**
   * 生成应急方案
   */
  private async generateEmergencyOptions(event: TripEvent, state: JourneyState): Promise<EmergencyOption[]> {
    // 根据事件类型生成应急方案
    if (event.type === 'FLIGHT_DELAY') {
      return [
        {
          id: 'opt1',
          name: 'Wait for delayed flight',
          nameCN: '等待延误航班',
          description: 'Wait at the airport for your rescheduled flight',
          descriptionCN: '在机场等待改签后的航班',
          impact: { time: '+3 hours', cost: 'No extra cost', experience: 'Some inconvenience' },
          impactCN: { time: '+3小时', cost: '无额外费用', experience: '稍有不便' },
          recommended: true,
          actions: [
            { action: 'confirm_wait', label: 'Wait', labelCN: '等待', autoExecutable: false },
          ],
        },
        {
          id: 'opt2',
          name: 'Rebook to next available',
          nameCN: '改签到下一班',
          description: 'Book the next available flight to your destination',
          descriptionCN: '改签到下一个可用航班',
          impact: { time: '+6 hours', cost: 'May have extra fees', experience: 'More waiting' },
          impactCN: { time: '+6小时', cost: '可能有改签费', experience: '等待更久' },
          recommended: false,
          actions: [
            { action: 'rebook', label: 'Rebook', labelCN: '改签', autoExecutable: false },
          ],
        },
      ];
    }
    
    return [];
  }

  /**
   * 执行选择的方案
   */
  private async executeSelectedOption(
    request: JourneyAssistantRequest, 
    state: JourneyState, 
    event: TripEvent
  ): Promise<JourneyAssistantResponse> {
    return {
      message: `Got it! I've noted your choice. Here's what happens next...`,
      messageCN: `收到！我已记录你的选择。接下来...`,
      journeyState: state,
    };
  }

  /**
   * 生成事件消息
   */
  private generateEventMessage(event: TripEvent): { en: string; cn: string } {
    return {
      en: `🚨 ${event.title}\n\n${event.description}\n\nSeverity: ${event.severity}`,
      cn: `🚨 ${event.titleCN}\n\n${event.descriptionCN}\n\n严重程度：${this.translateSeverity(event.severity)}`,
    };
  }

  /**
   * 翻译严重程度
   */
  private translateSeverity(severity: string): string {
    const translations: Record<string, string> = {
      info: '提示',
      warning: '警告',
      critical: '紧急',
    };
    return translations[severity] || severity;
  }

  /**
   * 提取搜索类型
   */
  private extractSearchType(message: string): string {
    if (message.includes('餐') || message.includes('吃') || message.includes('food') || message.includes('restaurant')) {
      return 'restaurants';
    }
    if (message.includes('咖啡') || message.includes('coffee')) {
      return 'cafes';
    }
    if (message.includes('景点') || message.includes('attraction')) {
      return 'attractions';
    }
    return 'places';
  }

  /**
   * 翻译搜索类型
   */
  private translateSearchType(type: string): string {
    const translations: Record<string, string> = {
      restaurants: '餐厅',
      cafes: '咖啡店',
      attractions: '景点',
      places: '地点',
    };
    return translations[type] || type;
  }

  /**
   * 获取活跃行程
   */
  private async getActiveTrips(): Promise<string[]> {
    return Array.from(this.journeyStates.keys());
  }

  /**
   * 发送推送通知
   */
  private async sendPushNotifications(userId: string, tripId: string, reminders: Reminder[]): Promise<void> {
    for (const reminder of reminders) {
      const notification: PushNotification = {
        userId,
        tripId,
        type: 'reminder',
        title: reminder.title,
        titleCN: reminder.titleCN,
        body: reminder.message,
        bodyCN: reminder.messageCN,
        priority: reminder.priority,
        sentAt: new Date().toISOString(),
      };
      this.notificationQueue.push(notification);
      this.logger.debug(`[行程助手] 推送通知: ${reminder.title}`);
    }
  }

  /**
   * 创建错误响应
   */
  private createErrorResponse(errorMessage: string): JourneyAssistantResponse {
    return {
      message: `Sorry, something went wrong: ${errorMessage}`,
      messageCN: `抱歉，出现了问题：${errorMessage}`,
    };
  }
}

import { Injectable } from '@nestjs/common';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { isAgentTripComprehensiveAnalysisMessage } from '../utils/agent-readiness-phase.util';
import { resolveRouteAndRunUserMessage } from '../utils/resolve-route-and-run-message.util';

/**
 * 已有行程复盘/咨询：即使前端误传 intent_mode=TRIP_PLANNING，也不应 REDIRECT 到规划工作台。
 * （真正分析仍依赖客户端传 trip_id；此处只避免误跳转。）
 */
export function isExistingTripReviewOrConsultMessage(message: string): boolean {
  const msg = message.trim();
  if (!msg) return false;
  if (isAgentTripComprehensiveAnalysisMessage(msg)) return true;
  return /(?:当前行程|行程.*可行性|可行性.*行程|整体可行性|需要改进|行程体检|全面体检|有什么问题|可以优化|哪里需要改|怎么改进)/i.test(
    msg,
  );
}

@Injectable()
export class PlanningRequestClassifierService {
  /**
   * 判断是否是“从零规划”请求（需要重定向到规划工作台）。
   *
   * 核心原则：只拦截从零开始的行程规划请求，不拦截已有行程的查询/修改/复盘请求。
   */
  isPlanningRequest(request: RouteAndRunRequestDto): boolean {
    const message = resolveRouteAndRunUserMessage(request).toLowerCase().trim();
    const hasNoTripId = !request.trip_id || request.trip_id === '';
    const intentMode = request.options?.intent_mode;

    // 如果已有 trip_id，肯定不是规划请求（可能是查询已有行程的规划）
    if (!hasNoTripId) {
      return false;
    }

    // 复盘/可行性/改进：优先于 intent_mode 短路（侧栏常误传 TRIP_PLANNING 且漏传 trip_id）
    if (isExistingTripReviewOrConsultMessage(message)) {
      return false;
    }

    if (intentMode === 'TRIP_PLANNING') {
      return true;
    }

    if (intentMode === 'DATA_LOOKUP' || intentMode === 'GENERIC_QA') {
      return false;
    }

    // 白名单：明确不是规划请求的关键词
    const excludeKeywords = [
      '查询规划',
      '查看规划',
      '显示规划',
      '规划查询',
      '规划详情',
      'query plan',
      'show plan',
      'view plan',
      'display plan',
      'plan details',
    ];

    if (excludeKeywords.some(keyword => message.includes(keyword))) {
      return false;
    }

    // 规则1: 明确包含规划关键词
    const planningKeywords = [
      '规划',
      'plan',
      '设计',
      '制定',
      '安排',
      '行程规划',
      '帮我规划',
      '帮我设计',
      '帮我安排',
      '生成行程',
      'create a trip',
      'plan a trip',
      'design itinerary',
      'make itinerary',
    ];

    const hasPlanningKeyword = planningKeywords.some(keyword =>
      message.includes(keyword),
    );

    // 规则2: 明确提到"新行程"、"第一次"等
    const isNewTrip = /(?:新|第一次|first time|new trip)/.test(message);

    // 规则3: 包含目的地和天数（更严格：必须同时有目的地+天数+规划关键词）
    const destinationPattern =
      /(?:去|到|visit|go to|travel to)\s+([\u4e00-\u9fa5]{2,}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/;
    const daysPattern = /\d+\s*(?:天|days?|day)/;
    const hasDestinationAndDays =
      destinationPattern.test(message) &&
      daysPattern.test(message) &&
      hasPlanningKeyword; // 必须同时有规划关键词

    // 规则4: 包含"从零开始"、"从头规划"等明确表达
    const isFromScratch =
      /(?:从零开始|从头规划|from scratch|start from)/.test(message);

    return (
      hasPlanningKeyword || isNewTrip || hasDestinationAndDays || isFromScratch
    );
  }
}

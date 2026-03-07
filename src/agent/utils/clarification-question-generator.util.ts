/**
 * 澄清问题生成工具
 * P3 B: 从 Orchestrator 提取，供 IntakeExecutor 与 Orchestrator 共用
 */

import type { ClarificationQuestion } from '../interfaces/clarification.interface';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';

export type IntakeGapType =
  | 'MISSING_DESTINATION'
  | 'MISSING_DATES'
  | 'MISSING_CONSTRAINTS'
  | 'MISSING_PREFERENCES';

export interface IntakeGap {
  type: IntakeGapType;
  severity: 'HARD' | 'SOFT';
  detail: string;
}

/**
 * 识别缺口（降级模式）
 * 当 PlannerAgent 不可用时，使用简单规则识别缺口
 */
export function identifyGapsFromRequest(tripPlanRequest: TripPlanRequest): IntakeGap[] {
  const gaps: IntakeGap[] = [];

  if (!tripPlanRequest.destination || tripPlanRequest.destination === '未指定') {
    gaps.push({
      type: 'MISSING_DESTINATION',
      severity: 'HARD',
      detail: '缺少目的地信息',
    });
  }

  if (!tripPlanRequest.start_date && !tripPlanRequest.date_range) {
    gaps.push({
      type: 'MISSING_DATES',
      severity: 'HARD',
      detail: '缺少出行日期信息',
    });
  }

  if (!tripPlanRequest.party?.count || tripPlanRequest.party.count <= 0) {
    gaps.push({
      type: 'MISSING_CONSTRAINTS',
      severity: 'HARD',
      detail: '缺少同行人数信息',
    });
  }

  return gaps;
}

/**
 * 根据缺口生成结构化澄清问题
 */
export function generateClarificationQuestions(
  gaps: IntakeGap[],
  tripPlanRequest: TripPlanRequest,
): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];
  let questionId = 1;

  for (const gap of gaps) {
    switch (gap.type) {
      case 'MISSING_DESTINATION':
        questions.push({
          id: `question-${questionId++}`,
          question: '请选择您的目的地',
          type: 'text',
          required: true,
          placeholder: '例如：冰岛、日本、瑞士',
          hint: '这将帮助我们为您推荐合适的景点和活动',
        });
        break;

      case 'MISSING_DATES': {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const twoYearsLater = new Date();
        twoYearsLater.setFullYear(twoYearsLater.getFullYear() + 2);

        questions.push({
          id: `question-${questionId++}`,
          question: '请选择您的出行日期',
          type: 'date',
          required: true,
          hint: '建议选择 1 个月后的日期，以便提前预订',
          validation: {
            min: tomorrow.getTime(),
            max: twoYearsLater.getTime(),
          },
        });

        if (tripPlanRequest.start_date || tripPlanRequest.date_range?.start_date) {
          questions.push({
            id: `question-${questionId++}`,
            question: '请选择您的返回日期',
            type: 'date',
            required: true,
            hint: '返回日期必须晚于出发日期',
            validation: {
              min: tripPlanRequest.start_date
                ? new Date(tripPlanRequest.start_date).getTime()
                : tripPlanRequest.date_range?.start_date
                  ? new Date(tripPlanRequest.date_range.start_date).getTime()
                  : tomorrow.getTime(),
              max: twoYearsLater.getTime(),
            },
          });
        }
        break;
      }

      case 'MISSING_CONSTRAINTS':
        questions.push({
          id: `question-${questionId++}`,
          question: '同行人数',
          type: 'single_choice',
          required: true,
          options: ['1人', '2人', '3-4人', '5人以上'],
          hint: '这将影响住宿和交通安排',
        });
        questions.push({
          id: `question-${questionId++}`,
          question: '总预算（人民币）',
          type: 'number',
          required: true,
          placeholder: '例如：100000',
          hint: '包含机票、住宿、餐饮、活动等所有费用',
          validation: { min: 100, max: 1000000 },
        });
        break;

      case 'MISSING_PREFERENCES':
        questions.push({
          id: `question-${questionId++}`,
          question: '您的主要兴趣（可多选）',
          type: 'multi_choice',
          required: false,
          options: ['极光', '冰川', '温泉', '文化', '美食', '户外运动', '购物', '摄影'],
          hint: '帮助我们为您推荐合适的景点和活动',
        });
        questions.push({
          id: `question-${questionId++}`,
          question: '节奏偏好',
          type: 'single_choice',
          required: false,
          options: ['轻松', '平衡', '紧凑'],
          hint: '轻松：每天安排较少活动；平衡：适中安排；紧凑：尽可能多安排活动',
          default: '平衡',
        });
        break;
    }
  }

  return questions;
}

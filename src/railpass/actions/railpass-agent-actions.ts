// src/railpass/actions/railpass-agent-actions.ts

/**
 * RailPass Agent Actions
 * 
 * 为 Agent 系统提供 RailPass 相关的工具函数
 */

import { Action, ActionKind, ActionCost, ActionSideEffect } from '../../agent/interfaces/action.interface';
import { RailPassService } from '../railpass.service';

/**
 * 创建 RailPass Agent Actions
 */
export function createRailPassActions(
  railPassService: RailPassService
): Action[] {
  return [
    {
      name: 'railpass.eligibilityCheck',
      description: '检查用户是否符合 Eurail/Interrail 购买资格，判断应该使用哪种 Pass',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['user.residency_country', 'trip.destinations'],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          residencyCountry: { type: 'string', description: '用户居住国（ISO 3166-1 alpha-2）' },
          travelCountries: { type: 'array', items: { type: 'string' }, description: '旅行国家集合' },
          isCrossResidencyCountry: { type: 'boolean', description: '是否跨居住国' },
          departureDate: { type: 'string', description: '出行日期' },
        },
        required: ['residencyCountry', 'travelCountries', 'departureDate'],
      },
      output_schema: {
        type: 'object',
        properties: {
          eligible: { type: 'boolean' },
          recommendedPassFamily: { type: 'string', enum: ['EURAIL', 'INTERRAIL'] },
          constraints: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
        },
      },
      execute: async (input: {
        residencyCountry: string;
        travelCountries: string[];
        isCrossResidencyCountry?: boolean;
        departureDate: string;
      }) => {
        return await railPassService.checkEligibility(input);
      },
    },
    {
      name: 'railpass.recommendPass',
      description: '根据行程特征推荐合适的 Pass 配置（Global/OneCountry, Flexi/Continuous, class, mobile/paper）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['trip.destinations', 'trip.duration'],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          residencyCountry: { type: 'string' },
          travelCountries: { type: 'array', items: { type: 'string' } },
          estimatedRailSegments: { type: 'number' },
          crossCountryCount: { type: 'number' },
          isDailyTravel: { type: 'boolean' },
          stayMode: { type: 'string', enum: ['city_hopping', 'stay_extended'] },
          budgetSensitivity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          tripDurationDays: { type: 'number' },
          tripDateRange: {
            type: 'object',
            properties: {
              start: { type: 'string' },
              end: { type: 'string' },
            },
          },
          passFamily: { type: 'string', enum: ['EURAIL', 'INTERRAIL'] },
          preferences: { type: 'object' },
        },
        required: [
          'residencyCountry',
          'travelCountries',
          'estimatedRailSegments',
          'crossCountryCount',
          'isDailyTravel',
          'stayMode',
          'budgetSensitivity',
          'tripDurationDays',
          'tripDateRange',
          'passFamily',
        ],
      },
      output_schema: {
        type: 'object',
        properties: {
          recommendedProfile: { type: 'object' },
          explanation: { type: 'string' },
        },
      },
      execute: async (input: any) => {
        return await railPassService.recommendPass(input);
      },
    },
    {
      name: 'railpass.checkReservation',
      description: '检查单个 rail segment 是否需要订座，评估费用、风险、订座渠道',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['railpass.segment'],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          segment: {
            type: 'object',
            description: 'Rail Segment',
          },
        },
        required: ['segment'],
      },
      output_schema: {
        type: 'object',
        properties: {
          required: { type: 'boolean' },
          mandatoryReasonCode: { type: 'string' },
          feeEstimate: { type: 'object' },
          quotaRisk: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          bookingChannels: { type: 'array', items: { type: 'string' } },
        },
      },
      execute: async (input: { segment: any }) => {
        return await railPassService.checkReservation(input.segment);
      },
    },
    {
      name: 'railpass.planReservations',
      description: '为所有 rail segments 生成订座任务列表，评估违规，提供备用方案',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.MEDIUM,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['railpass.segments'],
        idempotent: true,
        cacheable: false,
      },
      input_schema: {
        type: 'object',
        properties: {
          segments: { type: 'array', items: { type: 'object' } },
          userPreferences: { type: 'object' },
        },
        required: ['segments'],
      },
      output_schema: {
        type: 'object',
        properties: {
          reservationTasks: { type: 'array' },
          violations: { type: 'array' },
          fallbackOptions: { type: 'array' },
          totalFeeEstimate: { type: 'object' },
          overallRisk: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
        },
      },
      execute: async (input: any) => {
        return await railPassService.planReservations(input);
      },
    },
    {
      name: 'railpass.simulateTravelDays',
      description: '计算 Flexi Pass 的 Travel Day 消耗（考虑跨午夜规则）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['railpass.pass_profile', 'railpass.segments'],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          segments: { type: 'array', items: { type: 'object' } },
          passProfile: { type: 'object' },
        },
        required: ['segments', 'passProfile'],
      },
      output_schema: {
        type: 'object',
        properties: {
          totalDaysUsed: { type: 'number' },
          daysByDate: { type: 'object' },
          remainingDays: { type: 'number' },
          violations: { type: 'array' },
        },
      },
      execute: async (input: any) => {
        return await railPassService.simulateTravelDays(input);
      },
    },
    {
      name: 'railpass.validateCompliance',
      description: '验证行程计划是否符合 RailPass 规则（居住国使用、Travel Day 预算、订座要求等）',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.MEDIUM,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['railpass.pass_profile', 'railpass.segments'],
        idempotent: true,
        cacheable: false,
      },
      input_schema: {
        type: 'object',
        properties: {
          passProfile: { type: 'object' },
          segments: { type: 'array', items: { type: 'object' } },
          reservationTasks: { type: 'array', items: { type: 'object' } },
        },
        required: ['passProfile', 'segments'],
      },
      output_schema: {
        type: 'object',
        properties: {
          valid: { type: 'boolean' },
          violations: { type: 'array' },
          warnings: { type: 'array' },
        },
      },
      execute: async (input: any) => {
        const result = await railPassService.validateCompliance(input);
        const explanation = railPassService.generateUserExplanation(result);
        return {
          ...result,
          explanation,
        };
      },
    },
    {
      name: 'railpass.generateUserExplanation',
      description: '生成用户友好的 RailPass 规则解释',
      metadata: {
        kind: ActionKind.INTERNAL,
        cost: ActionCost.LOW,
        side_effect: ActionSideEffect.NONE,
        preconditions: ['railpass.compliance_result'],
        idempotent: true,
        cacheable: true,
      },
      input_schema: {
        type: 'object',
        properties: {
          complianceResult: { type: 'object' },
        },
        required: ['complianceResult'],
      },
      output_schema: {
        type: 'object',
        properties: {
          explanation: { type: 'string' },
        },
      },
      execute: async (input: { complianceResult: any }) => {
        const explanation = railPassService.generateUserExplanation(input.complianceResult);
        return { explanation };
      },
    },
  ];
}

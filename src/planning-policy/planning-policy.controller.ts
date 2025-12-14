// src/planning-policy/planning-policy.controller.ts
import { Controller, Post, Body, Get, Param, UsePipes } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';
import {
  RobustnessEvaluatorService,
  MapPoiLookup,
  RobustnessMetrics,
} from './services/robustness-evaluator.service';
import type { OptimizationSuggestion, WhatIfReport } from './services/robustness-evaluator.service';
import { PlaceToPoiHelperService } from './services/place-to-poi-helper.service';
import { EvaluateWhatIfReportDto } from './dto/evaluate-whatif-report.dto';
import { ReEvaluateAfterApplyDto } from './dto/re-evaluate-after-apply.dto';
import { PlanningPolicy } from './interfaces/planning-policy.interface';
import { DayScheduleResult } from './interfaces/scheduler.interface';
import { Poi } from './interfaces/poi.interface';
import { successResponse, errorResponse, ErrorCode, StandardResponse } from '../common/dto/standard-response.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('planning-policy')
@Controller('planning-policy')
export class PlanningPolicyController {
  constructor(
    private readonly robustnessEvaluatorService: RobustnessEvaluatorService,
    private readonly placeToPoiHelper: PlaceToPoiHelperService
  ) {}

  @Post('what-if/evaluate')
  @ApiOperation({
    summary: 'What-If 评估报告',
    description:
      '生成 What-If 评估报告，自动生成 2~3 个候选方案并评估对比。\n\n' +
      '**核心功能**：\n' +
      '1. 评估原计划的稳健度（base）\n' +
      '2. 根据优化建议生成候选方案（SHIFT_EARLIER / SWAP_NEIGHBOR）\n' +
      '3. 评估每个候选方案的稳健度（同预算、派生 seed）\n' +
      '4. 计算改善指标（deltaSummary、impactCost、confidence、drivers）\n' +
      '5. 两段式 winner 选择（收益优先 + 改动更小）\n\n' +
      '**POI 数据来源**：\n' +
      '- **方式 1（推荐）**：提供 `placeIds` 数组，系统会自动从数据库查询 Place 并转换为 Poi\n' +
      '- **方式 2**：直接提供 `poiLookup` 对象（手动构建的 POI 数据）\n' +
      '- 两种方式二选一即可，优先使用 `placeIds`\n\n' +
      '**评估元数据（meta）**：\n' +
      '- baseSamples：Base 评估使用的 samples（默认 300）\n' +
      '- candidateSamples：候选评估使用的 samples（默认 300）\n' +
      '- confirmSamples：复评使用的 samples（默认 600）\n' +
      '- baseSeed：Base seed（用于派生候选 seed）\n\n' +
      '**返回内容**：\n' +
      '- base：原计划候选方案\n' +
      '- candidates：备选方案列表（2~3 个）\n' +
      '- winnerId：自动推荐的方案 ID（可选）\n' +
      '- riskWarning：风险红线提示（可选）\n' +
      '- meta：评估元数据',
  })
  @ApiBody({
    type: EvaluateWhatIfReportDto,
    description: 'What-If 评估请求参数',
    examples: {
      standard: {
        summary: '标准评估示例',
        value: {
          policy: {
            pacing: {
              hpMax: 100,
              regenRate: 0.3,
              walkSpeedMin: 75,
              forcedRestIntervalMin: 120,
            },
            constraints: {
              maxSingleWalkMin: 30,
              requireWheelchairAccess: false,
              forbidStairs: false,
            },
            weights: {
              tagAffinity: { 'ATTRACTION': 1.0, 'RESTAURANT': 1.2 },
              walkPainPerMin: 0.5,
              overtimePenaltyPerMin: 1.0,
            },
          },
          schedule: {
            stops: [
              {
                kind: 'POI',
                id: 'poi-1',
                name: '景点A',
                startMin: 540,
                endMin: 660,
                lat: 35.6762,
                lng: 139.6503,
              },
            ],
            metrics: {
              totalTravelMin: 120,
              totalWalkMin: 60,
              totalTransfers: 0,
              totalQueueMin: 10,
              overtimeMin: 0,
              hpEnd: 85,
            },
          },
          dayEndMin: 1200,
          dateISO: '2026-12-25',
          dayOfWeek: 0,
          poiLookup: {
            'poi-1': {
              id: 'poi-1',
              name: '景点A',
              lat: 35.6762,
              lng: 139.6503,
              tags: ['ATTRACTION'],
              avgVisitMin: 120,
              openingHours: {
                windows: [{ dayOfWeek: 0, start: '09:00', end: '18:00' }],
                lastEntry: '17:00',
              },
            },
          },
          config: {
            samples: 300,
            seed: 42,
          },
          suggestions: [
            {
              type: 'SHIFT_EARLIER',
              poiId: 'poi-1',
              minutes: 35,
              reason: '入场裕量偏紧',
            },
          ],
          budgetStrategy: {
            baseSamples: 300,
            candidateSamples: 300,
            confirmSamples: 600,
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回 What-If 评估报告',
    schema: {
      type: 'object',
      example: {
        base: {
          id: 'BASE',
          title: '原计划',
          description: '当前生成的行程',
          schedule: {},
          metrics: {
            timeWindowMissProb: 0.18,
            windowWaitProb: 0.42,
            completionRateP10: 0.68,
            onTimeProb: 0.72,
          },
        },
        candidates: [
          {
            id: 'SHIFT:poi-1:35',
            title: '提前 35 分钟',
            description: 'poi-1 前移 35 分钟（最小扰动）',
            schedule: {},
            metrics: {
              timeWindowMissProb: 0.06,
              windowWaitProb: 0.30,
              completionRateP10: 0.82,
              onTimeProb: 0.78,
            },
            deltaSummary: {
              missDelta: -0.12,
              waitDelta: -0.12,
              completionP10Delta: 0.14,
              onTimeDelta: 0.06,
            },
            impactCost: {
              timeShiftAbsSumMin: 175,
              movedStopCount: 5,
              poiOrderChanged: false,
              severity: 'MEDIUM',
            },
            confidence: {
              level: 'HIGH',
              reason: 'Miss ↓12pp, CompletionP10 ↑14pp',
            },
            explainTopDrivers: [
              { driver: 'COMPLETION_P10', deltaPp: 14 },
              { driver: 'MISS', deltaPp: 12 },
            ],
            action: {
              type: 'SHIFT_EARLIER',
              poiId: 'poi-1',
              minutes: 35,
            },
          },
        ],
        winnerId: 'SHIFT:poi-1:35',
        riskWarning: undefined,
        meta: {
          baseSamples: 300,
          candidateSamples: 300,
          confirmSamples: 600,
          baseSeed: 42,
        },
      },
    },
  })
  @ApiResponse({ 
    status: 200, 
    description: '成功返回 What-If 评估报告（统一响应格式）',
    type: ApiSuccessResponseDto,
  })
  @ApiResponse({ 
    status: 200, 
    description: '请求参数无效（统一响应格式）',
    type: ApiErrorResponseDto,
  })
  async evaluateWhatIfReport(@Body() dto: EvaluateWhatIfReportDto): Promise<StandardResponse<WhatIfReport>> {
    try {
      // 验证：必须提供 poiLookup 或 placeIds 之一
      if ((!dto.placeIds || dto.placeIds.length === 0) && !dto.poiLookup) {
        throw new Error('必须提供 poiLookup 或 placeIds 之一');
      }
      
      // 如果提供了 poiLookup，验证它必须是对象
      if (dto.poiLookup && typeof dto.poiLookup !== 'object') {
        throw new Error('poiLookup 必须是对象');
      }

      // 优先使用 placeIds：从数据库查询并转换
      let poiLookup: MapPoiLookup;
      if (dto.placeIds && dto.placeIds.length > 0) {
        // 从数据库查询 Place 并转换为 Poi
        const poiLookupImpl = await this.placeToPoiHelper.createPoiLookup(dto.placeIds);
        
        // 转换为 MapPoiLookup
        const poiMap = new Map<string, Poi>();
        // 从 schedule.stops 中提取所有 POI ID（使用 string 格式，因为 schedule 中 id 是 string）
        const stopPoiIds = (dto.schedule?.stops || [])
          .filter((s: any) => s.kind === 'POI')
          .map((s: any) => s.id);
        
        for (const poiId of stopPoiIds) {
          const poi = poiLookupImpl.getPoiById(poiId);
          if (poi) {
            poiMap.set(poiId, poi);
          }
        }
        poiLookup = new MapPoiLookup(poiMap);
      } else if (dto.poiLookup) {
        // 使用提供的 poiLookup
        const poiMap = new Map<string, Poi>();
        for (const [key, value] of Object.entries(dto.poiLookup)) {
          poiMap.set(key, value as Poi);
        }
        poiLookup = new MapPoiLookup(poiMap);
      } else {
        throw new Error('必须提供 poiLookup 或 placeIds 之一');
      }

      // 自动生成 suggestions（如果未提供）
      let suggestions = dto.suggestions;
      if (!suggestions || suggestions.length === 0) {
        // 先评估 base，然后生成建议
        const baseMetrics = this.robustnessEvaluatorService.evaluateDayRobustness({
          policy: dto.policy as PlanningPolicy,
          schedule: dto.schedule as DayScheduleResult,
          dayEndMin: dto.dayEndMin,
          dateISO: dto.dateISO,
          dayOfWeek: dto.dayOfWeek,
          poiLookup,
          config: dto.config,
        });
        suggestions = this.robustnessEvaluatorService.generateOptimizationSuggestions(baseMetrics);
      }

      const report = await this.robustnessEvaluatorService.evaluateWhatIfReport({
        policy: dto.policy as PlanningPolicy,
        schedule: dto.schedule as DayScheduleResult,
        dayEndMin: dto.dayEndMin,
        dateISO: dto.dateISO,
        dayOfWeek: dto.dayOfWeek,
        poiLookup,
        config: dto.config,
        suggestions: suggestions.map(s => {
          if (s.type === 'SHIFT_EARLIER') {
            return {
              type: 'SHIFT_EARLIER' as const,
              poiId: s.poiId,
              minutes: s.minutes || 0,
              reason: s.reason || '',
            };
          } else if (s.type === 'REORDER_AVOID_WAIT') {
            return {
              type: 'REORDER_AVOID_WAIT' as const,
              poiId: s.poiId,
              reason: s.reason || '',
            };
          } else {
            return {
              type: 'UPGRADE_TRANSIT' as const,
              poiId: s.poiId,
              reason: s.reason || '',
            };
          }
        }),
        budgetStrategy: dto.budgetStrategy,
      });
      return successResponse(report);
    } catch (error: any) {
      console.error('evaluateWhatIfReport error:', error);
      if (error.message?.includes('必须提供') || error.message?.includes('必须是')) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      throw error;
    }
  }

  @Post('what-if/apply')
  @ApiOperation({
    summary: '应用候选方案',
    description:
      '应用 What-If 报告中的候选方案，直接将 schedule 替换为候选方案的 schedule。\n\n' +
      '**用途**：UI 点击"应用该方案"按钮后调用此接口。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        report: {
          type: 'object',
          description: 'What-If 报告（WhatIfReport）',
        },
        candidateId: {
          type: 'string',
          description: '候选方案 ID',
          example: 'SHIFT:poi-1:35',
        },
      },
      required: ['report', 'candidateId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回应用后的行程计划',
  })
  @ApiResponse({ status: 404, description: '未找到指定的候选方案' })
  async applyCandidateSchedule(
    @Body('report') report: WhatIfReport,
    @Body('candidateId') candidateId: string
  ): Promise<StandardResponse<DayScheduleResult | null>> {
    try {
      const result = await this.robustnessEvaluatorService.applyCandidateSchedule(report, candidateId);
      return successResponse(result);
    } catch (error: any) {
      return errorResponse(ErrorCode.NOT_FOUND, error.message || '未找到指定的候选方案');
    }
  }

  @Post('what-if/re-evaluate')
  @ApiOperation({
    summary: '一键复评（确认推荐方案）',
    description:
      '应用方案后，用更高 samples 复评，给出更稳定的确认结果。\n\n' +
      '**关键口径**：\n' +
      '- confirm 用更高 samples（默认 600）\n' +
      '- confirm seed 使用同一派生规则，保持"候选评估 vs 复评"一致性\n' +
      '- 差异主要来自 samples 增加，而不是 seed 变化\n\n' +
      '**推荐用法**：\n' +
      '```typescript\n' +
      'const confirmSeed = robustnessEvaluator.getSeedForCandidate(\n' +
      '  report.meta.baseSeed,\n' +
      '  report.winnerId\n' +
      ');\n' +
      'const confirmed = await reEvaluateAfterApply({\n' +
      '  ...args,\n' +
      '  config: { seed: confirmSeed },\n' +
      '});\n' +
      '```',
  })
  @ApiBody({
    type: ReEvaluateAfterApplyDto,
  })
  @ApiResponse({
    status: 200,
    description: '成功返回复评结果（RobustnessMetrics）',
  })
  async reEvaluateAfterApply(@Body() dto: ReEvaluateAfterApplyDto) {
    const poiMap = new Map<string, Poi>();
    for (const [key, value] of Object.entries(dto.poiLookup)) {
      poiMap.set(key, value as Poi);
    }
    const poiLookup = new MapPoiLookup(poiMap);

    return this.robustnessEvaluatorService.reEvaluateAfterApply({
      policy: dto.policy as PlanningPolicy,
      appliedSchedule: dto.appliedSchedule as DayScheduleResult,
      dayEndMin: dto.dayEndMin,
      dateISO: dto.dateISO,
      dayOfWeek: dto.dayOfWeek,
      poiLookup,
      reEvaluateSamples: dto.reEvaluateSamples,
      config: dto.config,
    });
  }

  @Post('what-if/risk-warning')
  @ApiOperation({
    summary: '获取候选方案的风险提示',
    description:
      '当改动很大但收益不够显著时，返回风险提示。\n\n' +
      '**规则**：\n' +
      '- impactCost.severity = HIGH\n' +
      '- 且 confidence.level !== HIGH\n' +
      '- 且 missImprovePp < 10\n' +
      '- → 输出提示："改动较大但收益有限，建议先尝试换序或局部提前（V2 支持）"',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        candidate: {
          type: 'object',
          description: '候选方案（WhatIfCandidate）',
        },
      },
      required: ['candidate'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '返回风险提示（如有）',
    schema: {
      type: 'string',
      nullable: true,
      example: '改动较大但收益有限，建议先尝试换序或局部提前（V2 支持）',
    },
  })
  async getRiskWarning(@Body('candidate') candidate: any): Promise<string | undefined> {
    return this.robustnessEvaluatorService.getRiskWarning(candidate);
  }

  @Get('seed-for-candidate/:baseSeed/:candidateId')
  @ApiOperation({
    summary: '生成候选方案的稳定 seed',
    description:
      '根据 baseSeed 和 candidateId 生成稳定的 seed，确保同一候选在任何地方评估都一致。\n\n' +
      '**规则**：`seedForCandidate = baseSeed + stableHash(candidate.id) % 100000`\n\n' +
      '**用途**：前端可以调用此接口验证 seed 派生的一致性。',
  })
  @ApiParam({
    name: 'baseSeed',
    description: 'Base seed',
    example: '42',
  })
  @ApiParam({
    name: 'candidateId',
    description: '候选方案 ID',
    example: 'SHIFT:poi-1:35',
  })
  @ApiResponse({
    status: 200,
    description: '返回派生后的 seed',
    schema: {
      type: 'number',
      example: 42000123,
    },
  })
  getSeedForCandidate(
    @Param('baseSeed') baseSeedStr: string,
    @Param('candidateId') candidateId: string
  ): { seed: number } {
    const baseSeed = parseInt(baseSeedStr, 10);
    const seed = this.robustnessEvaluatorService.getSeedForCandidate(baseSeed, candidateId);
    return { seed };
  }

  @Post('robustness/evaluate-day')
  @ApiOperation({
    summary: '仅评估 base 指标（拆分接口）',
    description:
      '只评估原计划的稳健度指标，不生成候选方案。用于分段 loading，UI 可以先秒出 base 风险。\n\n' +
      '**用途**：\n' +
      '- 快速评估当前计划的稳健度\n' +
      '- 显示风险指标（时间窗口错过概率、完成率等）\n' +
      '- 为后续生成候选方案提供基础',
  })
  @ApiBody({
    type: EvaluateWhatIfReportDto,
    description: '评估请求参数（与 what-if/evaluate 相同，但只返回 base 指标）',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回 base 稳健度指标',
    type: ApiSuccessResponseDto,
  })
  async evaluateDayRobustness(@Body() dto: EvaluateWhatIfReportDto) {
    try {
      // 构建 poiLookup（与 evaluateWhatIfReport 相同的逻辑）
      let poiLookup: MapPoiLookup;
      if (dto.placeIds && dto.placeIds.length > 0) {
        const poiLookupImpl = await this.placeToPoiHelper.createPoiLookup(dto.placeIds);
        const poiMap = new Map<string, Poi>();
        const stopPoiIds = (dto.schedule?.stops || [])
          .filter((s: any) => s.kind === 'POI')
          .map((s: any) => s.id);
        
        for (const poiId of stopPoiIds) {
          const poi = poiLookupImpl.getPoiById(poiId);
          if (poi) {
            poiMap.set(poiId, poi);
          }
        }
        poiLookup = new MapPoiLookup(poiMap);
      } else if (dto.poiLookup) {
        const poiMap = new Map<string, Poi>();
        for (const [key, value] of Object.entries(dto.poiLookup)) {
          poiMap.set(key, value as Poi);
        }
        poiLookup = new MapPoiLookup(poiMap);
      } else {
        return errorResponse(ErrorCode.VALIDATION_ERROR, '必须提供 poiLookup 或 placeIds 之一');
      }

      const metrics = this.robustnessEvaluatorService.evaluateDayRobustness({
        policy: dto.policy as PlanningPolicy,
        schedule: dto.schedule as DayScheduleResult,
        dayEndMin: dto.dayEndMin,
        dateISO: dto.dateISO,
        dayOfWeek: dto.dayOfWeek,
        poiLookup,
        config: dto.config,
      });

      return successResponse({
        metrics,
        schedule: dto.schedule,
      });
    } catch (error: any) {
      console.error('evaluateDayRobustness error:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message || '评估稳健度时发生错误');
    }
  }

  @Post('what-if/generate-candidates')
  @ApiOperation({
    summary: '只生成候选方案（拆分接口）',
    description:
      '根据 base 评估结果生成候选方案，但不运行 MC 评估。用于分段 loading，UI 可以先出候选列表。\n\n' +
      '**用途**：\n' +
      '- 快速生成优化建议\n' +
      '- 显示候选方案列表（不包含评估结果）\n' +
      '- 为后续评估候选方案提供基础',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        metrics: {
          type: 'object',
          description: 'Base 稳健度指标（从 evaluate-day 获取）',
        },
        schedule: {
          type: 'object',
          description: 'Base 行程计划（DayScheduleResult）',
        },
      },
      required: ['metrics', 'schedule'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '成功返回候选方案列表（不包含评估结果）',
    type: ApiSuccessResponseDto,
  })
  async generateCandidates(
    @Body() body: {
      metrics: RobustnessMetrics;
      schedule: DayScheduleResult;
    }
  ) {
    try {
      const suggestions = this.robustnessEvaluatorService.generateOptimizationSuggestions(
        body.metrics
      );

      // 生成候选方案（但不评估）
      const candidates = suggestions.slice(0, 3).map((suggestion, index) => {
        let title = '';
        let description = '';

        let minutes = 0;
        if (suggestion.type === 'SHIFT_EARLIER') {
          minutes = suggestion.minutes;
          title = `提前 ${minutes} 分钟`;
          description = `${suggestion.poiId} 前移 ${minutes} 分钟（${suggestion.reason}）`;
        } else if (suggestion.type === 'REORDER_AVOID_WAIT') {
          title = '换序避免等待';
          description = `调整 ${suggestion.poiId} 的顺序（${suggestion.reason}）`;
        } else {
          title = '升级交通方式';
          description = `升级 ${suggestion.poiId} 的交通方式（${suggestion.reason}）`;
        }

        return {
          id: `${suggestion.type}:${suggestion.poiId}:${minutes}`,
          title,
          description,
          suggestion,
        };
      });

      return successResponse({
        candidates,
        suggestions,
      });
    } catch (error: any) {
      console.error('generateCandidates error:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message || '生成候选方案时发生错误');
    }
  }

  @Post('what-if/evaluate-candidates')
  @ApiOperation({
    summary: '评估候选方案（拆分接口）',
    description:
      '对候选方案运行 MC 评估，返回评估结果。用于分段 loading，UI 可以最后出 winner。\n\n' +
      '**用途**：\n' +
      '- 评估候选方案的稳健度\n' +
      '- 计算改善指标（deltaSummary、impactCost、confidence）\n' +
      '- 选择 winner 方案',
  })
  @ApiBody({
    type: EvaluateWhatIfReportDto,
    description: '评估请求参数（必须提供 suggestions）',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回候选方案评估结果',
    type: ApiSuccessResponseDto,
  })
  async evaluateCandidates(@Body() dto: EvaluateWhatIfReportDto) {
    try {
      if (!dto.suggestions || dto.suggestions.length === 0) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, '必须提供 suggestions');
      }

      // 构建 poiLookup（与 evaluateWhatIfReport 相同的逻辑）
      let poiLookup: MapPoiLookup;
      if (dto.placeIds && dto.placeIds.length > 0) {
        const poiLookupImpl = await this.placeToPoiHelper.createPoiLookup(dto.placeIds);
        const poiMap = new Map<string, Poi>();
        const stopPoiIds = (dto.schedule?.stops || [])
          .filter((s: any) => s.kind === 'POI')
          .map((s: any) => s.id);
        
        for (const poiId of stopPoiIds) {
          const poi = poiLookupImpl.getPoiById(poiId);
          if (poi) {
            poiMap.set(poiId, poi);
          }
        }
        poiLookup = new MapPoiLookup(poiMap);
      } else if (dto.poiLookup) {
        const poiMap = new Map<string, Poi>();
        for (const [key, value] of Object.entries(dto.poiLookup)) {
          poiMap.set(key, value as Poi);
        }
        poiLookup = new MapPoiLookup(poiMap);
      } else {
        return errorResponse(ErrorCode.VALIDATION_ERROR, '必须提供 poiLookup 或 placeIds 之一');
      }

      // 先评估 base（用于对比）
      const baseMetrics = this.robustnessEvaluatorService.evaluateDayRobustness({
        policy: dto.policy as PlanningPolicy,
        schedule: dto.schedule as DayScheduleResult,
        dayEndMin: dto.dayEndMin,
        dateISO: dto.dateISO,
        dayOfWeek: dto.dayOfWeek,
        poiLookup,
        config: dto.config,
      });

      // 评估候选方案
      const report = await this.robustnessEvaluatorService.evaluateWhatIfReport({
        policy: dto.policy as PlanningPolicy,
        schedule: dto.schedule as DayScheduleResult,
        dayEndMin: dto.dayEndMin,
        dateISO: dto.dateISO,
        dayOfWeek: dto.dayOfWeek,
        poiLookup,
        config: dto.config,
        suggestions: dto.suggestions.map(s => {
          if (s.type === 'SHIFT_EARLIER') {
            return {
              type: 'SHIFT_EARLIER' as const,
              poiId: s.poiId,
              minutes: s.minutes || 0,
              reason: s.reason || '',
            };
          } else if (s.type === 'REORDER_AVOID_WAIT') {
            return {
              type: 'REORDER_AVOID_WAIT' as const,
              poiId: s.poiId,
              reason: s.reason || '',
            };
          } else {
            return {
              type: 'UPGRADE_TRANSIT' as const,
              poiId: s.poiId,
              reason: s.reason || '',
            };
          }
        }),
        budgetStrategy: dto.budgetStrategy,
      });

      return successResponse({
        base: report.base,
        candidates: report.candidates,
        winnerId: report.winnerId,
        riskWarning: report.riskWarning,
      });
    } catch (error: any) {
      console.error('evaluateCandidates error:', error);
      return errorResponse(ErrorCode.INTERNAL_ERROR, error.message || '评估候选方案时发生错误');
    }
  }
}

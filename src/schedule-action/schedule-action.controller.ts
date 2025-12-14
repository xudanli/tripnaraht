// src/schedule-action/schedule-action.controller.ts

import { Controller, Post, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { ScheduleActionService } from './schedule-action.service';
import { DayScheduleResult } from '../planning-policy/interfaces/scheduler.interface';
import { AssistantAction } from '../assist/dto/action.dto';
import { StandardResponse } from '../common/dto/standard-response.dto';
import {
  ActionQueryNextStopDto,
  ActionMovePoiToMorningDto,
  ActionAddPoiToScheduleDto,
  ApplyActionRequestDto,
} from './dto/apply-action.dto';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';

@ApiTags('schedule-action')
@ApiExtraModels(
  ActionQueryNextStopDto,
  ActionMovePoiToMorningDto,
  ActionAddPoiToScheduleDto,
  ApiSuccessResponseDto,
  ApiErrorResponseDto
)
@Controller('schedule')
export class ScheduleActionController {
  constructor(private readonly scheduleActionService: ScheduleActionService) {}

  @Post('apply-action')
  @ApiOperation({
    summary: '应用行程动作',
    description:
      '执行助手建议的动作，返回修改后的行程计划。\n\n' +
      '**支持的动作**：\n' +
      '- `QUERY_NEXT_STOP`：查询下一站（返回答案，不修改 schedule）\n' +
      '- `MOVE_POI_TO_MORNING`：移动 POI 到上午\n' +
      '- `ADD_POI_TO_SCHEDULE`：添加 POI 到行程（方案 A：后端内部拉取完整 POI）\n\n' +
      '**注意**：MVP 版本的 `MOVE_POI_TO_MORNING` 仅调整 stop 顺序，不重建时间轴（与 What-If V1.5 思想一致）。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        schedule: {
          type: 'object',
          description: '当前行程计划（DayScheduleResult）',
        },
        action: {
          oneOf: [
            { $ref: getSchemaPath(ActionQueryNextStopDto) },
            { $ref: getSchemaPath(ActionMovePoiToMorningDto) },
            { $ref: getSchemaPath(ActionAddPoiToScheduleDto) },
          ],
          discriminator: {
            propertyName: 'type',
            mapping: {
              QUERY_NEXT_STOP: getSchemaPath(ActionQueryNextStopDto),
              MOVE_POI_TO_MORNING: getSchemaPath(ActionMovePoiToMorningDto),
              ADD_POI_TO_SCHEDULE: getSchemaPath(ActionAddPoiToScheduleDto),
            },
          },
        },
      },
      required: ['schedule', 'action'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '返回执行结果（统一响应格式）',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            applied: { type: 'boolean', description: '是否修改了 schedule' },
            newSchedule: { type: 'object', description: '修改后的行程计划（applied=true 时）' },
            answer: {
              type: 'object',
              description: 'QUERY_NEXT_STOP 的答案（applied=false 时）',
              properties: {
                title: { type: 'string' },
                details: { type: 'string' },
              },
            },
            message: { type: 'string', description: '操作说明' },
          },
        },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            message: { type: 'string' },
            details: { type: 'object' },
          },
        },
      },
    },
  })
  async applyAction(
    @Body() body: { schedule: DayScheduleResult; action: AssistantAction }
  ): Promise<StandardResponse<{
    applied: boolean;
    newSchedule?: DayScheduleResult;
    answer?: { title: string; details: string };
    message?: string;
  }>> {
    return await this.scheduleActionService.apply(body.schedule, body.action);
  }

  @Post('preview-action')
  @ApiOperation({
    summary: '预览行程动作（dry-run）',
    description:
      '预览动作执行结果，不实际修改 schedule。返回 diff（移动了哪些 stop）、warnings、是否可应用等信息。\n\n' +
      'UI 可以先展示"将东京塔移动到上午，会影响后续 3 个点"，用户确认后再调用 apply-action。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        schedule: {
          type: 'object',
          description: '当前行程计划（DayScheduleResult）',
        },
        action: {
          oneOf: [
            { $ref: getSchemaPath(ActionQueryNextStopDto) },
            { $ref: getSchemaPath(ActionMovePoiToMorningDto) },
            { $ref: getSchemaPath(ActionAddPoiToScheduleDto) },
          ],
          discriminator: {
            propertyName: 'type',
            mapping: {
              QUERY_NEXT_STOP: getSchemaPath(ActionQueryNextStopDto),
              MOVE_POI_TO_MORNING: getSchemaPath(ActionMovePoiToMorningDto),
              ADD_POI_TO_SCHEDULE: getSchemaPath(ActionAddPoiToScheduleDto),
            },
          },
        },
      },
      required: ['schedule', 'action'],
    },
  })
  @ApiResponse({
    status: 200,
    description: '返回预览结果（统一响应格式）',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            applied: { type: 'boolean', description: '是否实际应用（预览模式始终为 false）' },
            canApply: { type: 'boolean', description: '是否可以应用' },
            diff: {
              type: 'object',
              properties: {
                movedStops: { type: 'array' },
                addedStops: { type: 'array' },
                removedStops: { type: 'array' },
                affectedStopCount: { type: 'number' },
              },
            },
            warnings: { type: 'array', items: { type: 'string' } },
            newSchedule: { type: 'object', description: '预览后的行程计划' },
            message: { type: 'string', description: '预览说明' },
          },
        },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'VALIDATION_ERROR' },
            message: { type: 'string' },
            details: { type: 'object' },
          },
        },
      },
    },
  })
  async previewAction(
    @Body() body: { schedule: DayScheduleResult; action: AssistantAction }
  ): Promise<StandardResponse<{
    applied: boolean;
    canApply: boolean;
    diff?: {
      movedStops: Array<{ id: string; name: string; from: number; to: number }>;
      addedStops: Array<{ id: string; name: string; position: number }>;
      removedStops: Array<{ id: string; name: string }>;
      affectedStopCount: number;
    };
    warnings: string[];
    newSchedule?: DayScheduleResult;
    message: string;
  }>> {
    return await this.scheduleActionService.preview(body.schedule, body.action);
  }
}

// src/schedule-action/dto/apply-action.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 查询下一站动作 DTO
 */
export class ActionQueryNextStopDto {
  @ApiProperty({ enum: ['QUERY_NEXT_STOP'], example: 'QUERY_NEXT_STOP' })
  type: 'QUERY_NEXT_STOP';
}

/**
 * 移动 POI 到上午动作 DTO
 */
export class ActionMovePoiToMorningDto {
  @ApiProperty({ enum: ['MOVE_POI_TO_MORNING'], example: 'MOVE_POI_TO_MORNING' })
  type: 'MOVE_POI_TO_MORNING';

  @ApiPropertyOptional({ example: '6211', description: 'POI ID（Place ID，数字字符串）' })
  poiId?: string;

  @ApiPropertyOptional({ example: '东京塔', description: 'POI 名称（用于匹配）' })
  poiName?: string;

  @ApiPropertyOptional({ enum: ['AM', 'PM'], example: 'AM', description: '偏好时间段' })
  preferredRange?: 'AM' | 'PM';

  @ApiPropertyOptional({
    description: '是否重建时间轴（默认 false，仅调整顺序；true 时会重新计算时间，考虑交通、营业时间等约束，冲突时回退到仅重排）',
    example: false,
    default: false,
  })
  rebuildTimeline?: boolean;
}

/**
 * 添加 POI 到行程动作 DTO
 */
export class ActionAddPoiToScheduleDto {
  @ApiProperty({ enum: ['ADD_POI_TO_SCHEDULE'], example: 'ADD_POI_TO_SCHEDULE' })
  type: 'ADD_POI_TO_SCHEDULE';

  @ApiProperty({ example: '6211' })
  poiId: string;

  @ApiPropertyOptional({ enum: ['AM', 'PM'], example: 'AM' })
  preferredRange?: 'AM' | 'PM';

  @ApiPropertyOptional({ description: '插入到此 stop 之后', example: '12571' })
  insertAfterStopId?: string;
}

/**
 * 应用动作请求 DTO
 */
export class ApplyActionRequestDto {
  @ApiProperty({ type: Object, description: '当前行程计划（DayScheduleResult）' })
  schedule: any;

  @ApiProperty({
    description: '要执行的动作',
    oneOf: [
      { $ref: '#/components/schemas/ActionQueryNextStopDto' },
      { $ref: '#/components/schemas/ActionMovePoiToMorningDto' },
      { $ref: '#/components/schemas/ActionAddPoiToScheduleDto' },
    ],
  })
  action: ActionQueryNextStopDto | ActionMovePoiToMorningDto | ActionAddPoiToScheduleDto;
}

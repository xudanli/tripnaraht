import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RouteAndRunResponseDto } from './route-and-run.dto';

/**
 * `POST /agent/route_and_run/async` 秒回契约（Durable Task Pattern v1）。
 */
export class RouteAndRunTaskInitResponseDto {
  @ApiProperty({ example: 'task_trip_2026_0518_001' })
  task_id!: string;

  @ApiProperty({ enum: ['PENDING', 'PROCESSING'], example: 'PROCESSING' })
  status!: 'PENDING' | 'PROCESSING';

  @ApiProperty({ example: 'INTAKE', description: '当前编排阶段（OrchestrationStep）' })
  current_phase!: string;

  @ApiProperty({ example: 5, description: '进度 0–100' })
  progress_percentage!: number;

  @ApiProperty({
    example: '规划师已接收到您的冰岛环岛需求，正在为您初始化状态机…',
  })
  message!: string;

  @ApiPropertyOptional({
    description: '完成前为 null；轮询到 SUCCESS 后见 `GET /agent/task/status/:taskId` 的 data',
    nullable: true,
  })
  data!: RouteAndRunResponseDto | null;

  @ApiProperty({ description: '关联 request_id，便于日志对账' })
  request_id!: string;
}

/**
 * `GET /agent/task/status/:taskId` 轮询契约。
 */
export class RouteAndRunTaskStatusResponseDto {
  @ApiProperty()
  task_id!: string;

  @ApiProperty({ enum: ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED'] })
  status!: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

  @ApiProperty({ description: 'OrchestrationStep 或内核 phase 名' })
  current_phase!: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  progress_percentage!: number;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional({
    type: RouteAndRunResponseDto,
    nullable: true,
    description: '仅 status=SUCCESS 时填充完整 route_and_run 响应',
  })
  data!: RouteAndRunResponseDto | null;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional({ description: '预计剩余秒数（启发式）' })
  estimated_time_remaining_sec?: number;

  @ApiProperty()
  updated_at!: string;
}

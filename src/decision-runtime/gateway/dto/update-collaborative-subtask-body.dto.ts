import { IsIn, IsOptional, IsString } from 'class-validator';

const SUBTASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;

/**
 * PATCH .../decision-problems/:problemId/collaborative-sub-tasks/:subTaskId
 */
export class UpdateCollaborativeSubTaskBodyDto {
  @IsOptional()
  @IsIn(SUBTASK_STATUSES)
  status?: (typeof SUBTASK_STATUSES)[number];

  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

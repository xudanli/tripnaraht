import { IsIn, IsOptional, IsString } from 'class-validator';

const SUBTASK_KINDS = [
  'ACCOMMODATION_LOOKUP',
  'CANCELLATION_POLICY',
  'TEAM_CONFIRM',
  'BOOKING_FOLLOWUP',
  'OTHER',
] as const;

/**
 * POST .../decision-problems/:problemId/collaborative-sub-tasks
 * Must use class-validator — global ValidationPipe whitelist strips undecorated fields.
 */
export class CreateCollaborativeSubTaskBodyDto {
  /** Optional — defaults to the active resolution for this problem */
  @IsOptional()
  @IsString()
  resolutionId?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(SUBTASK_KINDS)
  kind?: (typeof SUBTASK_KINDS)[number];

  @IsOptional()
  @IsString()
  assigneeUserId?: string;
}

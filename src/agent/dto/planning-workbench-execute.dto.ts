import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  EXPOSED_PLANNING_WORKBENCH_TRAVEL_MODES,
} from '../../common/constants/travel-mode-scope.constants';
import type { PlanSkeletonSet, PlanState } from '../../skills/plan/shared/plan-state.types';
import type { PlanningWorkbenchRequestMetadata } from '../services/planning-workbench-agent.service';
import {
  PlanGateConfirmedItemDto,
  type PlanGatePendingConfirmationDto,
} from './plan-gate.dto';
import {
  collectPendingConfirmationsForValidation,
  validateConfirmedItemsForCommit,
} from '../utils/plan-gate-verification.projection.util';

export const PLANNING_WORKBENCH_USER_ACTIONS = [
  'generate',
  'compare',
  'commit',
  'adjust',
] as const;

export type PlanningWorkbenchUserAction = (typeof PLANNING_WORKBENCH_USER_ACTIONS)[number];

export const PLANNING_WORKBENCH_PACE_FEEDBACK = [
  'too_tired',
  'too_rushed',
  'too_relaxed',
] as const;

export type PlanningWorkbenchPaceFeedback = (typeof PLANNING_WORKBENCH_PACE_FEEDBACK)[number];

export const PLANNING_WORKBENCH_TRAVEL_MODES = EXPOSED_PLANNING_WORKBENCH_TRAVEL_MODES;

@ValidatorConstraint({ name: 'planningWorkbenchDestination', async: false })
export class PlanningWorkbenchDestinationConstraint implements ValidatorConstraintInterface {
  validate(destination: PlanDestinationDto | undefined): boolean {
    if (!destination || typeof destination !== 'object') {
      return false;
    }
    return Boolean(destination.country || destination.city || destination.region);
  }

  defaultMessage(): string {
    return 'context.destination 至少需要提供 country、city 或 region 之一';
  }
}

export class PlanDestinationDto {
  @ApiPropertyOptional({ example: '冰岛' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: '雷克雅未克' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;
}

export class PlanContextDto {
  @ApiProperty({ type: PlanDestinationDto })
  @ValidateNested()
  @Type(() => PlanDestinationDto)
  @Validate(PlanningWorkbenchDestinationConstraint)
  destination!: PlanDestinationDto;

  @ApiProperty({ example: 5, minimum: 1 })
  @IsInt()
  @Min(1)
  days!: number;

  @ApiPropertyOptional({ enum: PLANNING_WORKBENCH_TRAVEL_MODES })
  @IsOptional()
  @IsEnum(PLANNING_WORKBENCH_TRAVEL_MODES)
  travelMode?: (typeof PLANNING_WORKBENCH_TRAVEL_MODES)[number];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mustDo?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mustAvoid?: string[];

  @ApiPropertyOptional({ description: '预算、体力等约束' })
  @IsOptional()
  @IsObject()
  constraints?: Record<string, unknown>;
}

export class ExecutePlanningWorkbenchMetadataDto {
  @ApiPropertyOptional({ description: '前端 Context Package id' })
  @IsOptional()
  @IsString()
  contextPackageId?: string;

  @ApiPropertyOptional({ description: '时间轴 revision' })
  @IsOptional()
  @IsInt()
  scheduleRevision?: number;

  @ApiPropertyOptional({ description: 'Plan Studio 约束快照 id' })
  @IsOptional()
  @IsString()
  constraintSnapshotId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: '内部/async' })
  @IsOptional()
  @IsString()
  tripRunId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taskId?: string;
}

export class PlanningWorkbenchExecuteDto {
  @ApiProperty({ type: PlanContextDto })
  @ValidateNested()
  @Type(() => PlanContextDto)
  context!: PlanContextDto;

  @ApiPropertyOptional({ description: 'Prisma 行程主键' })
  @IsOptional()
  @IsString()
  tripId?: string;

  @ApiPropertyOptional({ description: '现有 PlanState（多步流程回传）' })
  @IsOptional()
  @IsObject()
  existingPlanState?: PlanState;

  @ApiPropertyOptional({
    enum: PLANNING_WORKBENCH_USER_ACTIONS,
    default: 'generate',
  })
  @IsOptional()
  @IsEnum(PLANNING_WORKBENCH_USER_ACTIONS)
  userAction?: PlanningWorkbenchUserAction;

  @ApiPropertyOptional({
    enum: PLANNING_WORKBENCH_PACE_FEEDBACK,
    description: 'userAction=adjust 时必填',
  })
  @IsOptional()
  @IsEnum(PLANNING_WORKBENCH_PACE_FEEDBACK)
  paceFeedback?: PlanningWorkbenchPaceFeedback;

  @ApiPropertyOptional({ description: '骨架方案集（compare/commit 可省略若 existingPlanState.metadata 已有）' })
  @IsOptional()
  @IsObject()
  skeletonOptions?: PlanSkeletonSet;

  @ApiPropertyOptional({ description: '选定的方案 ID（commit 可省略若 metadata 已有推荐）' })
  @IsOptional()
  @IsString()
  selectedOptionId?: string;

  @ApiPropertyOptional({ type: ExecutePlanningWorkbenchMetadataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExecutePlanningWorkbenchMetadataDto)
  metadata?: ExecutePlanningWorkbenchMetadataDto;

  @ApiPropertyOptional({
    type: [PlanGateConfirmedItemDto],
    description: 'userAction=commit 且存在待确认项时必填',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanGateConfirmedItemDto)
  confirmedItems?: PlanGateConfirmedItemDto[];

  @ApiPropertyOptional({
    description:
      '启用 CTRE 旅行编译：generate/commit/adjust 完成后将 PlanState 编译为 CanonicalTravelGraph（默认关；可用 TRAVEL_COMPILER_ENABLED=true 全局开启）。',
  })
  @IsOptional()
  @IsBoolean()
  enable_travel_compiler?: boolean;
}

export interface PlanningWorkbenchValidationError {
  code: string;
  message: string;
}

export function resolveSkeletonOptionsFromExecuteRequest(
  dto: Pick<
    PlanningWorkbenchExecuteDto,
    'skeletonOptions' | 'existingPlanState'
  >,
): PlanSkeletonSet | undefined {
  return (
    dto.skeletonOptions ??
    (dto.existingPlanState?.metadata?.skeletonOptions as PlanSkeletonSet | undefined)
  );
}

export function resolveSelectedOptionIdFromExecuteRequest(
  dto: Pick<
    PlanningWorkbenchExecuteDto,
    'selectedOptionId' | 'existingPlanState' | 'skeletonOptions'
  >,
): string | undefined {
  if (dto.selectedOptionId) {
    return dto.selectedOptionId;
  }

  const metadata = dto.existingPlanState?.metadata;
  if (metadata?.recommendedOptionId) {
    return String(metadata.recommendedOptionId);
  }

  const comparison = metadata?.comparison as
    | { recommendation?: { optionId?: string } }
    | undefined;
  if (comparison?.recommendation?.optionId) {
    return comparison.recommendation.optionId;
  }

  const skeletonSet = resolveSkeletonOptionsFromExecuteRequest(dto);
  if (skeletonSet?.recommendation?.optionId) {
    return skeletonSet.recommendation.optionId;
  }

  const options = skeletonSet?.options ?? [];
  if (options.length === 1) {
    return options[0].id;
  }

  const segmentSkeletonIds = [
    ...new Set(
      (dto.existingPlanState?.itinerary?.segments ?? [])
        .map((seg) => seg.metadata?.skeletonId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  if (segmentSkeletonIds.length === 1) {
    return segmentSkeletonIds[0];
  }

  return undefined;
}

export function validatePlanningWorkbenchExecuteSemantics(
  dto: PlanningWorkbenchExecuteDto,
): PlanningWorkbenchValidationError | null {
  const action = dto.userAction ?? 'generate';

  if (action === 'adjust' && !dto.paceFeedback) {
    return {
      code: 'MISSING_PACE_FEEDBACK',
      message: 'userAction=adjust 时必须提供 paceFeedback',
    };
  }

  if (action === 'compare') {
    const skeletonSet = resolveSkeletonOptionsFromExecuteRequest(dto);
    const optionCount = skeletonSet?.options?.length ?? 0;
    if (optionCount < 2) {
      return {
        code: 'MISSING_SKELETON_OPTIONS',
        message:
          'compare 需要至少 2 个骨架方案：请传 skeletonOptions，或在 existingPlanState.metadata.skeletonOptions 中携带 generate 结果',
      };
    }
  }

  if (action === 'commit') {
    const skeletonSet = resolveSkeletonOptionsFromExecuteRequest(dto);
    if (!skeletonSet?.options?.length) {
      return {
        code: 'MISSING_SKELETON_OPTIONS',
        message:
          'commit 需要骨架方案集：请传 skeletonOptions，或在 existingPlanState.metadata.skeletonOptions 中携带 generate 结果',
      };
    }

    const selectedOptionId = resolveSelectedOptionIdFromExecuteRequest(dto);
    if (!selectedOptionId) {
      return {
        code: 'MISSING_SELECTED_OPTION',
        message:
          'commit 需要 selectedOptionId，或在 planState 中可解析出选定方案（metadata.recommendedOptionId、comparison.recommendation、skeletonOptions.recommendation、唯一骨架方案、或 segments[].metadata.skeletonId）',
      };
    }

    const selectedOption = skeletonSet.options.find((opt) => opt.id === selectedOptionId);
    if (!selectedOption) {
      return {
        code: 'SELECTED_OPTION_NOT_FOUND',
        message: `commit 找不到方案 ${selectedOptionId}，请检查 selectedOptionId 与 skeletonOptions 是否匹配`,
      };
    }

    const pendingConfirmations = resolvePendingConfirmationsForCommit(dto);
    const confirmError = validateConfirmedItemsForCommit({
      pendingConfirmations,
      confirmedItems: dto.confirmedItems,
    });
    if (confirmError) {
      return confirmError;
    }
  }

  return null;
}

function resolvePendingConfirmationsForCommit(
  dto: PlanningWorkbenchExecuteDto,
): PlanGatePendingConfirmationDto[] {
  const stored = dto.existingPlanState?.metadata?.planGatePendingConfirmations as
    | PlanGatePendingConfirmationDto[]
    | undefined;
  if (stored?.length) {
    return stored;
  }
  if (!dto.existingPlanState) {
    return [];
  }
  if (!dto.existingPlanState.gate && !dto.existingPlanState.metadata?.planGatePendingConfirmations) {
    return [];
  }
  return collectPendingConfirmationsForValidation(dto.existingPlanState, {
    confirmations: dto.existingPlanState.gate?.requiredUserConfirmations,
  });
}

export function toPlanningWorkbenchRequest(
  dto: PlanningWorkbenchExecuteDto,
): import('../services/planning-workbench-agent.service').PlanningWorkbenchRequest {
  return {
    context: dto.context,
    tripId: dto.tripId,
    existingPlanState: dto.existingPlanState,
    userAction: dto.userAction,
    paceFeedback: dto.paceFeedback,
    skeletonOptions: dto.skeletonOptions,
    selectedOptionId: dto.selectedOptionId,
    confirmedItems: dto.confirmedItems,
    enableTravelCompiler: dto.enable_travel_compiler,
    metadata: dto.metadata as PlanningWorkbenchRequestMetadata | undefined,
  };
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { GuardianPersonaPresentationDto } from '../../../../agent/dto/guardian-persona.dto';

export class GuardianChooseRequestDto {
  @ApiProperty({
    enum: ['negotiation', 'presentation', 'optimize_judgment', 'readiness_repair', 'team_negotiation'],
  })
  @IsString()
  @IsIn(['negotiation', 'presentation', 'optimize_judgment', 'readiness_repair', 'team_negotiation'])
  source!:
    | 'negotiation'
    | 'presentation'
    | 'optimize_judgment'
    | 'readiness_repair'
    | 'team_negotiation';

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  selectedIndex!: number;

  @ApiProperty({ example: '改走 B 线，减少 2h 车程' })
  @IsString()
  @MinLength(1)
  selectedText!: string;

  @ApiProperty({ type: [String], description: '当时展示的全部选项（审计）' })
  @IsArray()
  @IsString({ each: true })
  decisionPoints!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  correlationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  negotiationRunId?: string;
}

export class GuardianChooseResponseDto {
  @ApiProperty()
  accepted!: boolean;

  @ApiProperty({
    enum: ['CONTINUE_PLANNING', 'RE_RUN_NEGOTIATION', 'APPLY_REPAIR', 'BLOCKED'],
  })
  nextAction!: 'CONTINUE_PLANNING' | 'RE_RUN_NEGOTIATION' | 'APPLY_REPAIR' | 'BLOCKED';

  @ApiPropertyOptional({ type: GuardianPersonaPresentationDto })
  presentation?: GuardianPersonaPresentationDto;

  @ApiPropertyOptional()
  planVersion?: number;

  @ApiPropertyOptional()
  decisionLogEntryId?: string;
}

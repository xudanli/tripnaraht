import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type MemberConfirmScope =
  | 'AI_AUTO'
  | 'ADVISOR_DIRECT'
  | 'PAYER'
  | 'AFFECTED_MEMBERS'
  | 'PAYER_AND_MEMBERS'
  | 'ALL_MEMBERS';

export type MemberConfirmPhase = 'planning' | 'execution' | 'completion';

export type MemberConfirmStatus = 'PENDING' | 'COMPLETED' | 'DISMISSED';

export class MemberConfirmInboxItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  summary?: string;

  @ApiProperty({
    enum: [
      'AI_AUTO',
      'ADVISOR_DIRECT',
      'PAYER',
      'AFFECTED_MEMBERS',
      'PAYER_AND_MEMBERS',
      'ALL_MEMBERS',
    ],
  })
  confirmScope!: MemberConfirmScope;

  @ApiProperty({ enum: ['planning', 'execution', 'completion'] })
  phase!: MemberConfirmPhase;

  @ApiProperty({ enum: ['PENDING', 'COMPLETED', 'DISMISSED'] })
  status!: MemberConfirmStatus;

  @ApiPropertyOptional()
  actionHref?: string;
}

export class MemberConfirmInboxResponseDto {
  @ApiProperty({ type: [MemberConfirmInboxItemDto] })
  items!: MemberConfirmInboxItemDto[];
}

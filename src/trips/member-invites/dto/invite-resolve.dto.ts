import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InviteResolvePreviewDto {
  @ApiPropertyOptional()
  title?: string;

  @ApiPropertyOptional()
  subtitle?: string;

  @ApiPropertyOptional()
  destination?: string;

  @ApiPropertyOptional()
  tripId?: string;

  @ApiPropertyOptional()
  label?: string;

  @ApiPropertyOptional()
  expired?: boolean;
}

export class InviteResolveResponseDto {
  @ApiProperty({ enum: ['trip_member', 'team', 'gate1_participant'] })
  kind!: 'trip_member' | 'team' | 'gate1_participant';

  @ApiProperty()
  token!: string;

  @ApiProperty({ description: '前端跳转路径' })
  targetPath!: string;

  @ApiPropertyOptional({ type: InviteResolvePreviewDto })
  preview?: InviteResolvePreviewDto;
}

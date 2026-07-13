import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';

export class TripMemberRefDto {
  @ApiPropertyOptional()
  memberId?: string;

  @ApiPropertyOptional()
  userId?: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiPropertyOptional({ description: '邀请前占位，如「主联系人」' })
  inviteLabel?: string;
}

export class TripResponsibilityOwnersDto {
  @ApiProperty()
  planningOwner!: TripMemberRefDto;

  @ApiProperty()
  executionOwner!: TripMemberRefDto;

  @ApiProperty()
  paymentApprover!: TripMemberRefDto;

  @ApiProperty()
  finalApprover!: TripMemberRefDto;

  @ApiProperty()
  onTripLeader!: TripMemberRefDto;

  @ApiProperty()
  emergencyContact!: TripMemberRefDto;
}

export class TripResponsibilityOwnersResponseDto {
  @ApiProperty()
  tripId!: string;

  @ApiProperty({ type: TripResponsibilityOwnersDto })
  owners!: TripResponsibilityOwnersDto;

  @ApiPropertyOptional()
  updatedAt?: string;
}

export class PatchTripResponsibilityOwnersDto {
  @ApiProperty({ type: TripResponsibilityOwnersDto })
  @ValidateNested()
  @Type(() => TripResponsibilityOwnersDto)
  owners!: Partial<TripResponsibilityOwnersDto>;
}

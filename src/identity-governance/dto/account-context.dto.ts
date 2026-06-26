import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ACCOUNT_CONTEXT_TYPES, AccountContextType } from '../constants/identity-governance.constants';

export class SwitchAccountContextDto {
  @ApiProperty({ enum: ACCOUNT_CONTEXT_TYPES })
  @IsEnum(ACCOUNT_CONTEXT_TYPES)
  contextType!: AccountContextType;

  @ApiPropertyOptional({ description: '机构上下文必填 organizationId' })
  @IsOptional()
  @IsUUID()
  contextId?: string;
}

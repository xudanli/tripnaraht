import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateDecisionDnaConsentDto {
  @ApiProperty({ description: '是否允许从 rollback 等行为隐式学习 Decision DNA' })
  @IsBoolean()
  implicit_learning!: boolean;
}

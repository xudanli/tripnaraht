import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class ConfirmIcelandProposalDto {
  @ApiProperty({
    type: [String],
    description:
      'Must include every confirmationId where blockingApply === true. Empty when none required.',
    example: ['exp:ice_cave_tour', 'gap:south_coast'],
  })
  @IsArray()
  @IsString({ each: true })
  acknowledgedConfirmationIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

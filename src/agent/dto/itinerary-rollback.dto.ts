
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ItineraryRollbackRequestDto {
  @ApiProperty({ description: '要恢复到的历史 revision（使用该行的 snapshot）' })
  @IsString()
  @MinLength(8)
  revision_id!: string;
}

export class ItineraryRollbackResponseDto {
  @ApiProperty()
  itinerary!: any;

  @ApiProperty({ description: '本次回滚产生的新 revision（kind=ROLLBACK）' })
  new_revision_id!: string;

  @ApiPropertyOptional()
  trip_id?: string | null;

  @ApiPropertyOptional({ description: '回滚前的链头 revision' })
  rolled_back_from_revision_id?: string | null;

  @ApiPropertyOptional({ description: '恢复目标 revision' })
  target_revision_id?: string | null;
}

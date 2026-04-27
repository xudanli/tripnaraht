import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class HardTruthGateFroadBlock2wdParamsDto {
  @ApiProperty({ description: 'When false, GateEval will not emit the 4x4-required vs 2WD hard violation.' })
  @IsBoolean()
  enabled!: boolean;
}

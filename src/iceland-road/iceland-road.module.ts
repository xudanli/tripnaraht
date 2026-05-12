import { Module } from '@nestjs/common';
import { IcelandRoadConstraintPropagationService } from './road-constraint.propagation.service';

@Module({
  providers: [IcelandRoadConstraintPropagationService],
  exports: [IcelandRoadConstraintPropagationService],
})
export class IcelandRoadModule {}

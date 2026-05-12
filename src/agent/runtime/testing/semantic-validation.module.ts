// src/agent/runtime/testing/semantic-validation.module.ts
import { Module } from '@nestjs/common';
import { SemanticValidationService } from './semantic-validation.service';

@Module({
  providers: [SemanticValidationService],
  exports: [SemanticValidationService],
})
export class SemanticValidationModule {}

import { Module } from '@nestjs/common';
import { HarnessEvalModule } from './harness-eval.module';

/** CLI / scripts 薄入口：仅加载评测防御网，不拉起完整 AppModule */
@Module({
  imports: [HarnessEvalModule],
})
export class HarnessEvalCliModule {}

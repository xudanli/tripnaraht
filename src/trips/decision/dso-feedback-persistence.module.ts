/**
 * DSO 反馈持久化模块
 *
 * 专利实施例 6.1.5：用户反馈通过 STATE_UPDATE 原子写入 DSO
 * 提供 IDsoFeedbackPersistence 实现，供 DecisionKernelModule 使用
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DsoFeedbackPersistenceService } from './services/dso-feedback-persistence.service';
import { DSO_FEEDBACK_PERSISTENCE } from '../../decision/kernel/dso-feedback-persistence.interface';

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: DSO_FEEDBACK_PERSISTENCE,
      useClass: DsoFeedbackPersistenceService,
    },
  ],
  exports: [DSO_FEEDBACK_PERSISTENCE],
})
export class DsoFeedbackPersistenceModule {}

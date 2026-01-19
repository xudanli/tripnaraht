// src/data-privacy/data-privacy.module.ts

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { EncryptionService } from './services/encryption.service';
import { DataPrivacyFrameworkService } from './services/data-privacy-framework.service';
import { SensitiveDataHandlingService } from './services/sensitive-data-handling.service';

/**
 * 数据隐私保护模块
 * 
 * 提供数据隐私保护功能：
 * - 最小必要原则
 * - 用户知情和同意
 * - 数据加密
 * - 数据最小化保留期
 * - 用户的数据权利
 * - 敏感信息特殊处理
 */
@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    EncryptionService,
    DataPrivacyFrameworkService,
    SensitiveDataHandlingService,
  ],
  exports: [
    EncryptionService,
    DataPrivacyFrameworkService,
    SensitiveDataHandlingService,
  ],
})
export class DataPrivacyModule {}

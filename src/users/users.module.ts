// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DecisionOsP0Module } from '../decision/decision-os-p0.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [PrismaModule, DecisionOsP0Module, UploadModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

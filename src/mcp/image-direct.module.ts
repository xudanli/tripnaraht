import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ImageDirectController } from './image-direct.controller';
import { ImageDirectService } from './image-direct.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
  ],
  controllers: [ImageDirectController],
  providers: [ImageDirectService],
  exports: [ImageDirectService],
})
export class ImageDirectModule {}

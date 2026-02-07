import { Module } from '@nestjs/common';
import { FileExtractorDirectService } from './file-extractor-direct.service';
import { FileExtractorDirectController } from './file-extractor-direct.controller';

@Module({
  controllers: [FileExtractorDirectController],
  providers: [FileExtractorDirectService],
  exports: [FileExtractorDirectService],
})
export class FileExtractorDirectModule {}

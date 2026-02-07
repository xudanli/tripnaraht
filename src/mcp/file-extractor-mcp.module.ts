import { Module } from '@nestjs/common';
import { FileExtractorMcpService } from './file-extractor-mcp.service';
import { FileExtractorMcpController } from './file-extractor-mcp.controller';
import { FileExtractorDirectModule } from './file-extractor-direct.module';

@Module({
  imports: [FileExtractorDirectModule], // 导入直接服务模块以支持降级
  controllers: [FileExtractorMcpController],
  providers: [FileExtractorMcpService],
  exports: [FileExtractorMcpService],
})
export class FileExtractorMcpModule {}

import { Module } from '@nestjs/common';
import { BrowserbaseMcpController } from './browserbase-mcp.controller';
import { BrowserbaseMcpService } from './browserbase-mcp.service';

@Module({
  controllers: [BrowserbaseMcpController],
  providers: [BrowserbaseMcpService],
  exports: [BrowserbaseMcpService],
})
export class BrowserbaseMcpModule {}

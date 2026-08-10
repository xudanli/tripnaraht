import { Module } from '@nestjs/common';
import { BrowserbaseMcpModule } from './browserbase-mcp.module';
import { ActivityDirectService } from './activity-direct.service';
import { ActivityDirectController } from './activity-direct.controller';

@Module({
  imports: [BrowserbaseMcpModule],
  controllers: [ActivityDirectController],
  providers: [ActivityDirectService],
  exports: [ActivityDirectService],
})
export class ActivityDirectModule {}

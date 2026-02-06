import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PostgreSQLMcpModule } from '../mcp/postgresql-mcp.module';

@Module({
  imports: [PrismaModule, PostgreSQLMcpModule],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}

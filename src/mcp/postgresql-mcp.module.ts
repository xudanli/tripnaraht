import { Module } from '@nestjs/common';
import { PostgreSQLMcpController } from './postgresql-mcp.controller';
import { PostgreSQLMcpService } from './postgresql-mcp.service';
import { PostgreSQLMcpSecurityService } from './services/postgresql-mcp-security.service';
import { PostgreSQLMcpMonitoringService } from './services/postgresql-mcp-monitoring.service';
import { PostgreSQLMcpPermissionService } from './services/postgresql-mcp-permission.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule], // Redis 模块（用于监控数据存储）
  controllers: [PostgreSQLMcpController],
  providers: [
    PostgreSQLMcpService,
    PostgreSQLMcpSecurityService,
    PostgreSQLMcpMonitoringService,
    PostgreSQLMcpPermissionService,
  ],
  exports: [
    PostgreSQLMcpService,
    PostgreSQLMcpSecurityService,
    PostgreSQLMcpMonitoringService,
    PostgreSQLMcpPermissionService,
  ],
})
export class PostgreSQLMcpModule {}

// src/mcp/mcp-capability.module.ts

/**
 * MCP 能力管理模块
 * 
 * 功能：提供统一的管理接口来控制各个 MCP 能力的开启和关闭
 * - 支持通过 REST API 动态启用/禁用 MCP 服务
 * - 能力状态持久化存储到数据库（mcp_capabilities 表）
 * - 支持查询、批量更新、统计等功能
 * - 用于管理员统一管理所有 MCP 服务的可用性
 */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { McpCapabilityController } from './mcp-capability.controller';
import { McpCapabilityManagerService } from './services/mcp-capability-manager.service';

@Module({
  imports: [PrismaModule],
  controllers: [McpCapabilityController],
  providers: [McpCapabilityManagerService],
  exports: [McpCapabilityManagerService],
})
export class McpCapabilityModule {}

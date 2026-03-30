// src/admin/controllers/conversation-admin.controller.ts
import { Controller, Post, Get, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { NLConversationContextService } from '../../trips/services/nl-conversation-context.service';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';

@ApiTags('admin')
@Public() // 临时开放测试，生产环境应移除或添加认证
@Controller('admin/conversation')
export class ConversationAdminController {
  private readonly logger = new Logger(ConversationAdminController.name);

  constructor(
    private readonly nlConversationContextService: NLConversationContextService,
  ) {}

  @Post('clear-all')
  @ApiOperation({
    summary: '清空所有会话上下文数据',
    description: '清空内存缓存和 Redis 中的所有会话数据（用于数据清理）',
  })
  @ApiResponse({
    status: 200,
    description: '成功清空所有会话',
  })
  async clearAllSessions() {
    try {
      this.logger.warn('⚠️  管理员请求清空所有会话上下文数据');
      
      const deletedCount = await this.nlConversationContextService.clearAllSessions();
      
      this.logger.log(`✅ 已清空所有会话，共删除 ${deletedCount} 个会话`);
      
      return successResponse({
        deletedCount,
        message: `已清空所有会话，共删除 ${deletedCount} 个会话`,
      });
    } catch (error: any) {
      this.logger.error(`清空所有会话失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, `清空失败: ${error.message}`);
    }
  }

  @Get('stats')
  @ApiOperation({
    summary: '获取会话统计信息',
    description: '获取当前会话数量统计',
  })
  @ApiResponse({
    status: 200,
    description: '成功返回统计信息',
  })
  async getStats() {
    try {
      const allSessions = await this.nlConversationContextService.getAllSessions();
      
      const sessionsByUser = new Map<string, number>();
      for (const session of allSessions) {
        sessionsByUser.set(session.userId, (sessionsByUser.get(session.userId) || 0) + 1);
      }
      
      return successResponse({
        totalSessions: allSessions.length,
        totalUsers: sessionsByUser.size,
        sessionsByUser: Object.fromEntries(sessionsByUser),
      });
    } catch (error: any) {
      this.logger.error(`获取会话统计失败: ${error.message}`, error.stack);
      return errorResponse(ErrorCode.INTERNAL_ERROR, `获取统计失败: ${error.message}`);
    }
  }
}

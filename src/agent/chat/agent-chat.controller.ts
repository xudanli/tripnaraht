import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser, type CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { AgentChatService } from './agent-chat.service';
import { AgentChatEventsService } from './agent-chat-events.service';
import {
  ApplyItineraryDraftDto,
  ConfirmAgentChatDto,
  CreateAgentConversationDto,
  ListMessagesQueryDto,
  PostAgentChatMessageDto,
} from './dto/agent-chat.dto';

@ApiTags('agent-chat')
@ApiBearerAuth()
@Controller('agent/chat')
export class AgentChatController {
  constructor(
    private readonly chat: AgentChatService,
    private readonly chatEvents: AgentChatEventsService,
  ) {}

  private requireUser(user?: CurrentUserPayload): string {
    const id = user?.userId?.trim();
    if (!id) throw new UnauthorizedException('Authentication required');
    return id;
  }

  @Get('me/conversations')
  @ApiOperation({ summary: '个人对话抽屉列表（PERSONAL）' })
  async listMine(@CurrentUser() user?: CurrentUserPayload) {
    const userId = this.requireUser(user);
    const rows = await this.chat.listMine(userId);
    return { success: true, data: rows.map((r) => this.chat.toConversationDto(r)) };
  }

  @Get('trips/:tripId/conversations')
  @ApiOperation({ summary: '团队主线程列表（通常 1 条 TRIP_SHARED）' })
  async listTrip(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = this.requireUser(user);
    const rows = await this.chat.listForTrip(tripId, userId);
    return { success: true, data: rows.map((r) => this.chat.toConversationDto(r)) };
  }

  @Post('conversations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '创建 PERSONAL 或确保 TRIP_SHARED 主线程' })
  async create(
    @Body() body: CreateAgentConversationDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = this.requireUser(user);
    const row = await this.chat.createConversation(userId, body);
    return { success: true, data: this.chat.toConversationDto(row) };
  }

  @Post('trips/:tripId/conversations/ensure-shared')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '确保行程团队主线程存在并返回' })
  async ensureShared(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = this.requireUser(user);
    const row = await this.chat.ensureTripShared(tripId, userId);
    return { success: true, data: this.chat.toConversationDto(row) };
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: '分页拉取消息（cursor = message id）' })
  async messages(
    @Param('id') id: string,
    @Query() query: ListMessagesQueryDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = this.requireUser(user);
    const data = await this.chat.listMessages(id, userId, {
      cursor: query.cursor,
      limit: query.limit,
    });
    return { success: true, data };
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '发消息 → 落库 → route_and_run（带 conversation_id + scope）',
  })
  async postMessage(
    @Param('id') id: string,
    @Body() body: PostAgentChatMessageDto,
    @Req() req: Request,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = this.requireUser(user);
    const data = await this.chat.postMessage(id, userId, body, req.body);
    return { success: true, data };
  }

  @Post('conversations/:id/messages/attach-async')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '把 async task SUCCESS 结果写入 assistant 消息' })
  async attachAsync(
    @Param('id') id: string,
    @Body() body: { task_id: string },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = this.requireUser(user);
    const data = await this.chat.attachAsyncResult(id, userId, body.task_id);
    return { success: true, data };
  }

  @Post('conversations/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '团队线程 Abu 协商确认（角色门控；PERSONAL 禁止）。≠ 改排「确认写入」。',
  })
  async confirm(
    @Param('id') id: string,
    @Body() body: ConfirmAgentChatDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = this.requireUser(user);
    const data = await this.chat.confirm(id, userId, body);
    return { success: true, data };
  }

  @Post('conversations/:id/apply-itinerary-draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '确认写入改排草案（TRIP_SHARED + OWNER/ORGANIZER/DRIVER；PERSONAL / FLAWED_DRAFT 禁止）',
  })
  async applyItineraryDraft(
    @Param('id') id: string,
    @Body() body: ApplyItineraryDraftDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    const userId = this.requireUser(user);
    const data = await this.chat.applyItineraryDraft(id, userId, body);
    return { success: true, data };
  }

  @Get('conversations/:id/events')
  @ApiOperation({
    summary: '会话 SSE：message.created / ai.progress / confirm.resolved / peer.activity',
  })
  async streamEvents(
    @Param('id') id: string,
    @CurrentUser() user?: CurrentUserPayload,
    @Req() req?: Request,
    @Res() res?: Response,
  ): Promise<void> {
    const userId = this.requireUser(user);
    // Access check
    await this.chat.listMessages(id, userId, { limit: 1 });
    if (!res) return;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: 'ready', conversation_id: id, at: new Date().toISOString() });

    const unsub = this.chatEvents.subscribe(id, (e) => send(e));
    const heartbeat = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 15000);

    req?.on('close', () => {
      clearInterval(heartbeat);
      unsub();
    });
  }
}

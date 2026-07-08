import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { InTripCommsPeersService } from '../services/in-trip-comms-peers.service';
import { InTripCommsSummaryService } from '../services/in-trip-comms-summary.service';
import { InTripCommsTranscribeService } from '../services/in-trip-comms-transcribe.service';
import { InTripCommsService } from '../services/in-trip-comms.service';
import type {
  CommsHeartbeatRequest,
  CommsListQuery,
  CommsPeersQuery,
  CommsSyncRequest,
} from '../types/in-trip-comms.types';

interface MulterFile {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
}

@ApiTags('trip-in-trip-comms')
@Public()
@Controller('trips/:tripId/in-trip/comms')
export class TripInTripCommsController {
  constructor(
    private readonly comms: InTripCommsService,
    private readonly peers: InTripCommsPeersService,
    private readonly transcribeService: InTripCommsTranscribeService,
    private readonly summaryService: InTripCommsSummaryService,
  ) {}

  @Post('sync')
  @ApiOperation({ summary: '有网后同步对讲消息（上行 + 增量下行）' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async sync(
    @Param('tripId') tripId: string,
    @Body() body: CommsSyncRequest,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.comms.sync(tripId, userId, body ?? {}));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get()
  @ApiOperation({ summary: '拉取对讲历史（换机 / 迟到加入）' })
  @ApiQuery({ name: 'since', required: false, description: 'ISO8601 或 serverSeq' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'before', required: false, description: '分页游标' })
  async listMessages(
    @Param('tripId') tripId: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      const query: CommsListQuery = {
        since,
        before,
        limit: limit != null ? Number(limit) : undefined,
      };
      return successResponse(await this.comms.listMessages(tripId, userId, query));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('peers')
  @ApiOperation({ summary: '成员距离与在线状态' })
  @ApiQuery({ name: 'refLat', required: false, type: Number })
  @ApiQuery({ name: 'refLng', required: false, type: Number })
  @ApiQuery({ name: 'staleAfterSec', required: false, type: Number })
  async getPeers(
    @Param('tripId') tripId: string,
    @Query('refLat') refLat?: string,
    @Query('refLng') refLng?: string,
    @Query('staleAfterSec') staleAfterSec?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      const query: CommsPeersQuery = {
        refLat: refLat != null ? Number(refLat) : undefined,
        refLng: refLng != null ? Number(refLng) : undefined,
        staleAfterSec: staleAfterSec != null ? Number(staleAfterSec) : undefined,
      };
      return successResponse(await this.peers.getPeers(tripId, userId, query));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('peers/heartbeat')
  @ApiOperation({ summary: '位置 / 在线心跳' })
  async heartbeat(
    @Param('tripId') tripId: string,
    @Body() body: CommsHeartbeatRequest,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.peers.heartbeat(tripId, userId, body ?? {}));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('transcribe')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '语音转写（云端 STT，与 BLE PTT 独立）' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio'],
      properties: {
        audio: { type: 'string', format: 'binary' },
        language: { type: 'string', example: 'zh-CN' },
        format: { type: 'string', example: 'audio/webm' },
        clientId: { type: 'string', format: 'uuid' },
        durationSec: { type: 'number' },
      },
    },
  })
  async transcribe(
    @Param('tripId') tripId: string,
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: { language?: string; format?: string; clientId?: string; durationSec?: string },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      const result = await this.transcribeService.transcribe(
        tripId,
        userId,
        file?.buffer ?? Buffer.alloc(0),
        {
          language: body.language,
          format: body.format ?? file?.mimetype,
          clientId: body.clientId,
          durationSec: body.durationSec != null ? Number(body.durationSec) : undefined,
        },
      );
      return successResponse(result);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('summary')
  @ApiOperation({ summary: '对讲 AI 摘要（规则聚合，LLM 可后续替换）' })
  @ApiQuery({ name: 'since', required: false })
  @ApiQuery({ name: 'maxBullets', required: false, type: Number })
  @ApiQuery({ name: 'lang', required: false })
  @ApiQuery({ name: 'refresh', required: false, type: Boolean })
  async getSummary(
    @Param('tripId') tripId: string,
    @Query('since') since?: string,
    @Query('maxBullets') maxBullets?: string,
    @Query('lang') lang?: string,
    @Query('refresh') refresh?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(
        await this.summaryService.getSummary(tripId, userId, {
          since,
          maxBullets: maxBullets != null ? Number(maxBullets) : undefined,
          lang,
          refresh: refresh === '1' || refresh === 'true',
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    const id = user?.userId?.trim();
    if (id) return id;
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('需要登录');
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof PayloadTooLargeException) {
      const resp = e.getResponse();
      const code =
        typeof resp === 'object' && resp && 'code' in resp
          ? String((resp as { code: string }).code)
          : 'COMMS_PAYLOAD_TOO_LARGE';
      const msg =
        typeof resp === 'object' && resp && 'message' in resp
          ? String((resp as { message: string }).message)
          : e.message;
      return errorResponse(code, msg);
    }
    if (e instanceof BadRequestException) {
      const resp = e.getResponse();
      const code =
        typeof resp === 'object' && resp && 'code' in resp
          ? String((resp as { code: string }).code)
          : ErrorCode.VALIDATION_ERROR;
      const msg =
        typeof resp === 'object' && resp && 'message' in resp
          ? String((resp as { message: string }).message)
          : e.message;
      return errorResponse(code, msg);
    }
    if (e instanceof ServiceUnavailableException) {
      const resp = e.getResponse();
      const code =
        typeof resp === 'object' && resp && 'code' in resp
          ? String((resp as { code: string }).code)
          : 'COMMS_EXECUTION_DISABLED';
      const msg =
        typeof resp === 'object' && resp && 'message' in resp
          ? String((resp as { message: string }).message)
          : e.message;
      return errorResponse(code, msg);
    }
    throw e;
  }
}

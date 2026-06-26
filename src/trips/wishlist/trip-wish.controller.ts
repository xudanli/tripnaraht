import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../../common/dto/api-response.dto';
import { TripWishService } from './services/trip-wish.service';
import { TripWishVoiceService } from './services/trip-wish-voice.service';
import {
  CreateTripWishDto,
  CreateWishFromInspirationDto,
  CreateWishFromVoiceDto,
  UpdateTripWishDto,
} from './dto/trip-wish.dto';
import type { WishCategory, WishVisibility } from './types/trip-wish.types';
import { isWishCategory, listWishCategoryOptions } from './utils/wish-category.util';

interface MulterFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@ApiTags('trip-wishes')
@Public()
@Controller('trips/:tripId/wishes')
export class TripWishController {
  constructor(
    private readonly wishService: TripWishService,
    private readonly wishVoiceService: TripWishVoiceService,
  ) {}

  @Get('mine')
  @ApiOperation({ summary: '当前用户的愿望列表（含私密）' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async listMine(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const items = await this.wishService.listMine(tripId, this.resolveUserId(user));
      return successResponse({ items, count: items.length });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('team')
  @ApiOperation({ summary: '团队可见愿望（匿名/署名）' })
  async listTeam(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const items = await this.wishService.listTeam(tripId, this.resolveUserId(user));
      return successResponse({ items, count: items.length });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('summary')
  @ApiOperation({ summary: '愿望单摘要（工作台徽标 / Day 影响）' })
  async getSummary(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(await this.wishService.getWishSummary(tripId, this.resolveUserId(user)));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('day-impact')
  @ApiOperation({ summary: '各天私密偏好影响计数' })
  async getDayImpact(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const impactByDay = await this.wishService.getDayImpact(tripId, this.resolveUserId(user));
      return successResponse({ impactByDay });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('agent-snapshot')
  @ApiOperation({ summary: '智能体上下文快照（调试）' })
  async getAgentSnapshot(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(await this.wishService.getAgentSnapshot(tripId, this.resolveUserId(user)));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('categories')
  @ApiOperation({ summary: '所属领域选项（下拉列表）' })
  @ApiQuery({ name: 'locale', required: false, example: 'zh-CN' })
  async listCategories(@Query('locale') locale?: string) {
    try {
      return successResponse({
        categories: listWishCategoryOptions(locale ?? 'zh-CN'),
      });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('suggestions/cards')
  @ApiOperation({ summary: 'AI 推荐愿望卡片' })
  @ApiQuery({ name: 'category', required: false })
  async getSuggestionCards(
    @Param('tripId') tripId: string,
    @Query('category') category?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.wishService.listMine(tripId, this.resolveUserId(user));
      const parsedCategory = category && isWishCategory(category) ? (category as WishCategory) : undefined;
      const cards = this.wishService.getSuggestionCards(parsedCategory);
      return successResponse({ cards });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('inspiration')
  @ApiOperation({ summary: '冰岛灵感图库' })
  @ApiQuery({ name: 'region', required: false })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listInspiration(
    @Param('tripId') tripId: string,
    @Query('region') region?: string,
    @Query('tag') tag?: string,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.wishService.listMine(tripId, this.resolveUserId(user));
      const result = this.wishService.listInspiration({
        region,
        tag,
        offset: offset ? parseInt(offset, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      return successResponse(result);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建愿望（自由输入等）' })
  async create(
    @Param('tripId') tripId: string,
    @Body() body: CreateTripWishDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const item = await this.wishService.create(tripId, this.resolveUserId(user), body);
      return successResponse(item);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('from-card/:cardId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '从推荐卡片创建愿望' })
  async createFromCard(
    @Param('tripId') tripId: string,
    @Param('cardId') cardId: string,
    @Body() body: Partial<Pick<CreateTripWishDto, 'text' | 'importance' | 'visibility'>>,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const item = await this.wishService.createFromCard(
        tripId,
        this.resolveUserId(user),
        cardId,
        body,
      );
      return successResponse(item);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('from-inspiration')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '从灵感图库收藏为愿望' })
  async createFromInspiration(
    @Param('tripId') tripId: string,
    @Body() body: CreateWishFromInspirationDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const item = await this.wishService.createFromInspiration(
        tripId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(item);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('voice/transcribe')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('audio', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '语音转文字（STT）并生成愿望草稿',
    description:
      '上传音频 → Whisper/Mock STT → 返回 transcript 与 suggestedDraft，供用户编辑后调用 from-voice 确认提交。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio'],
      properties: {
        audio: { type: 'string', format: 'binary' },
        language: { type: 'string', example: 'zh-CN' },
        format: { type: 'string', example: 'audio/webm' },
      },
    },
  })
  async transcribeVoice(
    @Param('tripId') tripId: string,
    @UploadedFile() file: MulterFile | undefined,
    @Body() body: { language?: string; format?: string },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      if (!file?.buffer?.length) {
        throw new BadRequestException('请上传音频文件');
      }
      const result = await this.wishVoiceService.transcribe(
        tripId,
        this.resolveUserId(user),
        file.buffer,
        {
          language: body.language,
          format: body.format ?? file.mimetype,
        },
      );
      return successResponse(result);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('from-voice')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '从已确认转写文本创建愿望',
    description: '用户在 transcribe 结果上编辑后，携带 voiceTranscriptId 提交。',
  })
  async createFromVoiceText(
    @Param('tripId') tripId: string,
    @Body() body: CreateWishFromVoiceDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const item = await this.wishVoiceService.createFromConfirmed(
        tripId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(item);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('from-voice/audio')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('audio', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '语音一键创建愿望（STT + 提交）',
    description: '适合「按住说话直接提交」场景，跳过手动确认步骤。',
  })
  async createFromVoiceAudio(
    @Param('tripId') tripId: string,
    @UploadedFile() file: MulterFile | undefined,
    @Body()
    body: {
      language?: string;
      format?: string;
      category?: string;
      importance?: string;
      visibility?: string;
    },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      if (!file?.buffer?.length) {
        throw new BadRequestException('请上传音频文件');
      }
      const category =
        body.category && isWishCategory(body.category)
          ? (body.category as WishCategory)
          : undefined;
      const importance = body.importance ? parseInt(body.importance, 10) : undefined;
      const visibility = body.visibility as WishVisibility | undefined;

      const result = await this.wishVoiceService.createFromAudio(
        tripId,
        this.resolveUserId(user),
        file.buffer,
        {
          language: body.language,
          format: body.format ?? file.mimetype,
          category,
          importance: Number.isFinite(importance) ? importance : undefined,
          visibility,
        },
      );
      return successResponse(result);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Patch(':wishId')
  @ApiOperation({ summary: '更新愿望（含隐私开关）' })
  async update(
    @Param('tripId') tripId: string,
    @Param('wishId') wishId: string,
    @Body() body: UpdateTripWishDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const item = await this.wishService.update(tripId, wishId, this.resolveUserId(user), body);
      return successResponse(item);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Delete(':wishId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '归档愿望' })
  async archive(
    @Param('tripId') tripId: string,
    @Param('wishId') wishId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.wishService.archive(tripId, wishId, this.resolveUserId(user));
      return successResponse({ archived: true, wishId });
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) {
      return user.userId;
    }
    if (process.env.NODE_ENV !== 'production') {
      return 'anonymous-dev-user';
    }
    throw new UnauthorizedException('未认证或 token 无效');
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException || e instanceof BadRequestException) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}

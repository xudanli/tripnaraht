import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { TripFileService } from './services/trip-file.service';
import { CreateTripFilePendingDto } from './dto/trip-file.dto';
import { TRIP_FILE_CATEGORY_IDS } from './trip-file.constants';

@ApiTags('trip-files')
@Public()
@Controller('trips/:tripId/files')
export class TripFilesController {
  constructor(private readonly fileService: TripFileService) {}

  @Get()
  @ApiOperation({ summary: '行程文件列表（P0）' })
  @ApiParam({ name: 'tripId' })
  @ApiQuery({ name: 'category', required: false, enum: TRIP_FILE_CATEGORY_IDS })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['UPLOADED', 'PENDING', 'EXPIRED'] })
  async list(
    @Param('tripId') tripId: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.fileService.listFiles(tripId, this.resolveUserId(user), {
        category,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
        status,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('stats')
  @ApiOperation({ summary: '行程文件统计与空间用量（P0）' })
  @ApiParam({ name: 'tripId' })
  async stats(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.fileService.getStats(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('overview')
  @ApiOperation({
    summary: '文件 Tab 聚合读模型（trip_files + 行程项预订资料，方案 A）',
  })
  @ApiParam({ name: 'tripId' })
  @ApiQuery({ name: 'category', required: false, enum: TRIP_FILE_CATEGORY_IDS })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: ['trip_file', 'itinerary_booking', 'itinerary_link', 'itinerary_pending'],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'includePending', required: false, type: Boolean })
  async overview(
    @Param('tripId') tripId: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('source') source?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('includePending') includePending?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const includePendingFlag =
        includePending === undefined
          ? undefined
          : includePending === 'true' || includePending === '1';
      return successResponse(
        await this.fileService.getOverview(tripId, this.resolveUserId(user), {
          category,
          status,
          source,
          limit: limit ? parseInt(limit, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
          includePending: includePendingFlag,
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '上传行程文件（multipart）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        category: { type: 'string', enum: [...TRIP_FILE_CATEGORY_IDS] },
        title: { type: 'string' },
        description: { type: 'string' },
        expiresAt: { type: 'string', format: 'date-time' },
        itineraryItemId: { type: 'string' },
      },
      required: ['file', 'category'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Param('tripId') tripId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      category: string;
      title?: string;
      description?: string;
      expiresAt?: string;
      itineraryItemId?: string;
    },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.fileService.uploadFile(
        tripId,
        this.resolveUserId(user),
        file,
        body,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('pending')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建待补充文件占位（无附件）' })
  async createPending(
    @Param('tripId') tripId: string,
    @Body() body: CreateTripFilePendingDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.fileService.createPendingPlaceholder(
          tripId,
          this.resolveUserId(user),
          body,
        ),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':fileId/download')
  @ApiOperation({ summary: '获取文件下载签名 URL' })
  async download(
    @Param('tripId') tripId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.fileService.getDownloadUrl(tripId, this.resolveUserId(user), fileId),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除行程文件' })
  async remove(
    @Param('tripId') tripId: string,
    @Param('fileId') fileId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.fileService.deleteFile(tripId, this.resolveUserId(user), fileId),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) return user.userId;
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('未认证或 token 无效');
  }

  private handleError(e: unknown) {
    if (
      e instanceof UnauthorizedException ||
      e instanceof BadRequestException ||
      e instanceof NotFoundException ||
      e instanceof ForbiddenException
    ) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}

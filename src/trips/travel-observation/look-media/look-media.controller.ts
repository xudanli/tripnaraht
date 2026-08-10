import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { LookMediaStore } from './look-media.store';

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
]);

interface MulterFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

/**
 * NARA Look media upload — `POST /api/v1/trips/:tripId/media`
 * Returns mediaId/mediaRef for observation create / append.
 */
@ApiTags('nara-look-media')
@Public()
@Controller('v1/trips/:tripId/media')
export class LookMediaController {
  constructor(private readonly media: LookMediaStore) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Upload field observation media (multipart). Use mediaRef in POST …/observations.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }),
  )
  async upload(
    @Param('tripId') tripId: string,
    @UploadedFile() file: MulterFile | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: 'LOOK_MEDIA_REQUIRED',
        message: 'multipart field "file" is required',
      });
    }
    const mime = file.mimetype ?? 'application/octet-stream';
    if (!ALLOWED.has(mime) && !mime.startsWith('image/')) {
      throw new BadRequestException({
        code: 'LOOK_MEDIA_TYPE_UNSUPPORTED',
        message: `Unsupported mime type: ${mime}`,
      });
    }
    if (file.buffer.length > MAX_BYTES) {
      throw new BadRequestException({
        code: 'LOOK_MEDIA_TOO_LARGE',
        message: `Max size ${MAX_BYTES} bytes`,
      });
    }

    const record = await this.media.save({
      tripId,
      buffer: file.buffer,
      originalName: file.originalname ?? 'capture.jpg',
      mimeType: mime,
    });

    return {
      mediaId: record.mediaId,
      mediaRef: record.mediaRef,
      mimeType: record.mimeType,
      bytes: record.bytes,
      fileName: record.fileName,
      url: record.url,
      category: record.category,
      createdAt: record.createdAt,
    };
  }

  @Get(':mediaId')
  @ApiOperation({ summary: 'Resolve Look media metadata' })
  @ApiParam({ name: 'mediaId' })
  get(
    @Param('tripId') tripId: string,
    @Param('mediaId') mediaId: string,
  ) {
    const record = this.media.get(mediaId);
    if (!record || record.tripId !== tripId) {
      throw new NotFoundException(`Media ${mediaId} not found`);
    }
    return {
      mediaId: record.mediaId,
      mediaRef: record.mediaRef,
      mimeType: record.mimeType,
      bytes: record.bytes,
      fileName: record.fileName,
      url: record.url,
      category: record.category,
      createdAt: record.createdAt,
    };
  }
}

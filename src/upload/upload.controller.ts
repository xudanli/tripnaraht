import {
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  Get,
  Param,
  Body,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Upload')
@Controller('upload')
@Public()
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: '检查上传服务状态' })
  getStatus() {
    return {
      available: this.uploadService.isAvailable(),
      message: this.uploadService.isAvailable()
        ? 'OSS 服务正常'
        : 'OSS 未配置，请设置环境变量',
    };
  }

  @Post('image')
  @ApiOperation({ summary: '上传单张图片' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        folder: { type: 'string', default: 'places' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('只允许上传图片文件'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    if (!file) {
      throw new BadRequestException('请选择要上传的图片');
    }

    const result = await this.uploadService.uploadImage(file, folder || 'places');
    
    return {
      success: true,
      data: result,
    };
  }

  @Post('images')
  @ApiOperation({ summary: '批量上传图片（最多10张）' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('只允许上传图片文件'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('folder') folder?: string,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('请选择要上传的图片');
    }

    const results = await this.uploadService.uploadImages(files, folder || 'places');
    
    return {
      success: true,
      data: results,
      count: results.length,
    };
  }

  @Post('place/:placeId/images')
  @ApiOperation({ summary: '为景点上传图片' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new BadRequestException('只允许上传图片文件'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  async uploadPlaceImages(
    @Param('placeId') placeId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('captions') captions?: string, // JSON string: ["caption1", "caption2"]
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('请选择要上传的图片');
    }

    // 检查景点是否存在
    const place = await this.prisma.place.findUnique({
      where: { id: parseInt(placeId) },
    });

    if (!place) {
      throw new BadRequestException('景点不存在');
    }

    // 上传图片
    const uploadResults = await this.uploadService.uploadImages(files, `places/${placeId}`);

    // 解析 captions
    let captionList: string[] = [];
    if (captions) {
      try {
        captionList = JSON.parse(captions);
      } catch {
        // ignore
      }
    }

    // 构建图片数据
    const newImages = uploadResults.map((result, index) => ({
      url: result.url,
      key: result.key,
      caption: captionList[index] || '',
      source: 'upload',
      isPrimary: index === 0,
      uploadedAt: new Date().toISOString(),
    }));

    // 更新 Place metadata
    const currentMetadata = (place.metadata as any) || {};
    const existingImages = currentMetadata.images || [];
    
    // 如果之前没有图片，新的第一张为 primary
    if (existingImages.length > 0) {
      newImages.forEach(img => img.isPrimary = false);
    }

    const updatedMetadata = {
      ...currentMetadata,
      images: [...existingImages, ...newImages],
    };

    await this.prisma.place.update({
      where: { id: parseInt(placeId) },
      data: { metadata: updatedMetadata },
    });

    return {
      success: true,
      data: {
        placeId: parseInt(placeId),
        placeName: place.nameCN,
        newImages,
        totalImages: updatedMetadata.images.length,
      },
    };
  }

  @Get('place/:placeId/images')
  @ApiOperation({ summary: '获取景点图片列表' })
  async getPlaceImages(@Param('placeId') placeId: string) {
    const place = await this.prisma.place.findUnique({
      where: { id: parseInt(placeId) },
      select: { id: true, nameCN: true, metadata: true },
    });

    if (!place) {
      throw new BadRequestException('景点不存在');
    }

    const metadata = (place.metadata as any) || {};
    const images = metadata.images || [];

    return {
      success: true,
      data: {
        placeId: place.id,
        placeName: place.nameCN,
        images,
        count: images.length,
      },
    };
  }
}

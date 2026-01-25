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
  Delete,
  Query,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

// Multer file type
interface MulterFile {
  buffer: Buffer;
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
}

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
    @UploadedFile() file: MulterFile,
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
    @UploadedFiles() files: MulterFile[],
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
    @UploadedFiles() files: MulterFile[],
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

  @Delete('image')
  @ApiOperation({ summary: '删除单个图片' })
  @ApiQuery({ name: 'key', description: '图片在 OSS 中的 key（存储路径）', example: 'places/123/abc.jpg', required: true })
  async deleteImage(@Query('key') key: string) {
    if (!key) {
      throw new BadRequestException('图片 key 不能为空');
    }

    try {
      await this.uploadService.deleteImage(key);
      return {
        success: true,
        data: {
          key,
          message: '图片删除成功',
        },
      };
    } catch (error: any) {
      throw new BadRequestException(`删除图片失败: ${error.message}`);
    }
  }

  @Delete('place/:placeId/images')
  @ApiOperation({ 
    summary: '删除景点图片',
    description: '删除指定景点的图片。可以通过 key 或 index 指定要删除的图片。删除后会自动从景点的 metadata.images 中移除。'
  })
  @ApiParam({ name: 'placeId', description: '景点 ID', type: Number, example: 381041 })
  @ApiQuery({ name: 'key', description: '图片的 OSS key（优先使用）', required: false, example: 'places/381041/abc.jpg' })
  @ApiQuery({ name: 'index', description: '图片在列表中的索引（从 0 开始）', required: false, type: Number, example: 0 })
  async deletePlaceImage(
    @Param('placeId') placeId: string,
    @Query('key') key?: string,
    @Query('index') index?: string,
  ) {
    // 检查景点是否存在
    const place = await this.prisma.place.findUnique({
      where: { id: parseInt(placeId) },
    });

    if (!place) {
      throw new BadRequestException('景点不存在');
    }

    const metadata = (place.metadata as any) || {};
    const images = metadata.images || [];

    if (images.length === 0) {
      throw new BadRequestException('景点没有图片');
    }

    // 确定要删除的图片
    let imageToDelete: any = null;
    let deleteIndex = -1;

    if (key) {
      // 通过 key 查找
      deleteIndex = images.findIndex((img: any) => img.key === key);
      if (deleteIndex === -1) {
        throw new BadRequestException(`未找到 key 为 "${key}" 的图片`);
      }
      imageToDelete = images[deleteIndex];
    } else if (index !== undefined) {
      // 通过索引查找
      const idx = parseInt(index, 10);
      if (isNaN(idx) || idx < 0 || idx >= images.length) {
        throw new BadRequestException(`索引 ${index} 无效，图片列表共有 ${images.length} 张图片`);
      }
      deleteIndex = idx;
      imageToDelete = images[deleteIndex];
    } else {
      throw new BadRequestException('请提供 key 或 index 参数');
    }

    // 如果图片有 key（上传的图片），从 OSS 删除
    if (imageToDelete.key) {
      try {
        await this.uploadService.deleteImage(imageToDelete.key);
      } catch (error: any) {
        // OSS 删除失败不影响数据库更新（可能图片已被删除）
        console.warn(`OSS 删除失败（可能图片不存在）: ${error.message}`);
      }
    }

    // 从 metadata.images 中移除
    const updatedImages = images.filter((_: any, idx: number) => idx !== deleteIndex);

    // 如果删除的是主图，且还有其他图片，将第一张设为主图
    if (imageToDelete.isPrimary && updatedImages.length > 0) {
      updatedImages[0].isPrimary = true;
    }

    // 更新 Place metadata
    const updatedMetadata = {
      ...metadata,
      images: updatedImages,
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
        deletedImage: {
          url: imageToDelete.url,
          key: imageToDelete.key,
          caption: imageToDelete.caption,
        },
        remainingImages: updatedImages.length,
        totalImages: updatedImages.length,
      },
    };
  }
}

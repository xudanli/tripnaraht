import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import * as fs from 'fs';
import { Public } from '../auth/decorators/public.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import { HikingOfflinePackService } from './services/hiking-offline-pack.service';

@ApiTags('Hiking Offline Pack (P2)')
@Controller()
export class HikingOfflinePackController {
  constructor(private readonly offlinePack: HikingOfflinePackService) {}

  @Public()
  @Get('hiking/route-directions/:id/offline-pack')
  @ApiOperation({
    summary: '徒步路线离线包元数据（GeoJSON + 瓦片清单 URL）',
    description:
      '生成或刷新 data/hiking/offline-packs 下静态文件，并返回可 GET 的绝对 URL。首次调用会写盘。',
  })
  @ApiParam({ name: 'id', description: 'route-directions 数字 ID' })
  async getRouteOfflinePack(@Param('id', ParseIntPipe) id: number) {
    const data = await this.offlinePack.getOfflinePack(id);
    return successResponse(data);
  }

  @Public()
  @Get('hiking/offline-packs/:packKey/route.geojson')
  @Header('Content-Type', 'application/geo+json')
  @ApiOperation({ summary: '下载路线离线 GeoJSON' })
  async serveGeoJson(@Param('packKey') packKey: string, @Res() res: Response) {
    await this.streamPackFile(packKey, 'route.geojson', res);
  }

  @Public()
  @Get('hiking/offline-packs/:packKey/tile-manifest.json')
  @Header('Content-Type', 'application/json')
  @ApiOperation({ summary: '下载瓦片缓存清单' })
  async serveTileManifest(@Param('packKey') packKey: string, @Res() res: Response) {
    await this.streamPackFile(packKey, 'tile-manifest.json', res);
  }

  @Public()
  @Get('hiking/offline-packs/:packKey/vector-tile-manifest.json')
  @Header('Content-Type', 'application/json')
  @ApiOperation({ summary: '下载 Mapbox 矢量瓦片清单（F4）' })
  async serveVectorTileManifest(@Param('packKey') packKey: string, @Res() res: Response) {
    await this.streamPackFile(packKey, 'vector-tile-manifest.json', res);
  }

  @Public()
  @Get('hiking/offline-packs/:packKey/tiles/:z/:x/:y.pbf')
  @Header('Content-Type', 'application/vnd.mapbox-vector-tile')
  @ApiOperation({ summary: '下载预打包 Mapbox 矢量瓦片（F4 CDN）' })
  async serveVectorTile(
    @Param('packKey') packKey: string,
    @Param('z') z: string,
    @Param('x') x: string,
    @Param('y') y: string,
    @Res() res: Response,
  ) {
    try {
      const filePath = await this.offlinePack.resolveVectorTileFile(packKey, z, x, y);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      if (e instanceof NotFoundException) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: e.message },
        });
        return;
      }
      throw e;
    }
  }

  private async streamPackFile(
    packKey: string,
    filename: 'route.geojson' | 'tile-manifest.json' | 'vector-tile-manifest.json',
    res: Response,
  ) {
    try {
      const filePath = await this.offlinePack.resolvePackFile(packKey, filename);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      fs.createReadStream(filePath).pipe(res);
    } catch (e) {
      if (e instanceof NotFoundException) {
        res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: e.message },
        });
        return;
      }
      throw e;
    }
  }
}

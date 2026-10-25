import {
  Controller,
  Get,
  Header,
  Param,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { TripPdfService } from './trip-pdf.service';

@ApiTags('trips')
@Public()
@Controller('trips/:tripId/export')
export class TripPdfController {
  constructor(private readonly tripPdfService: TripPdfService) {}

  @Get('pdf')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: '导出行程 PDF',
    description:
      '按日导出行程单（标题、日期、地点、时间、备注）。需为行程成员；非生产环境无 token 时按开发用户放行。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiProduces('application/pdf')
  async exportPdf(
    @Param('tripId') tripId: string,
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.tripPdfService.exportPdf(tripId, this.resolveUserId(user));
    const encoded = encodeURIComponent(file.filename);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="trip.pdf"; filename*=UTF-8''${encoded}`,
    });
    return new StreamableFile(file.buffer);
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) return user.userId;
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('未认证或 token 无效');
  }
}

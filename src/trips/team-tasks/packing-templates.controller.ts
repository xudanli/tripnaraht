import {
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  NotFoundException,
  Param,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { TeamTasksService } from './services/team-tasks.service';

@ApiTags('trip-packing-templates')
@ApiBearerAuth()
@Public()
@Controller('trips/:tripId/packing-templates')
export class PackingTemplatesController {
  constructor(private readonly tasks: TeamTasksService) {}

  @Get()
  @ApiOperation({ summary: '打包清单模板目录' })
  @ApiParam({ name: 'tripId' })
  async list(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.listTemplates(
        tripId,
        this.resolveUserId(user),
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Get(':templateId')
  @ApiOperation({ summary: '打包清单模板条目' })
  async detail(
    @Param('tripId') tripId: string,
    @Param('templateId') templateId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.tasks.getTemplate(
        tripId,
        this.resolveUserId(user),
        templateId,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) return user.userId;
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('未认证或 token 无效');
  }

  private handleErrorOrThrow(e: unknown) {
    if (
      e instanceof UnauthorizedException ||
      e instanceof ForbiddenException ||
      e instanceof NotFoundException ||
      e instanceof BadRequestException ||
      e instanceof ConflictException ||
      e instanceof HttpException
    ) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}

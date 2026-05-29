import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { AdminStrictAuthGuard } from '../admin/guards/admin-strict-auth.guard';
import { ApiSuccessResponseDto, ApiErrorResponseDto } from '../common/dto/api-response.dto';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { CountriesAdminService } from './countries-admin.service';
import {
  GetCountryProfilesAdminQueryDto,
  PatchCountryProfileAdminDto,
  UpsertCountryProfileAdminDto,
} from './dto/country-profile-admin.dto';
@ApiTags('countries-admin')
@Controller('admin/countries')
@Public()
@UseGuards(AdminStrictAuthGuard)
@ApiBearerAuth()
@ApiHeader({
  name: 'x-admin-god-key',
  required: false,
  description: 'Optional when ADMIN_GOD_API_KEY is set (alternative to Bearer admin JWT)',
})
export class CountriesAdminController {
  private readonly logger = new Logger(CountriesAdminController.name);

  constructor(private readonly countriesAdminService: CountriesAdminService) {}

  @Get('profiles')
  @ApiOperation({
    summary: '国家档案列表（管理）',
    description: '分页列出 CountryProfile（V2）。需管理员鉴权。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async listProfiles(@Query() query: GetCountryProfilesAdminQueryDto) {
    try {
      const result = await this.countriesAdminService.list(query);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error, 'listProfiles');
    }
  }

  @Post('profiles/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '校验 V2 国家档案 JSON（不落库）',
    description: '与创建/更新使用相同 Zod 规则，用于管理后台保存前校验。',
  })
  @ApiBody({ type: UpsertCountryProfileAdminDto })
  async validateProfile(@Body() body: UpsertCountryProfileAdminDto) {
    try {
      const result = this.countriesAdminService.validateBody(body);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error, 'validateProfile');
    }
  }

  @Get('profiles/:isoCode')
  @ApiOperation({ summary: '国家档案详情（管理）' })
  @ApiParam({ name: 'isoCode', example: 'IS' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorResponseDto })
  async getProfile(@Param('isoCode') isoCode: string) {
    try {
      const profile = await this.countriesAdminService.getByIsoCode(isoCode);
      return successResponse(profile);
    } catch (error) {
      return this.handleError(error, 'getProfile');
    }
  }

  @Post('profiles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '创建国家档案（V2）',
    description: '请求体与 data/country-profiles/*.v2.json 同构，经 Zod 校验后写入 Prisma。',
  })
  @ApiBody({ type: UpsertCountryProfileAdminDto })
  @ApiResponse({ status: 201, type: ApiSuccessResponseDto })
  async createProfile(@Body() dto: UpsertCountryProfileAdminDto) {
    try {
      const profile = await this.countriesAdminService.create(dto);
      return successResponse(profile);
    } catch (error) {
      return this.handleError(error, 'createProfile');
    }
  }

  @Put('profiles/:isoCode')
  @ApiOperation({ summary: '全量更新国家档案（V2）' })
  @ApiParam({ name: 'isoCode', example: 'IS' })
  @ApiBody({ type: UpsertCountryProfileAdminDto })
  async replaceProfile(
    @Param('isoCode') isoCode: string,
    @Body() dto: UpsertCountryProfileAdminDto,
  ) {
    try {
      const profile = await this.countriesAdminService.replace(isoCode, dto);
      return successResponse(profile);
    } catch (error) {
      return this.handleError(error, 'replaceProfile');
    }
  }

  @Patch('profiles/:isoCode')
  @ApiOperation({
    summary: '部分更新国家档案',
    description: 'JSON 字段与现有记录浅合并（schemaVersion 恒为 2）。',
  })
  @ApiParam({ name: 'isoCode', example: 'IS' })
  @ApiBody({ type: PatchCountryProfileAdminDto })
  async patchProfile(
    @Param('isoCode') isoCode: string,
    @Body() dto: PatchCountryProfileAdminDto,
  ) {
    try {
      const profile = await this.countriesAdminService.patch(isoCode, dto);
      return successResponse(profile);
    } catch (error) {
      return this.handleError(error, 'patchProfile');
    }
  }

  @Delete('profiles/:isoCode')
  @ApiOperation({ summary: '删除国家档案（硬删除）' })
  @ApiParam({ name: 'isoCode', example: 'XX' })
  async deleteProfile(@Param('isoCode') isoCode: string) {
    try {
      const result = await this.countriesAdminService.remove(isoCode);
      return successResponse(result);
    } catch (error) {
      return this.handleError(error, 'deleteProfile');
    }
  }

  private handleError(error: unknown, op: string): ReturnType<typeof errorResponse> {
    if (error instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, error.message);
    }
    if (error instanceof ConflictException) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, error.message);
    }
    if (error instanceof BadRequestException) {
      const res = error.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : typeof res === 'object' && res && 'message' in res
            ? String((res as { message: unknown }).message)
            : error.message;
      return errorResponse(ErrorCode.VALIDATION_ERROR, message, typeof res === 'object' ? (res as object) : undefined);
    }
    const err = error as Error;
    this.logger.error(`[${op}] ${err.message}`, err.stack);
    return errorResponse(ErrorCode.INTERNAL_ERROR, err.message);
  }
}

/**
 * 兼容路径 `/api/countries/admin/*`（推荐 `/api/admin/countries/*`）。
 */
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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { AdminStrictAuthGuard } from '../admin/guards/admin-strict-auth.guard';
import { CountriesAdminController } from './countries-admin.controller';
import {
  GetCountryProfilesAdminQueryDto,
  PatchCountryProfileAdminDto,
  UpsertCountryProfileAdminDto,
} from './dto/country-profile-admin.dto';

@ApiTags('countries-admin')
@Controller('countries/admin')
@Public()
@UseGuards(AdminStrictAuthGuard)
@ApiBearerAuth()
@ApiHeader({
  name: 'x-admin-god-key',
  required: false,
  description: 'Optional when ADMIN_GOD_API_KEY is set',
})
export class CountriesAdminLegacyController extends CountriesAdminController {
  @Get('profiles')
  override listProfiles(@Query() query: GetCountryProfilesAdminQueryDto) {
    return super.listProfiles(query);
  }

  @Post('profiles/validate')
  @HttpCode(HttpStatus.OK)
  override validateProfile(@Body() body: UpsertCountryProfileAdminDto) {
    return super.validateProfile(body);
  }

  @Get('profiles/:isoCode')
  override getProfile(@Param('isoCode') isoCode: string) {
    return super.getProfile(isoCode);
  }

  @Post('profiles')
  @HttpCode(HttpStatus.CREATED)
  override createProfile(@Body() dto: UpsertCountryProfileAdminDto) {
    return super.createProfile(dto);
  }

  @Put('profiles/:isoCode')
  override replaceProfile(
    @Param('isoCode') isoCode: string,
    @Body() dto: UpsertCountryProfileAdminDto,
  ) {
    return super.replaceProfile(isoCode, dto);
  }

  @Patch('profiles/:isoCode')
  override patchProfile(
    @Param('isoCode') isoCode: string,
    @Body() dto: PatchCountryProfileAdminDto,
  ) {
    return super.patchProfile(isoCode, dto);
  }

  @Delete('profiles/:isoCode')
  override deleteProfile(@Param('isoCode') isoCode: string) {
    return super.deleteProfile(isoCode);
  }
}

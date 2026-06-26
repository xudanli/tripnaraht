import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { successResponse } from '../../../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../../../common/dto/api-response.dto';
import { NarrativeFeatureGuard } from '../guards/narrative-feature.guard';
import { NarrativeThemeService } from '../services/narrative-theme.service';
import {
  NarrativeIntakeRequestDto,
  RegenerateThemeRequestDto,
  SelectThemeRequestDto,
} from '../dto/narrative-intake.dto';

@ApiTags('Narrative Engine')
@Public()
@UseGuards(NarrativeFeatureGuard)
@Controller('trips/:tripId/narrative')
export class NarrativeThemeController {
  constructor(private readonly themeService: NarrativeThemeService) {}

  @Post('intake')
  @ApiOperation({ summary: 'Submit narrative intake and generate theme candidates' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async submitIntake(
    @Param('tripId') tripId: string,
    @Body() body: NarrativeIntakeRequestDto,
  ) {
    const result = await this.themeService.generateCandidates(
      tripId,
      body.intake,
      { locale: body.locale },
    );
    return successResponse({ tripId, ...result });
  }

  @Post('theme/select')
  @ApiOperation({ summary: 'Confirm selected travel theme' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async selectTheme(
    @Param('tripId') tripId: string,
    @Body() body: SelectThemeRequestDto,
  ) {
    const theme = await this.themeService.selectTheme(
      tripId,
      body.themeId,
      body.generationRequestId,
    );
    const storyform = await this.themeService.getTheme(tripId);
    return successResponse({ tripId, theme, storyform });
  }

  @Post('theme/regenerate')
  @ApiOperation({ summary: 'Regenerate theme candidates' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async regenerate(
    @Param('tripId') tripId: string,
    @Body() body: RegenerateThemeRequestDto,
  ) {
    const result = await this.themeService.regenerateCandidates(
      tripId,
      body.generationRequestId,
    );
    return successResponse({ tripId, ...result });
  }

  @Get('theme')
  @ApiOperation({ summary: 'Get selected travel theme and storyform' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getTheme(@Param('tripId') tripId: string) {
    const theme = await this.themeService.getThemeMetadata(tripId);
    const storyform = theme ? await this.themeService.getTheme(tripId) : null;
    return successResponse({ tripId, theme, storyform });
  }

  @Delete('theme')
  @ApiOperation({ summary: 'Clear selected travel theme' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async clearTheme(@Param('tripId') tripId: string) {
    await this.themeService.clearTheme(tripId);
    return successResponse({ tripId, cleared: true });
  }
}

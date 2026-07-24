import { Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import {
  isAssertionPromotionEnabled,
  resolveAssertionPromotionInternalSecret,
} from './assertion-promotion.config';
import { AssertionPromotionService } from './assertion-promotion.service';
import type { AssertionPromotionRequest } from './assertion-promotion.types';

@ApiTags('internal-monitoring')
@Public()
@Controller('internal/monitoring')
export class AssertionPromotionController {
  constructor(private readonly promotion: AssertionPromotionService) {}

  @Post('promote-assertion')
  @ApiOperation({
    summary: 'Assertion Auto-Promotion — promote World State assertion to pipeline (shadow/live)',
  })
  async promoteAssertion(
    @Headers('x-assertion-promotion-secret') secretHeader: string | undefined,
    @Body() body: AssertionPromotionRequest,
  ) {
    this.assertInternalSecret(secretHeader);
    if (!isAssertionPromotionEnabled()) {
      return { ok: false, error: 'ASSERTION_PROMOTION_DISABLED' };
    }
    const result = await this.promotion.promote(body);
    return { ok: true, result };
  }

  private assertInternalSecret(header: string | undefined): void {
    const expected = resolveAssertionPromotionInternalSecret();
    if (!expected) {
      throw new ForbiddenException('ASSERTION_PROMOTION_INTERNAL_SECRET unset');
    }
    if (header !== expected) {
      throw new ForbiddenException('invalid_assertion_promotion_secret');
    }
  }
}

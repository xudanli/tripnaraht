/**
 * POST /internal/evidence/weather/vedur — signed Vedur collector ingest (contract v1).
 */

import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { VedurEvidenceIngestRequest } from '../contracts/vedur-evidence-ingest.types';
import { VedurCollectorIngestService } from '../evidence/vedur-collector-ingest.service';

@ApiTags('internal-evidence')
@Controller('internal/evidence/weather')
export class VedurEvidenceIngestController {
  constructor(private readonly ingestService: VedurCollectorIngestService) {}

  @Post('vedur')
  @ApiOperation({
    summary: 'Ingest signed Vedur raw XML from remote collector (iceland_met authoritative)',
  })
  async ingestVedur(@Body() body: VedurEvidenceIngestRequest) {
    return this.ingestService.ingest(body);
  }
}

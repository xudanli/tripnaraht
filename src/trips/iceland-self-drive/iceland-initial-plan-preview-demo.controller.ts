/**
 * Serves the read-only Preview demo HTML for local FE wiring checks.
 */

import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Public } from '../../auth/decorators/public.decorator';

@ApiExcludeController()
@Public()
@Controller('iceland-self-drive')
export class IcelandInitialPlanPreviewDemoController {
  @Get('preview-demo')
  @Header('Content-Type', 'text/html; charset=utf-8')
  demo(): string {
    const candidates = [
      join(__dirname, 'demo', 'preview-demo.html'),
      join(process.cwd(), 'src/trips/iceland-self-drive/demo/preview-demo.html'),
      join(process.cwd(), 'dist/trips/iceland-self-drive/demo/preview-demo.html'),
    ];
    for (const p of candidates) {
      try {
        return readFileSync(p, 'utf8');
      } catch {
        /* try next */
      }
    }
    return `<!doctype html><html><body><p>Demo HTML missing. See FRONTEND_PREVIEW_INTEGRATION.md</p></body></html>`;
  }
}

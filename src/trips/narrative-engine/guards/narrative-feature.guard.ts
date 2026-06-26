import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

export function isNarrativeThemeV1Enabled(): boolean {
  return process.env.NARRATIVE_THEME_V1 === 'true';
}

@Injectable()
export class NarrativeFeatureGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (!isNarrativeThemeV1Enabled()) {
      throw new NotFoundException({
        code: 'NARRATIVE_THEME_DISABLED',
        message: 'Narrative theme feature is not enabled',
      });
    }
    return true;
  }
}

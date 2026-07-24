import * as fs from 'fs';
import * as path from 'path';
import {
  ROUTE_AND_RUN_OPTIONS_OPENAPI_FREEZE,
} from './route-and-run-options.openapi.freeze';

describe('route_and_run options OpenAPI freeze', () => {
  const dtoPath = path.join(__dirname, '../dto/route-and-run.dto.ts');
  const dtoSrc = fs.readFileSync(dtoPath, 'utf8');

  it('freezes execution_mode enum + default ADVICE_ONLY in DTO source', () => {
    const freeze = ROUTE_AND_RUN_OPTIONS_OPENAPI_FREEZE.execution_mode;
    expect(freeze.enum).toEqual(['ADVICE_ONLY', 'SEMI_AUTO', 'AUTO']);
    expect(freeze.default).toBe('ADVICE_ONLY');
    expect(dtoSrc).toMatch(/execution_mode\?:/);
    expect(dtoSrc).toMatch(/enum:\s*\['ADVICE_ONLY',\s*'SEMI_AUTO',\s*'AUTO'\]/);
    expect(dtoSrc).toMatch(/default:\s*'ADVICE_ONLY'/);
  });

  it('freezes allow_flawed_draft_narrate boolean in DTO source', () => {
    const freeze = ROUTE_AND_RUN_OPTIONS_OPENAPI_FREEZE.allow_flawed_draft_narrate;
    expect(freeze.type).toBe('boolean');
    expect(freeze.required).toBe(false);
    expect(dtoSrc).toMatch(/allow_flawed_draft_narrate\?:/);
    expect(dtoSrc).toMatch(/@IsBoolean\(\)[\s\S]{0,80}allow_flawed_draft_narrate/);
  });
});

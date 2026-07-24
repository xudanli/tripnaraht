/**
 * RB-1 — Actions rollback product stub label (facts only).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  ACTIONS_ROLLBACK_HTTP_ENTRY,
  ACTIONS_ROLLBACK_PRODUCT_LABEL,
  ACTIONS_ROLLBACK_PRODUCT_STATUS,
  ACTIONS_ROLLBACK_STUB_MESSAGE,
} from './rollback-corridor.product.constants';

const ROOT = path.resolve(__dirname, '../../..');

describe('actions-rollback-stub.product.contract (RB-1)', () => {
  it('exports STUB_NO_SIDE_EFFECTS product status and message', () => {
    expect(ACTIONS_ROLLBACK_PRODUCT_STATUS).toBe('STUB_NO_SIDE_EFFECTS');
    expect(ACTIONS_ROLLBACK_STUB_MESSAGE).toBe(
      'Rollback accepted (stub, no side effects).',
    );
    expect(ACTIONS_ROLLBACK_HTTP_ENTRY).toBe('POST /api/agent/actions/rollback');
    expect(ACTIONS_ROLLBACK_PRODUCT_LABEL).toMatch(/product stub/i);
  });

  it('service and controller wire stub constants', () => {
    const service = fs.readFileSync(
      path.join(ROOT, 'src/agent/services/action-execution.service.ts'),
      'utf8',
    );
    const ctrl = fs.readFileSync(
      path.join(ROOT, 'src/agent/actions.controller.ts'),
      'utf8',
    );
    expect(service).toContain('ACTIONS_ROLLBACK_STUB_MESSAGE');
    expect(service).toContain('ACTIONS_ROLLBACK_PRODUCT_STATUS');
    expect(service).toContain('product stub — does not reverse commits');
    expect(ctrl).toContain('ACTIONS_ROLLBACK_STUB_MESSAGE');
    expect(ctrl).toContain('ACTIONS_ROLLBACK_PRODUCT_STATUS');
    expect(ctrl).toContain('ACTIONS_ROLLBACK_PRODUCT_LABEL');
  });

  it('rollback() body does not invoke compensating writers', () => {
    const service = fs.readFileSync(
      path.join(ROOT, 'src/agent/services/action-execution.service.ts'),
      'utf8',
    );
    const start = service.indexOf('async rollback(request: ActionRollbackRequestDto)');
    expect(start).toBeGreaterThan(0);
    const end = service.indexOf('getActionRegistryCatalog', start);
    const body = service.slice(start, end > start ? end : start + 900);
    expect(body).toContain('ACTIONS_ROLLBACK_STUB_MESSAGE');
    expect(body).not.toContain('sideEffectRegistry');
    expect(body).not.toContain('actionRegistry');
    expect(body).not.toContain('applyMany');
    expect(body).not.toContain('agentActionLog');
  });
});

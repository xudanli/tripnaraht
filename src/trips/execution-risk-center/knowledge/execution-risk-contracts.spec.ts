import * as fs from 'fs';
import * as path from 'path';

describe('execution-risk contracts', () => {
  const manifestPath = path.join(
    process.cwd(),
    'src/generated/execution-risk-contracts/manifest.json',
  );

  it('manifest exists with required exports and version 1.1.0', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.contractVersion).toBe('1.1.0');
    expect(manifest.requiredExports).toContain('AdjustmentItemType');
    expect(manifest.requiredExports).toContain('InterventionActionCategory');
    expect(manifest.requiredExports).toContain('ExecutionRiskKnowledgeRepository');
  });

  it('generated index exports Sprint 0A ports', () => {
    const indexPath = path.join(process.cwd(), 'src/generated/execution-risk-contracts/index.ts');
    const content = fs.readFileSync(indexPath, 'utf8');
    expect(content).toContain('ActiveRiskRefreshService');
    expect(content).toContain('CanonicalPlanVersionWriter');
    expect(content).toContain('DecisionLedgerWriter');
    expect(content).not.toContain("ROUTE_ADJUSTMENT = 'ROUTE_ADJUSTMENT'");
  });
});

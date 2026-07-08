import * as fs from 'fs';
import * as path from 'path';

describe('decision-semantics contracts', () => {
  const manifestPath = path.join(
    process.cwd(),
    'src/generated/decision-semantics-contracts/manifest.json',
  );

  it('manifest exists with required exports and version 1.6.1', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.contractVersion).toBe('1.6.1');
    expect(manifest.requiredTypeExports).toContain('DecisionProblem');
    expect(manifest.requiredTypeExports).toContain('DecisionLedgerRefs');
    expect(manifest.requiredEnumExports).toContain('ConstraintEnforcement');
  });

  it('primary entry re-exports contract types', () => {
    const indexPath = path.join(
      process.cwd(),
      'src/generated/decision-semantics-contracts/index.ts',
    );
    const content = fs.readFileSync(indexPath, 'utf8');
    expect(content).toContain('DecisionOutcomeValidation');
    expect(content).toContain('ExperienceOutcome');
  });

  it('alias entry points to contracts package', () => {
    const aliasPath = path.join(process.cwd(), 'src/generated/decision-semantics-api.ts');
    expect(fs.readFileSync(aliasPath, 'utf8')).toContain('decision-semantics-contracts');
  });
});

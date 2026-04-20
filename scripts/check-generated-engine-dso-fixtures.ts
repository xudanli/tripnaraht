import fs from 'fs';
import path from 'path';
import { execSync } from 'node:child_process';
import Ajv, { type ValidateFunction } from 'ajv';

type IndexJson = {
  fixtureVersion?: string;
  generatedAt?: string;
  outputs?: Array<{ id: string; file: string }>;
};

function fail(msg: string): never {
  // eslint-disable-next-line no-console
  console.error(msg);
  process.exit(1);
}

function must<T>(value: T | undefined | null, msg: string): T {
  if (value === undefined || value === null || value === ('' as any)) fail(msg);
  return value;
}

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function isIsoLike(s: any): boolean {
  return typeof s === 'string' && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s);
}

const fixtureSchemaAjv = new Ajv({ allErrors: true, strict: false });
let fixtureSchemaValidate: ValidateFunction<unknown> | null = null;

function getEngineDsoFixtureSchemaPath(): string {
  return path.join(
    process.cwd(),
    'src',
    'trips',
    'decision',
    'evaluation',
    'schemas',
    'engine-dso-fixture-minimal.schema.json',
  );
}

function getFixtureSchemaValidate(): ValidateFunction<unknown> {
  if (fixtureSchemaValidate) return fixtureSchemaValidate;
  const schemaPath = getEngineDsoFixtureSchemaPath();
  if (!fs.existsSync(schemaPath)) {
    fail(`[fixtures:check] missing JSON Schema (P2 minimal contract): ${schemaPath}`);
  }
  const schema = readJson(schemaPath);
  fixtureSchemaValidate = fixtureSchemaAjv.compile(schema);
  return fixtureSchemaValidate;
}

function assertFixtureMatchesMinimalSchema(fixture: unknown, ctx: { label: string; caseId: string; abs: string }) {
  const validate = getFixtureSchemaValidate();
  if (validate(fixture)) return;
  const errText = fixtureSchemaAjv.errorsText(validate.errors ?? undefined, { separator: '\n  - ' });
  fail(
    `[fixtures:check] ${ctx.label} fixture JSON Schema (minimal contract) failed: case=${ctx.caseId} (${ctx.abs})\n  - ${errText}`,
  );
}

function checkIndexAndFixtures(input: {
  label: string;
  indexPath: string;
  expectedFixtureVersion: string;
}) {
  const { label, indexPath, expectedFixtureVersion } = input;
  if (!fs.existsSync(indexPath)) fail(`[fixtures:check] missing ${label} index.json: ${indexPath}`);

  const index = readJson(indexPath) as IndexJson;
  const outputs = must(index.outputs, `[fixtures:check] ${label} index.json missing outputs[]: ${indexPath}`);

  if (index.fixtureVersion !== undefined && index.fixtureVersion !== expectedFixtureVersion) {
    fail(
      `[fixtures:check] ${label} index.fixtureVersion mismatch: got=${index.fixtureVersion} expected=${expectedFixtureVersion} (${indexPath})`,
    );
  }

  if (!isIsoLike(index.generatedAt)) {
    fail(`[fixtures:check] ${label} index.generatedAt missing/invalid: ${indexPath}`);
  }

  const seenCaseIds = new Set<string>();
  const seenSourceCaseIds = new Set<string>();
  for (const o of outputs) {
    const caseId = must(o.id, `[fixtures:check] ${label} index output missing id: ${indexPath}`);
    const filePath = must(o.file, `[fixtures:check] ${label} index output missing file: ${indexPath}`);
    if (seenCaseIds.has(caseId)) {
      fail(`[fixtures:check] ${label} duplicate case id in index.outputs: ${caseId} (${indexPath})`);
    }
    seenCaseIds.add(caseId);

    const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    if (!fs.existsSync(abs)) fail(`[fixtures:check] ${label} index references missing file: ${abs}`);

    const fixture = readJson(abs);
    assertFixtureMatchesMinimalSchema(fixture, { label, caseId, abs });

    const meta = fixture?.metadata ?? {};
    const version = meta.cgusDsoFixtureVersion;
    if (version !== expectedFixtureVersion) {
      fail(
        `[fixtures:check] ${label} fixture cgusDsoFixtureVersion mismatch: case=${caseId} got=${version} expected=${expectedFixtureVersion} (${abs})`,
      );
    }
    if (!isIsoLike(meta.cgusDsoGeneratedAt)) {
      fail(`[fixtures:check] ${label} fixture cgusDsoGeneratedAt missing/invalid: case=${caseId} (${abs})`);
    }
    const sourceCaseId = meta.cgusDsoSourceCaseId;
    if (typeof sourceCaseId !== 'string' || sourceCaseId.trim() === '') {
      fail(`[fixtures:check] ${label} fixture cgusDsoSourceCaseId missing: case=${caseId} (${abs})`);
    }
    if (seenSourceCaseIds.has(sourceCaseId)) {
      // This is a strong signal of drift: two generated fixtures claim the same source.
      fail(`[fixtures:check] ${label} duplicate cgusDsoSourceCaseId: ${sourceCaseId} (${abs})`);
    }
    seenSourceCaseIds.add(sourceCaseId);

    if (!meta.cgusDsoSnapshot) {
      fail(`[fixtures:check] ${label} fixture missing metadata.cgusDsoSnapshot: case=${caseId} (${abs})`);
    }
  }
}

function tryGitChangedFiles(): string[] {
  const cwd = process.cwd();
  const changed = new Set<string>();

  const addFromDiffOutput = (out: string) => {
    for (const line of out.split('\n')) {
      const s = line.trim();
      if (s) changed.add(s);
    }
  };

  // Include local (uncommitted) changes relative to HEAD — useful for dev machines
  // and for environments where CI runs against a working tree rather than only commits.
  try {
    const unstaged = execSync(`git diff --name-only`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    addFromDiffOutput(unstaged);
  } catch {
    // ignore
  }
  try {
    const staged = execSync(`git diff --name-only --cached`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    addFromDiffOutput(staged);
  } catch {
    // ignore
  }

  const bases = [
    process.env.FIXTURES_REGEN_HINT_BASE?.trim(),
    'origin/master',
    'origin/main',
    'master',
    'main',
  ].filter(Boolean) as string[];

  for (const base of bases) {
    try {
      // Ensure the base ref exists before diffing (avoid noisy git stderr).
      execSync(`git rev-parse --verify "${base}^{commit}"`, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });

      // Three-dot diff uses merge-base(base, HEAD) automatically.
      const out = execSync(`git diff --name-only "${base}...HEAD"`, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      addFromDiffOutput(out);
    } catch {
      // try next base
    }
  }

  // Fallback: last commit only (works in shallow clones sometimes).
  try {
    const out = execSync(`git diff --name-only HEAD~1...HEAD`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    addFromDiffOutput(out);
  } catch {
    // ignore
  }

  return [...changed];
}

function maybePrintRegenerationHints() {
  const explicit = process.env.FIXTURES_REGEN_HINT?.trim();
  if (explicit === '0' || String(explicit).toLowerCase() === 'false') return;

  const enabled =
    explicit === '1' ||
    String(explicit ?? '').toLowerCase() === 'true' ||
    String(process.env.CI ?? '').toLowerCase() === 'true';
  if (!enabled) return;

  const watchlist = [
    'src/trips/decision/trip-decision-engine.service.ts',
    'src/trips/decision/decision-log.ts',
    'src/trips/decision/evaluation/e2e-case.types.ts',
    'src/trips/decision/evaluation/schemas/engine-dso-fixture-minimal.schema.json',
    'scripts/capture-golden-with-engine-dso.ts',
    'scripts/capture-synthetic-with-engine-dso.ts',
    'scripts/check-generated-engine-dso-fixtures.ts',
    'src/trips/decision/evaluation/e2e-cases/registry.ts',
  ];

  const changed = new Set(tryGitChangedFiles());
  const hits = watchlist.filter((p) => changed.has(p));
  if (hits.length === 0) return;

  // eslint-disable-next-line no-console
  console.warn(
    [
      '',
      '⚠️  Fixture regeneration hint:',
      'These changes may require regenerating engine-captured DSO fixtures.',
      'See: src/trips/decision/evaluation/FIXTURE_REGENERATION.md',
      '',
      'Touched watchlist files:',
      ...hits.map((h) => `- ${h}`),
      '',
    ].join('\n'),
  );
}

function main() {
  const expectedFixtureVersion = 'engine-dso-v1';

  const goldenIndex = path.join(
    process.cwd(),
    'src',
    'trips',
    'decision',
    'evaluation',
    'e2e-cases',
    'generated',
    'index.json',
  );
  const syntheticIndex = path.join(
    process.cwd(),
    'src',
    'trips',
    'decision',
    'evaluation',
    'e2e-cases',
    'generated',
    'synthetic',
    'index.json',
  );

  checkIndexAndFixtures({ label: 'golden', indexPath: goldenIndex, expectedFixtureVersion });
  checkIndexAndFixtures({ label: 'synthetic', indexPath: syntheticIndex, expectedFixtureVersion });

  maybePrintRegenerationHints();

  // eslint-disable-next-line no-console
  console.log('[fixtures:check] OK');
}

main();


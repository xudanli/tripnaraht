/**
 * Dataset Intake — freeze a local pack copy (delegates to export-selected-trip).
 *
 *   npm run lab:import-selected-trip -- --from-gold iceland.road_close.01_f208_reroute_a1_a2 --deidentify
 *   npm run lab:import-selected-trip -- --from-staging --tripId ra01_is_01 --deidentify
 *   npm run lab:import-selected-trip -- --from-staging --prefix ra01_is_ --deidentify
 *   npm run lab:import-selected-trip -- --tripId trip_xxx --environment staging --deidentify
 */

import { spawnSync } from 'child_process';

const args = process.argv.slice(2);
if (!args.includes('--deidentify')) args.push('--deidentify');

const envIdx = args.findIndex((a) => a === '--environment' || a.startsWith('--environment='));
let environment: string | undefined;
if (envIdx >= 0) {
  const raw = args[envIdx];
  environment = raw.includes('=') ? raw.split('=').slice(1).join('=') : args[envIdx + 1];
}
if (
  (environment === 'staging' || environment === 'staging-test') &&
  !args.includes('--from-staging') &&
  !args.includes('--from-gold')
) {
  args.push('--from-staging');
}

const r = spawnSync(
  'npx',
  [
    'tsx',
    'src/decision-runtime/solver/lab/selected-trips/export-selected-trip.ts',
    ...args,
  ],
  { stdio: 'inherit', cwd: process.cwd(), shell: false },
);

process.exit(r.status ?? 1);

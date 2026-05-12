/**
 * P-CI-Pressure-1 — tri-lane TS stress → coupled stability (deterministic baseline).
 * P-CI-Pressure-2 — optional runtime fusion on physics lane.
 * P-CI-Pressure-3 — gradient + forecast + feedforward control signal (merge-only when forecast/control computed).
 * Observational only for CI exit code; control consumers apply policy out-of-band.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

import type {
  RuntimePressureInputs,
  StaticPressureCore,
  SystemPressureState,
} from './pressure-types';
import { computePressureGradient, toComparableSnapshot } from './pressure-gradient';
import { computePressureForecast } from './pressure-forecast';
import { computeControlSignal } from './pressure-control';

export type {
  RuntimePressureInputs,
  StaticPressureCore,
  SystemPressureState,
  LaneTscSnapshot,
  PressureGradient,
  PressureForecast,
  ControlSignal,
} from './pressure-types';

const execAsync = promisify(exec);

const ROOT = path.join(__dirname, '..', '..');

const ALPHA_RUNTIME = 0.35;

/** Map raw error counts to [0,1] — calibrated so “typical debt” sits mid-range. */
const DEFAULT_DENOMS = {
  physics: 8,
  trips: 45,
  entropy: 200,
} as const;

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function extractTscErrorCount(output: string): number {
  return (output.match(/\berror TS\d+/g) ?? []).length;
}

async function countTscErrors(tsconfigRelative: string): Promise<number> {
  const projectPath = path.join(ROOT, tsconfigRelative);
  try {
    const { stdout, stderr } = await execAsync(`npx tsc --noEmit -p "${projectPath}"`, {
      cwd: ROOT,
      maxBuffer: 80 * 1024 * 1024,
    });
    return extractTscErrorCount(stdout + stderr);
  } catch (e: unknown) {
    const x = e as { stdout?: string; stderr?: string; message?: string };
    const combined = `${x.stdout ?? ''}${x.stderr ?? ''}${x.message ?? ''}`;
    return extractTscErrorCount(combined);
  }
}

export function computeSystemPressureFromCounts(
  physicsErrors: number,
  tripsErrors: number,
  entropyErrors: number,
  denoms = DEFAULT_DENOMS,
): StaticPressureCore {
  const P = Math.min(1, physicsErrors / denoms.physics);
  const T = Math.min(1, tripsErrors / denoms.trips);
  const E = Math.min(1, entropyErrors / denoms.entropy);

  const rawCoupling = 0.5 * P * T + 0.3 * T * E + 0.2 * P * E;
  const coupling = Math.min(1, Math.max(0, rawCoupling));
  const stability = Math.exp(-(P + T + E)) * (1 - coupling);

  return {
    physicsPressure: P,
    tripsPressure: T,
    entropyPressure: E,
    coupling,
    stability: Math.min(1, Math.max(0, stability)),
    lanes: {
      physics: { tsconfig: 'tsconfig.physics.json', errorCount: physicsErrors },
      trips: { tsconfig: 'tsconfig.trips.json', errorCount: tripsErrors },
      entropy: { tsconfig: 'tsconfig.json', errorCount: entropyErrors },
    },
    normalization: {
      physicsDenom: denoms.physics,
      tripsDenom: denoms.trips,
      entropyDenom: denoms.entropy,
    },
  };
}

/** Scalar runtime stress from normalized execution proxies (P-CI-2). */
export function computeRuntimePressure(inputs: Partial<RuntimePressureInputs>): number {
  const e = clamp01(inputs.ecoDriftRate ?? 0);
  const i = clamp01(inputs.identityRejectRate ?? 0);
  const c = clamp01(inputs.closureRetryRate ?? 0);
  return clamp01(0.4 * e + 0.3 * i + 0.3 * c);
}

function hasRuntimePayload(inputs: Partial<RuntimePressureInputs>): boolean {
  return (
    inputs.ecoDriftRate !== undefined ||
    inputs.identityRejectRate !== undefined ||
    inputs.closureRetryRate !== undefined
  );
}

export function fusePhysicsWithRuntime(core: StaticPressureCore, runtimePressure: number): Pick<
  NonNullable<SystemPressureState['runtimeOverlay']>,
  'fusedPhysicsPressure' | 'fusedCoupling' | 'fusedStability'
> {
  const Pf = Math.min(1, core.physicsPressure + ALPHA_RUNTIME * runtimePressure);
  const T = core.tripsPressure;
  const E = core.entropyPressure;
  const rawCf = 0.5 * Pf * T + 0.3 * T * E + 0.2 * Pf * E;
  const Cf = Math.min(1, Math.max(0, rawCf));
  const Sf = Math.exp(-(Pf + T + E)) * (1 - Cf);
  return {
    fusedPhysicsPressure: Pf,
    fusedCoupling: Cf,
    fusedStability: Math.min(1, Math.max(0, Sf)),
  };
}

export function parseRuntimeSignalsFromReport(raw: unknown): Partial<RuntimePressureInputs> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const out: Partial<RuntimePressureInputs> = {};
  if (typeof o.ecoDriftRate === 'number') out.ecoDriftRate = o.ecoDriftRate;
  if (typeof o.identityRejectRate === 'number') out.identityRejectRate = o.identityRejectRate;
  if (typeof o.closureRetryRate === 'number') out.closureRetryRate = o.closureRetryRate;
  return hasRuntimePayload(out) ? out : undefined;
}

function buildPressureState(
  core: StaticPressureCore,
  runtimeInputs?: Partial<RuntimePressureInputs>,
): SystemPressureState {
  const base: SystemPressureState = {
    schema: 'p-ci-pressure/2',
    ...core,
  };

  if (!runtimeInputs || !hasRuntimePayload(runtimeInputs)) {
    return base;
  }

  const R = computeRuntimePressure(runtimeInputs);
  const fused = fusePhysicsWithRuntime(core, R);

  return {
    ...base,
    runtimeOverlay: {
      alpha: ALPHA_RUNTIME,
      inputs: runtimeInputs,
      runtimePressure: R,
      ...fused,
    },
  };
}

function loadPreviousPressureReport(prevPath: string): SystemPressureState | null {
  try {
    const raw = fs.readFileSync(prevPath, 'utf8');
    const doc = JSON.parse(raw) as { pressure?: SystemPressureState };
    return doc.pressure ?? null;
  } catch {
    return null;
  }
}

async function computeStaticCore(): Promise<StaticPressureCore> {
  const [physicsErrors, tripsErrors, entropyErrors] = await Promise.all([
    countTscErrors('tsconfig.physics.json'),
    countTscErrors('tsconfig.trips.json'),
    countTscErrors('tsconfig.json'),
  ]);
  return computeSystemPressureFromCounts(physicsErrors, tripsErrors, entropyErrors);
}

/** Static lanes only (no runtime overlay) — standalone CLI without merge report. */
export async function computeSystemPressure(): Promise<SystemPressureState> {
  const core = await computeStaticCore();
  return buildPressureState(core);
}

async function mergeIntoReport(reportPath: string): Promise<void> {
  const raw = fs.readFileSync(reportPath, 'utf8');
  const doc = JSON.parse(raw) as Record<string, unknown>;
  const runtimeInputs = parseRuntimeSignalsFromReport(doc.runtimeSignals);

  const core = await computeStaticCore();
  const basePressure = buildPressureState(core, runtimeInputs);

  const prevPath = process.env.READINESS_P1_PRESSURE_PREV;
  const prevState =
    typeof prevPath === 'string' && prevPath.length > 0 && fs.existsSync(prevPath)
      ? loadPreviousPressureReport(prevPath)
      : null;

  const currSnap = toComparableSnapshot(basePressure);
  const prevSnap = prevState ? toComparableSnapshot(prevState) : null;
  const gradient = computePressureGradient(prevSnap, currSnap);
  const forecast = computePressureForecast(currSnap, gradient);
  const control = computeControlSignal(basePressure, gradient, forecast);

  const pressure: SystemPressureState = {
    ...basePressure,
    schema: 'p-ci-pressure/3',
    ...(gradient !== null ? { gradient } : {}),
    forecast,
    control,
  };

  doc.pressure = pressure;

  const controlOut = process.env.READINESS_P1_CONTROL_OUT;
  if (typeof controlOut === 'string' && controlOut.length > 0 && pressure.control) {
    fs.writeFileSync(controlOut, `${JSON.stringify(pressure.control, null, 2)}\n`, 'utf8');
  }

  fs.writeFileSync(reportPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const mergeIdx = process.argv.indexOf('--merge');

  if (mergeIdx >= 0 && process.argv[mergeIdx + 1]) {
    const reportPath = process.argv[mergeIdx + 1]!;
    await mergeIntoReport(reportPath);
    const raw = fs.readFileSync(reportPath, 'utf8');
    const doc = JSON.parse(raw) as { pressure?: SystemPressureState };
    const ir = doc.pressure?.forecast?.instabilityRisk ?? doc.pressure?.stability ?? 0;
    // eslint-disable-next-line no-console
    console.log(`p-ci-pressure: merged → ${reportPath} (instabilityRisk=${Number(ir).toFixed(4)})`);
    return;
  }

  const pressure = await computeSystemPressure();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(pressure, null, 2));
}

function isPressureCliInvocation(): boolean {
  const a = process.argv[1];
  if (typeof a !== 'string') return false;
  const norm = a.replace(/\\/g, '/');
  return norm.endsWith('compute-system-pressure.ts') || norm.endsWith('compute-system-pressure.js');
}

if (isPressureCliInvocation()) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('compute-system-pressure failed:', err);
    process.exitCode = 1;
  });
}

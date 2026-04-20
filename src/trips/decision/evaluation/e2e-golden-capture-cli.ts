import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { E2ECase, E2EReplayResult } from './e2e-case.types';
import {
  captureReplayAsGoldenFixture,
  serializeGoldenFixtureJson,
} from './e2e-golden-capture';
import { findTdReplayFixtureById } from './e2e-cases/registry';
import type { E2EReplayService } from './e2e-replay.service';

export interface GoldenCaptureCliOptions {
  inputPath: string;
  fixtureId: string;
  fixtureName: string;
  fixtureDescription: string;
  source: string;
  outputPath?: string;
}

export interface GoldenReplayServiceCaptureOptions {
  caseId?: string;
  caseFilePath?: string;
  fixtureId?: string;
  fixtureName?: string;
  fixtureDescription?: string;
  source?: string;
  outputPath?: string;
}

export function parseGoldenCaptureArgs(argv: string[]): GoldenCaptureCliOptions {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || !value) continue;
    args.set(key.slice(2), value);
  }

  const inputPath = args.get('input');
  const fixtureId = args.get('id');
  const fixtureName = args.get('name');
  const fixtureDescription = args.get('description');
  const source = args.get('source');

  if (!inputPath || !fixtureId || !fixtureName || !fixtureDescription || !source) {
    throw new Error(
      'Usage: --input <replay.json> --id <fixture-id> --name <fixture-name> --description <desc> --source <source> [--output <golden.json>]',
    );
  }

  return {
    inputPath,
    fixtureId,
    fixtureName,
    fixtureDescription,
    source,
    outputPath: args.get('output'),
  };
}

export function parseGoldenReplayServiceCaptureArgs(
  argv: string[],
): GoldenReplayServiceCaptureOptions {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || !value) continue;
    args.set(key.slice(2), value);
  }

  const caseId = args.get('case-id');
  const caseFilePath = args.get('case-file');
  if (!caseId && !caseFilePath) {
    throw new Error(
      'Usage: --case-id <fixture-id> | --case-file <case.json> [--output <golden.json>] [--id <fixture-id>] [--name <fixture-name>] [--description <desc>] [--source <source>]',
    );
  }

  return {
    caseId,
    caseFilePath,
    fixtureId: args.get('id'),
    fixtureName: args.get('name'),
    fixtureDescription: args.get('description'),
    source: args.get('source'),
    outputPath: args.get('output'),
  };
}

export async function captureGoldenFixtureFromReplayFile(
  options: GoldenCaptureCliOptions,
): Promise<{ fixture: E2ECase; json: string; outputPath?: string }> {
  const raw = await readFile(resolve(options.inputPath), 'utf8');
  const replayResult = JSON.parse(raw) as E2EReplayResult;
  const fixture = captureReplayAsGoldenFixture({
    fixtureId: options.fixtureId,
    fixtureName: options.fixtureName,
    fixtureDescription: options.fixtureDescription,
    source: options.source,
    replayResult,
  });
  const json = serializeGoldenFixtureJson(fixture);

  if (options.outputPath) {
    const outputPath = resolve(options.outputPath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json, 'utf8');
    return { fixture, json, outputPath };
  }

  return { fixture, json };
}

async function loadReplayCaseFromOptions(
  options: GoldenReplayServiceCaptureOptions,
  replayService: E2EReplayService,
): Promise<E2ECase> {
  if (options.caseFilePath) {
    const raw = await readFile(resolve(options.caseFilePath), 'utf8');
    return JSON.parse(raw) as E2ECase;
  }

  const caseId = options.caseId!;
  const registryCase = findTdReplayFixtureById(caseId);
  if (registryCase) {
    return registryCase;
  }

  const loaded = await replayService.loadCase(caseId);
  if (loaded) {
    return loaded;
  }

  throw new Error(`Replay case not found: ${caseId}`);
}

export async function captureGoldenFixtureFromReplayService(
  options: GoldenReplayServiceCaptureOptions,
  replayService: E2EReplayService,
): Promise<{ fixture: E2ECase; json: string; outputPath?: string; replayResult: E2EReplayResult }> {
  const testCase = await loadReplayCaseFromOptions(options, replayService);
  const replayResult = await replayService.replay(testCase);
  const fixture = captureReplayAsGoldenFixture({
    fixtureId: options.fixtureId ?? `golden-${testCase.id}-captured`,
    fixtureName: options.fixtureName ?? `Golden ${testCase.name}`,
    fixtureDescription:
      options.fixtureDescription ?? `Captured from replay service for ${testCase.id}`,
    source: options.source ?? 'captured-replay-service',
    replayResult,
  });
  const json = serializeGoldenFixtureJson(fixture);

  if (options.outputPath) {
    const outputPath = resolve(options.outputPath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json, 'utf8');
    return { fixture, json, outputPath, replayResult };
  }

  return { fixture, json, replayResult };
}

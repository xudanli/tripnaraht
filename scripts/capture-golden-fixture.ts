import { captureGoldenFixtureFromReplayFile, parseGoldenCaptureArgs } from '../src/trips/decision/evaluation/e2e-golden-capture-cli';

async function main() {
  const options = parseGoldenCaptureArgs(process.argv.slice(2));
  const result = await captureGoldenFixtureFromReplayFile(options);
  if (!result.outputPath) {
    process.stdout.write(result.json);
    return;
  }
  process.stdout.write(`Wrote golden fixture to ${result.outputPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

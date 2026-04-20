import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { E2EReplayService } from '../src/trips/decision/evaluation/e2e-replay.service';
import {
  captureGoldenFixtureFromReplayService,
  parseGoldenReplayServiceCaptureArgs,
} from '../src/trips/decision/evaluation/e2e-golden-capture-cli';

async function main() {
  const options = parseGoldenReplayServiceCaptureArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const replayService = app.get(E2EReplayService);
    const result = await captureGoldenFixtureFromReplayService(options, replayService);
    if (!result.outputPath) {
      process.stdout.write(result.json);
      return;
    }
    process.stdout.write(`Wrote golden fixture to ${result.outputPath}\n`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

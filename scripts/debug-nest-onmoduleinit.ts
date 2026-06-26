/**
 * Pinpoint which Nest module/provider onModuleInit blocks bootstrap.
 * Usage: npx tsx scripts/debug-nest-onmoduleinit.ts
 */
import 'reflect-metadata';

if (!process.env.DISABLE_REDIS || process.env.DISABLE_REDIS === 'false') {
  const redisHost = process.env.REDIS_HOST || 'localhost';
  if (redisHost === 'localhost' || redisHost === '127.0.0.1') {
    process.env.DISABLE_REDIS = 'true';
  }
}

async function main() {
  const hookMod = await import('@nestjs/core/hooks/on-module-init.hook');
  const original = hookMod.callModuleInitHook;

  (hookMod as any).callModuleInitHook = async function patchedCallModuleInitHook(module: any) {
    const modName = module?.metatype?.name ?? module?.name ?? 'unknown';
    const start = Date.now();
    process.stderr.write(`\n▶ onModuleInit START module=${modName}\n`);
    try {
      await original.call(this, module);
      process.stderr.write(`✅ onModuleInit DONE  module=${modName} (${Date.now() - start}ms)\n`);
    } catch (err: any) {
      process.stderr.write(
        `❌ onModuleInit FAIL  module=${modName} (${Date.now() - start}ms): ${err?.message}\n`,
      );
      throw err;
    }
  };

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');

  const timeoutMs = Number(process.env.NEST_BOOTSTRAP_TIMEOUT_MS ?? 120000);
  const start = Date.now();

  const progress = setInterval(() => {
    process.stderr.write(`⏳ waiting... ${Math.floor((Date.now() - start) / 1000)}s\n`);
  }, 5000);

  try {
    const app = await Promise.race([
      NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    clearInterval(progress);
    process.stderr.write(`\n✅ bootstrap OK (${Date.now() - start}ms)\n`);
    await app.close();
    process.exit(0);
  } catch (err: any) {
    clearInterval(progress);
    process.stderr.write(`\n❌ bootstrap FAILED (${Date.now() - start}ms): ${err?.message}\n`);
    process.exit(1);
  }
}

main();

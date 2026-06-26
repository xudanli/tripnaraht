/**
 * Pinpoint which provider blocks NestFactory.create() during DI.
 * Usage: npx tsx scripts/debug-nest-di-hang.ts
 */
import 'reflect-metadata';

if (!process.env.DISABLE_REDIS || process.env.DISABLE_REDIS === 'false') {
  const redisHost = process.env.REDIS_HOST || 'localhost';
  if (redisHost === 'localhost' || redisHost === '127.0.0.1') {
    process.env.DISABLE_REDIS = 'true';
  }
}

async function main() {
  const { Injector } = await import('@nestjs/core/injector/injector');
  const originalLoadProvider = Injector.prototype.loadProvider;

  Injector.prototype.loadProvider = async function patchedLoadProvider(wrapper: any, moduleRef: any, ...rest: any[]) {
    const modName = moduleRef?.metatype?.name ?? 'unknown';
    const token =
      wrapper?.name ??
      wrapper?.metatype?.name ??
      wrapper?.token?.name ??
      String(wrapper?.token ?? 'unknown');
    const start = Date.now();
    process.stderr.write(`▶ loadProvider ${modName} :: ${token}\n`);
    try {
      const result = await originalLoadProvider.call(this, wrapper, moduleRef, ...rest);
      const ms = Date.now() - start;
      if (ms > 500) {
        process.stderr.write(`⚠️  slow (${ms}ms) ${modName} :: ${token}\n`);
      }
      return result;
    } catch (err: any) {
      process.stderr.write(`❌ fail ${modName} :: ${token}: ${err?.message}\n`);
      throw err;
    }
  };

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');

  const timeoutMs = Number(process.env.NEST_BOOTSTRAP_TIMEOUT_MS ?? 90000);
  const start = Date.now();
  const tick = setInterval(() => {
    process.stderr.write(`⏳ ${Math.floor((Date.now() - start) / 1000)}s\n`);
  }, 5000);

  try {
    const app = await Promise.race([
      NestFactory.create(AppModule, { logger: ['error', 'warn'], bodyParser: false }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    clearInterval(tick);
    process.stderr.write(`\n✅ create() OK (${Date.now() - start}ms)\n`);
    await app.close();
    process.exit(0);
  } catch (err: any) {
    clearInterval(tick);
    process.stderr.write(`\n❌ FAILED (${Date.now() - start}ms): ${err?.message}\n`);
    process.exit(1);
  }
}

main();

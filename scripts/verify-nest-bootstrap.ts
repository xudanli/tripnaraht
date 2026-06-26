import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  console.log('Nest AppModule bootstrap: OK');
  await app.close();
}

main().catch((err) => {
  console.error('Nest bootstrap FAILED:', err);
  process.exit(1);
});

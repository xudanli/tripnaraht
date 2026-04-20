import { AiNativePersistenceHealthService } from './ai-native-persistence-health.service';

describe('AiNativePersistenceHealthService', () => {
  const makeSvc = (opts: {
    mode?: 'off' | 'warn' | 'require';
    connected?: boolean;
    missingTables?: string[];
  }) => {
    const mode = opts.mode ?? 'warn';
    const connected = opts.connected ?? true;
    const missing = new Set(opts.missingTables ?? []);

    const prisma: any = {
      isDbConnected: () => connected,
      $queryRaw: async (_q: any) => [{ regclass: null }],
    };

    prisma.$queryRaw = async (strings: any, ...values: any[]) => {
      const name = String(values?.[0] ?? '').replace(/^public\./, '');
      return [{ regclass: missing.has(name) ? null : name }];
    };

    const config: any = {
      get: (k: string) => (k === 'AI_NATIVE_PERSISTENCE_MODE' ? mode : undefined),
    };

    return new AiNativePersistenceHealthService(prisma, config);
  };

  it('does nothing when mode=off', async () => {
    const svc = makeSvc({ mode: 'off' });
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });

  it('warn mode: does not throw when disconnected', async () => {
    const svc = makeSvc({ mode: 'warn', connected: false });
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });

  it('require mode: throws when disconnected', async () => {
    const svc = makeSvc({ mode: 'require', connected: false });
    await expect(svc.onModuleInit()).rejects.toThrow(/Prisma is not connected/i);
  });

  it('require mode: throws when tables missing', async () => {
    const svc = makeSvc({ mode: 'require', missingTables: ['decision_snapshots'] });
    await expect(svc.onModuleInit()).rejects.toThrow(/Missing required DB tables/i);
  });
});


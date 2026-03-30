import { DecisionOSModule } from './decision-os.module';
import { DecisionOSConfigService } from './config';
import { DecisionEventBus } from './events';
import { CircuitBreakerService } from './resilience';

describe('DecisionOSModule', () => {
  describe('forRoot', () => {
    it('should return dynamic module with default options', () => {
      const dynamicModule = DecisionOSModule.forRoot();

      expect(dynamicModule.module).toBe(DecisionOSModule);
      expect(dynamicModule.providers).toBeDefined();
      expect(dynamicModule.exports).toBeDefined();
      expect(dynamicModule.global).toBe(false);
    });

    it('should return global module when configured', () => {
      const dynamicModule = DecisionOSModule.forRoot({ isGlobal: true });

      expect(dynamicModule.global).toBe(true);
    });

    it('should include config service provider', () => {
      const dynamicModule = DecisionOSModule.forRoot();

      const hasConfigProvider = dynamicModule.providers?.some(
        (p: any) => p.provide === DecisionOSConfigService || p === DecisionOSConfigService,
      );
      expect(hasConfigProvider).toBe(true);
    });

    it('should include event bus provider', () => {
      const dynamicModule = DecisionOSModule.forRoot();

      expect(dynamicModule.providers).toContain(DecisionEventBus);
    });

    it('should include circuit breaker provider', () => {
      const dynamicModule = DecisionOSModule.forRoot();

      expect(dynamicModule.providers).toContain(CircuitBreakerService);
    });

    it('should include auth providers when enabled', () => {
      const withAuth = DecisionOSModule.forRoot({ enableAuth: true });
      const withoutAuth = DecisionOSModule.forRoot({ enableAuth: false });

      expect(withAuth.providers?.length).toBeGreaterThan(withoutAuth.providers?.length || 0);
    });

    it('should include cache provider when enabled', () => {
      const withCache = DecisionOSModule.forRoot({ enableCache: true });
      const withoutCache = DecisionOSModule.forRoot({ enableCache: false });

      expect(withCache.providers?.length).toBeGreaterThan(withoutCache.providers?.length || 0);
    });

    it('should include tracing providers when enabled', () => {
      const withTracing = DecisionOSModule.forRoot({ enableTracing: true });
      const withoutTracing = DecisionOSModule.forRoot({ enableTracing: false });

      expect(withTracing.providers?.length).toBeGreaterThan(withoutTracing.providers?.length || 0);
    });

    it('should include metrics providers when enabled', () => {
      const withMetrics = DecisionOSModule.forRoot({ enableMetrics: true });
      const withoutMetrics = DecisionOSModule.forRoot({ enableMetrics: false });

      expect(withMetrics.providers?.length).toBeGreaterThan(withoutMetrics.providers?.length || 0);
    });

    it('should include websocket providers when enabled', () => {
      const withWS = DecisionOSModule.forRoot({ enableWebSocket: true });
      const withoutWS = DecisionOSModule.forRoot({ enableWebSocket: false });

      expect(withWS.providers?.length).toBeGreaterThan(withoutWS.providers?.length || 0);
    });

    it('should include event sourcing providers when enabled', () => {
      const withES = DecisionOSModule.forRoot({ enableEventSourcing: true });
      const withoutES = DecisionOSModule.forRoot({ enableEventSourcing: false });

      expect(withES.providers?.length).toBeGreaterThan(withoutES.providers?.length || 0);
    });
  });

  describe('forFeature', () => {
    it('should return non-global module', () => {
      const dynamicModule = DecisionOSModule.forFeature();

      expect(dynamicModule.global).toBeFalsy();
    });

    it('should allow partial options', () => {
      const dynamicModule = DecisionOSModule.forFeature({
        enableAuth: false,
      });

      expect(dynamicModule.module).toBe(DecisionOSModule);
    });
  });

  describe('module options', () => {
    it('should merge with default options', () => {
      const dynamicModule = DecisionOSModule.forRoot({
        enableAuth: false,
        enableCache: true,
      });

      expect(dynamicModule.providers).toBeDefined();
    });

    it('should pass config overrides to config service factory', () => {
      const dynamicModule = DecisionOSModule.forRoot({
        configOverrides: {
          general: {
            serviceName: 'test-service',
          },
        },
      });

      const configFactory = (dynamicModule.providers as any[]).find(
        (p: any) => p.provide === DecisionOSConfigService,
      );
      expect(configFactory).toBeDefined();
      expect(configFactory.useFactory).toBeDefined();
    });
  });

  describe('exports', () => {
    it('should export config service', () => {
      const dynamicModule = DecisionOSModule.forRoot();

      expect(dynamicModule.exports).toContain(DecisionOSConfigService);
    });

    it('should export event bus', () => {
      const dynamicModule = DecisionOSModule.forRoot();

      expect(dynamicModule.exports).toContain(DecisionEventBus);
    });

    it('should export circuit breaker', () => {
      const dynamicModule = DecisionOSModule.forRoot();

      expect(dynamicModule.exports).toContain(CircuitBreakerService);
    });
  });
});

/**
 * Decision OS 核心模块
 * 
 * 集成所有 Decision OS 组件:
 * - 配置管理
 * - 认证授权
 * - 决策服务
 * - 学习服务
 * - 缓存服务
 * - 指标服务
 * - 追踪服务
 * - WebSocket 服务
 * - 事件系统
 */

import { Module, DynamicModule, Provider, Global, OnModuleInit, Logger } from '@nestjs/common';

import { DecisionOSConfigService } from './config';
import { JwtAuthService, ApiKeyAuthService } from './auth';
import { DecisionCacheService } from './cache';
import { MetricRegistry, DecisionOSMetrics } from './metrics';
import { DecisionTracingService } from './tracing';
import { OTLPSpanExporter } from './tracing/otel-exporter.service';
import { WebSocketManager, DecisionWebSocketService } from './websocket';
import { DecisionEventBus, DecisionEventEmitter, EventSourcingService, InMemoryEventStore } from './events';
import { CircuitBreakerService } from './resilience';
import { DecisionValidationPipe } from './validation';
import { BatchDecisionService, BatchFeedbackService, BatchQueueService } from './batch';
import { DecisionMetricsService } from './metrics';

// ========== 模块配置 ==========

export interface DecisionOSModuleOptions {
  isGlobal?: boolean;
  enableAuth?: boolean;
  enableCache?: boolean;
  enableTracing?: boolean;
  enableMetrics?: boolean;
  enableWebSocket?: boolean;
  enableEventSourcing?: boolean;
  configOverrides?: Record<string, unknown>;
}

const DEFAULT_OPTIONS: DecisionOSModuleOptions = {
  isGlobal: false,
  enableAuth: true,
  enableCache: true,
  enableTracing: true,
  enableMetrics: true,
  enableWebSocket: true,
  enableEventSourcing: true,
};

// ========== 模块定义 ==========

@Global()
@Module({})
export class DecisionOSModule implements OnModuleInit {
  private readonly logger = new Logger(DecisionOSModule.name);

  constructor(private readonly configService: DecisionOSConfigService) {}

  onModuleInit(): void {
    this.logger.log('[DecisionOS] Module initialized');
    this.logger.log(`[DecisionOS] Environment: ${this.configService.get('general').environment}`);
    this.logger.log(`[DecisionOS] Version: ${this.configService.get('general').serviceVersion}`);
  }

  static forRoot(options: DecisionOSModuleOptions = {}): DynamicModule {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
    const providers = this.buildProviders(mergedOptions);
    const exports = this.buildExports(mergedOptions);

    return {
      module: DecisionOSModule,
      global: mergedOptions.isGlobal,
      providers,
      exports,
    };
  }

  static forFeature(options: Partial<DecisionOSModuleOptions> = {}): DynamicModule {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options, isGlobal: false };
    const providers = this.buildProviders(mergedOptions);
    const exports = this.buildExports(mergedOptions);

    return {
      module: DecisionOSModule,
      providers,
      exports,
    };
  }

  private static buildProviders(options: DecisionOSModuleOptions): Provider[] {
    const providers: Provider[] = [
      {
        provide: DecisionOSConfigService,
        useFactory: () => new DecisionOSConfigService(options.configOverrides as any),
      },
      DecisionEventBus,
      DecisionEventEmitter,
      CircuitBreakerService,
      DecisionValidationPipe,
      BatchDecisionService,
      BatchFeedbackService,
      BatchQueueService,
      DecisionMetricsService,
    ];

    if (options.enableAuth) {
      providers.push(
        JwtAuthService,
        ApiKeyAuthService,
      );
    }

    if (options.enableCache) {
      providers.push(DecisionCacheService);
    }

    if (options.enableTracing) {
      providers.push(
        DecisionTracingService,
        {
          provide: OTLPSpanExporter,
          useFactory: (config: DecisionOSConfigService) => {
            const tracingConfig = config.get('tracing');
            return new OTLPSpanExporter({
              endpoint: tracingConfig.exporterEndpoint,
              serviceName: tracingConfig.serviceName,
            }, {
              type: 'ratio',
              ratio: tracingConfig.samplingRate,
            });
          },
          inject: [DecisionOSConfigService],
        },
      );
    }

    if (options.enableMetrics) {
      providers.push(
        MetricRegistry,
        {
          provide: DecisionOSMetrics,
          useFactory: (registry: MetricRegistry) => new DecisionOSMetrics(registry),
          inject: [MetricRegistry],
        },
      );
    }

    if (options.enableWebSocket) {
      providers.push(
        {
          provide: WebSocketManager,
          useFactory: (config: DecisionOSConfigService) => {
            const wsConfig = config.get('websocket');
            return new WebSocketManager({
              heartbeatIntervalMs: wsConfig.heartbeatIntervalMs,
              clientTimeoutMs: wsConfig.clientTimeoutMs,
              maxClientsPerChannel: wsConfig.maxClientsPerChannel,
            });
          },
          inject: [DecisionOSConfigService],
        },
        DecisionWebSocketService,
      );
    }

    if (options.enableEventSourcing) {
      providers.push(
        {
          provide: InMemoryEventStore,
          useFactory: () => new InMemoryEventStore(),
        },
        {
          provide: EventSourcingService,
          useFactory: (store: InMemoryEventStore, config: DecisionOSConfigService) => {
            const learningConfig = config.get('learning');
            return new EventSourcingService(store, {
              snapshotInterval: learningConfig.snapshotInterval,
            });
          },
          inject: [InMemoryEventStore, DecisionOSConfigService],
        },
      );
    }

    return providers;
  }

  private static buildExports(options: DecisionOSModuleOptions): Array<Provider | string | symbol> {
    const exports: Array<Provider | string | symbol> = [
      DecisionOSConfigService,
      DecisionEventBus,
      DecisionEventEmitter,
      CircuitBreakerService,
      DecisionValidationPipe,
      BatchDecisionService,
      BatchFeedbackService,
      BatchQueueService,
      DecisionMetricsService,
    ];

    if (options.enableAuth) {
      exports.push(JwtAuthService, ApiKeyAuthService);
    }

    if (options.enableCache) {
      exports.push(DecisionCacheService);
    }

    if (options.enableTracing) {
      exports.push(DecisionTracingService, OTLPSpanExporter);
    }

    if (options.enableMetrics) {
      exports.push(MetricRegistry, DecisionOSMetrics);
    }

    if (options.enableWebSocket) {
      exports.push(WebSocketManager, DecisionWebSocketService);
    }

    if (options.enableEventSourcing) {
      exports.push(InMemoryEventStore, EventSourcingService);
    }

    return exports;
  }
}

// DecisionOSModuleOptions is exported inline above

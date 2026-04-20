/**
 * Decision OS 配置管理服务
 * 
 * 提供:
 * - 类型安全的配置访问
 * - 环境变量集成
 * - 配置验证
 * - 动态配置更新
 * - 配置快照
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

// ========== 配置类型定义 ==========

export interface DecisionOSConfig {
  general: GeneralConfig;
  decision: DecisionConfig;
  /** RAG → evidence → CGUS 侧链配置（默认关闭） */
  ragEvidence: RagEvidenceConfig;
  learning: LearningConfig;
  cache: CacheConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  tracing: TracingConfig;
  metrics: MetricsConfig;
  security: SecurityConfig;
  rateLimit: RateLimitConfig;
  websocket: WebSocketConfig;
}

export interface GeneralConfig {
  environment: 'development' | 'staging' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  serviceName: string;
  serviceVersion: string;
}

export interface DecisionConfig {
  defaultTimeoutMs: number;
  maxConcurrentDecisions: number;
  monteCarloSamples: number;
  explorationRate: number;
  confidenceThreshold: number;
  cgusMaxIterations: number;
  cgusConvergenceThreshold: number;
  /** CGUS candidate pool size */
  cgusMaxCandidates: number;
  /** CGUS rollout top-k */
  cgusRolloutTopK: number;
  /** Candidate search repair iterations */
  cgusRepairMaxIters: number;
  /** Max repairs per candidate per iter */
  cgusRepairTopKPerCandidate: number;
  /** Per-iteration new candidates cap */
  cgusMaxNewCandidatesPerIter: number;
  /** Pool hard cap */
  cgusMaxPoolSize: number;
  /** Pilot samples per candidate for variance allocation */
  cgusPilotSamples: number;
}

export interface RagEvidenceConfig {
  /**
   * 全局 RAG 证据链开关（默认 false，避免 OPTIMIZE 路径每次打库检索）。
   * 建议与环境变量门闸并存：config 为主，env 作为最低层 fallback。
   */
  enabled: boolean;
  /** 触发检索的最小字符数（query 拼接后的 base 长度）。 */
  minQueryLength: number;
  /** 传入 RetrievalEvidenceMapper 的 scoreThreshold（隔离噪声）。 */
  confidenceThreshold: number;
}

export interface LearningConfig {
  enabled: boolean;
  learningRate: number;
  batchSize: number;
  maxIterations: number;
  convergenceThreshold: number;
  snapshotInterval: number;
  autoTrainThreshold: number;
}

export interface CacheConfig {
  enabled: boolean;
  l1MaxSize: number;
  l1TtlSeconds: number;
  l2Enabled: boolean;
  l2TtlSeconds: number;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  poolSize: number;
  connectionTimeoutMs: number;
}

export interface RedisConfig {
  enabled: boolean;
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
}

export interface TracingConfig {
  enabled: boolean;
  samplingRate: number;
  exporterEndpoint: string;
  serviceName: string;
}

export interface MetricsConfig {
  enabled: boolean;
  prefix: string;
  defaultLabels: Record<string, string>;
  histogramBuckets: number[];
}

export interface SecurityConfig {
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  apiKeyHeaderName: string;
  corsOrigins: string[];
  rateLimitEnabled: boolean;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
}

export interface WebSocketConfig {
  enabled: boolean;
  heartbeatIntervalMs: number;
  clientTimeoutMs: number;
  maxClientsPerChannel: number;
}

// ========== 配置验证 ==========

export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: string[];
}

export interface ConfigValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export class ConfigValidator {
  private errors: ConfigValidationError[] = [];
  private warnings: string[] = [];

  validate(config: DecisionOSConfig): ConfigValidationResult {
    this.errors = [];
    this.warnings = [];

    this.validateGeneral(config.general);
    this.validateDecision(config.decision);
    this.validateRagEvidence(config.ragEvidence);
    this.validateLearning(config.learning);
    this.validateCache(config.cache);
    this.validateSecurity(config.security);

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  private validateGeneral(config: GeneralConfig): void {
    if (!['development', 'staging', 'production'].includes(config.environment)) {
      this.addError('general.environment', 'Invalid environment', config.environment);
    }
    if (!config.serviceName) {
      this.addError('general.serviceName', 'Service name is required');
    }
  }

  private validateDecision(config: DecisionConfig): void {
    if (config.defaultTimeoutMs < 100) {
      this.addWarning('decision.defaultTimeoutMs should be at least 100ms');
    }
    if (config.explorationRate < 0 || config.explorationRate > 1) {
      this.addError('decision.explorationRate', 'Must be between 0 and 1', config.explorationRate);
    }
    if (config.monteCarloSamples < 10) {
      this.addWarning('decision.monteCarloSamples is very low, may affect accuracy');
    }
  }

  private validateRagEvidence(config: RagEvidenceConfig): void {
    if (!Number.isFinite(config.minQueryLength) || config.minQueryLength < 0) {
      this.addError('ragEvidence.minQueryLength', 'Must be a non-negative number', config.minQueryLength);
    }
    if (
      !Number.isFinite(config.confidenceThreshold) ||
      config.confidenceThreshold < 0 ||
      config.confidenceThreshold > 1
    ) {
      this.addError(
        'ragEvidence.confidenceThreshold',
        'Must be between 0 and 1',
        config.confidenceThreshold,
      );
    }
  }

  private validateLearning(config: LearningConfig): void {
    if (config.learningRate <= 0 || config.learningRate > 1) {
      this.addError('learning.learningRate', 'Must be between 0 and 1', config.learningRate);
    }
    if (config.batchSize < 1) {
      this.addError('learning.batchSize', 'Must be at least 1', config.batchSize);
    }
  }

  private validateCache(config: CacheConfig): void {
    if (config.enabled && config.l1MaxSize < 100) {
      this.addWarning('cache.l1MaxSize is very small');
    }
  }

  private validateSecurity(config: SecurityConfig): void {
    if (config.jwtSecret.length < 32) {
      this.addWarning('security.jwtSecret should be at least 32 characters');
    }
    if (config.jwtSecret === 'change-me-in-production') {
      this.addError('security.jwtSecret', 'Using default secret in production is insecure');
    }
  }

  private addError(path: string, message: string, value?: unknown): void {
    this.errors.push({ path, message, value });
  }

  private addWarning(message: string): void {
    this.warnings.push(message);
  }
}

// ========== 配置服务 ==========

@Injectable()
export class DecisionOSConfigService implements OnModuleInit {
  private readonly logger = new Logger(DecisionOSConfigService.name);
  private config: DecisionOSConfig;
  private readonly configHistory: Array<{ timestamp: string; config: DecisionOSConfig }> = [];
  private readonly listeners = new Map<string, Set<(value: unknown) => void>>();

  constructor(initialConfig?: Partial<DecisionOSConfig>) {
    this.config = this.buildConfig(initialConfig);
  }

  onModuleInit(): void {
    const validator = new ConfigValidator();
    const result = validator.validate(this.config);

    if (!result.valid) {
      for (const error of result.errors) {
        this.logger.error(`[Config] Validation error: ${error.path} - ${error.message}`);
      }
    }

    for (const warning of result.warnings) {
      this.logger.warn(`[Config] Warning: ${warning}`);
    }

    this.logger.log(`[Config] Initialized for ${this.config.general.environment} environment`);
  }

  get<K extends keyof DecisionOSConfig>(section: K): DecisionOSConfig[K] {
    return this.config[section];
  }

  getAll(): Readonly<DecisionOSConfig> {
    return Object.freeze({ ...this.config });
  }

  update<K extends keyof DecisionOSConfig>(
    section: K,
    updates: Partial<DecisionOSConfig[K]>,
  ): void {
    this.saveSnapshot();

    this.config[section] = {
      ...this.config[section],
      ...updates,
    };

    this.notifyListeners(section, this.config[section]);
    this.logger.log(`[Config] Updated section: ${section}`);
  }

  onChange<K extends keyof DecisionOSConfig>(
    section: K,
    callback: (value: DecisionOSConfig[K]) => void,
  ): () => void {
    const key = section as string;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }

    this.listeners.get(key)!.add(callback as (value: unknown) => void);

    return () => {
      this.listeners.get(key)?.delete(callback as (value: unknown) => void);
    };
  }

  validate(): ConfigValidationResult {
    const validator = new ConfigValidator();
    return validator.validate(this.config);
  }

  getSnapshot(index?: number): DecisionOSConfig | undefined {
    if (index !== undefined) {
      return this.configHistory[index]?.config;
    }
    return this.configHistory[this.configHistory.length - 1]?.config;
  }

  getSnapshotHistory(): Array<{ timestamp: string; config: DecisionOSConfig }> {
    return [...this.configHistory];
  }

  rollback(index: number): boolean {
    const snapshot = this.configHistory[index];
    if (!snapshot) return false;

    this.config = JSON.parse(JSON.stringify(snapshot.config));
    this.logger.log(`[Config] Rolled back to snapshot ${index}`);
    return true;
  }

  private saveSnapshot(): void {
    this.configHistory.push({
      timestamp: new Date().toISOString(),
      config: JSON.parse(JSON.stringify(this.config)),
    });

    if (this.configHistory.length > 10) {
      this.configHistory.shift();
    }
  }

  private notifyListeners(section: string, value: unknown): void {
    const listeners = this.listeners.get(section);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(value);
        } catch (error) {
          this.logger.error(`[Config] Listener error: ${(error as Error).message}`);
        }
      }
    }
  }

  private buildConfig(overrides?: Partial<DecisionOSConfig>): DecisionOSConfig {
    return {
      general: {
        environment: (process.env.NODE_ENV as any) ?? 'development',
        logLevel: (process.env.LOG_LEVEL as any) ?? 'info',
        serviceName: process.env.SERVICE_NAME ?? 'decision-os',
        serviceVersion: process.env.SERVICE_VERSION ?? '2.4.0',
        ...overrides?.general,
      },
      decision: {
        defaultTimeoutMs: parseInt(process.env.DECISION_TIMEOUT_MS ?? '5000', 10),
        maxConcurrentDecisions: parseInt(process.env.MAX_CONCURRENT_DECISIONS ?? '100', 10),
        monteCarloSamples: parseInt(process.env.MONTE_CARLO_SAMPLES ?? '1000', 10),
        explorationRate: parseFloat(process.env.EXPLORATION_RATE ?? '0.1'),
        confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD ?? '0.8'),
        cgusMaxIterations: parseInt(process.env.CGUS_MAX_ITERATIONS ?? '100', 10),
        cgusConvergenceThreshold: parseFloat(process.env.CGUS_CONVERGENCE ?? '0.001'),
        cgusMaxCandidates: parseInt(process.env.CGUS_MAX_CANDIDATES ?? '8', 10),
        cgusRolloutTopK: parseInt(process.env.CGUS_ROLLOUT_TOPK ?? '3', 10),
        cgusRepairMaxIters: parseInt(process.env.CGUS_REPAIR_MAX_ITERS ?? '2', 10),
        cgusRepairTopKPerCandidate: parseInt(process.env.CGUS_REPAIR_TOPK_PER_CANDIDATE ?? '2', 10),
        cgusMaxNewCandidatesPerIter: parseInt(process.env.CGUS_MAX_NEW_CANDIDATES_PER_ITER ?? '30', 10),
        cgusMaxPoolSize: parseInt(process.env.CGUS_MAX_POOL_SIZE ?? '200', 10),
        cgusPilotSamples: parseInt(process.env.CGUS_PILOT_SAMPLES ?? '20', 10),
        ...overrides?.decision,
      },
      ragEvidence: {
        enabled: (process.env.DECISION_OS_RAG_EVIDENCE_ENABLED ?? 'false').toLowerCase() === 'true',
        minQueryLength: parseInt(process.env.DECISION_OS_RAG_EVIDENCE_MIN_QUERY_LEN ?? '1', 10),
        confidenceThreshold: parseFloat(process.env.DECISION_OS_RAG_EVIDENCE_CONFIDENCE_THRESHOLD ?? '0.25'),
        ...overrides?.ragEvidence,
      },
      learning: {
        enabled: process.env.LEARNING_ENABLED !== 'false',
        learningRate: parseFloat(process.env.LEARNING_RATE ?? '0.001'),
        batchSize: parseInt(process.env.LEARNING_BATCH_SIZE ?? '32', 10),
        maxIterations: parseInt(process.env.LEARNING_MAX_ITERATIONS ?? '1000', 10),
        convergenceThreshold: parseFloat(process.env.LEARNING_CONVERGENCE ?? '0.0001'),
        snapshotInterval: parseInt(process.env.SNAPSHOT_INTERVAL ?? '100', 10),
        autoTrainThreshold: parseInt(process.env.AUTO_TRAIN_THRESHOLD ?? '1000', 10),
        ...overrides?.learning,
      },
      cache: {
        enabled: process.env.CACHE_ENABLED !== 'false',
        l1MaxSize: parseInt(process.env.CACHE_L1_MAX_SIZE ?? '1000', 10),
        l1TtlSeconds: parseInt(process.env.CACHE_L1_TTL ?? '300', 10),
        l2Enabled: process.env.CACHE_L2_ENABLED === 'true',
        l2TtlSeconds: parseInt(process.env.CACHE_L2_TTL ?? '3600', 10),
        ...overrides?.cache,
      },
      database: {
        host: process.env.DB_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? '5432', 10),
        database: process.env.DB_NAME ?? 'decision_os',
        username: process.env.DB_USER ?? 'postgres',
        password: process.env.DB_PASSWORD ?? '',
        poolSize: parseInt(process.env.DB_POOL_SIZE ?? '10', 10),
        connectionTimeoutMs: parseInt(process.env.DB_CONN_TIMEOUT ?? '5000', 10),
        ...overrides?.database,
      },
      redis: {
        enabled: process.env.REDIS_ENABLED === 'true',
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB ?? '0', 10),
        keyPrefix: process.env.REDIS_KEY_PREFIX ?? 'decision-os:',
        ...overrides?.redis,
      },
      tracing: {
        enabled: process.env.TRACING_ENABLED === 'true',
        samplingRate: parseFloat(process.env.TRACING_SAMPLING_RATE ?? '0.1'),
        exporterEndpoint: process.env.OTEL_EXPORTER_ENDPOINT ?? 'http://localhost:4318/v1/traces',
        serviceName: process.env.SERVICE_NAME ?? 'decision-os',
        ...overrides?.tracing,
      },
      metrics: {
        enabled: process.env.METRICS_ENABLED !== 'false',
        prefix: process.env.METRICS_PREFIX ?? 'decision_os',
        defaultLabels: {},
        histogramBuckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        ...overrides?.metrics,
      },
      security: {
        jwtSecret: process.env.JWT_SECRET ?? 'change-me-in-production',
        jwtExpiresInSeconds: parseInt(process.env.JWT_EXPIRES_IN ?? '3600', 10),
        apiKeyHeaderName: process.env.API_KEY_HEADER ?? 'x-api-key',
        corsOrigins: (process.env.CORS_ORIGINS ?? '*').split(','),
        rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
        ...overrides?.security,
      },
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
        skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
        ...overrides?.rateLimit,
      },
      websocket: {
        enabled: process.env.WS_ENABLED !== 'false',
        heartbeatIntervalMs: parseInt(process.env.WS_HEARTBEAT_INTERVAL ?? '30000', 10),
        clientTimeoutMs: parseInt(process.env.WS_CLIENT_TIMEOUT ?? '120000', 10),
        maxClientsPerChannel: parseInt(process.env.WS_MAX_CLIENTS_PER_CHANNEL ?? '1000', 10),
        ...overrides?.websocket,
      },
    };
  }
}

// ========== 配置装饰器 ==========

const CONFIG_INJECT_KEY = Symbol('CONFIG_INJECT');

export function InjectConfig(section: keyof DecisionOSConfig): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    Reflect.defineMetadata(CONFIG_INJECT_KEY, section, target, propertyKey);
  };
}

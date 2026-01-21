/**
 * PolicyService TypeScript 类型定义
 */

export enum PolicyAction {
  ALLOW = 'ALLOW',
  REJECT = 'REJECT',
  ADJUST = 'ADJUST',
  CLARIFY = 'CLARIFY',
}

export interface RLState {
  user_request?: string;
  origin?: string | { lat: number; lng: number };
  destination?: string | { lat: number; lng: number };
  date_range?: Record<string, string>;
  constraints?: Record<string, any>;
  preferences?: Record<string, any>;
  research_data?: Record<string, any>;
  context?: Record<string, any>;
}

export interface PredictRequest {
  request_id: string;
  state: RLState;
  model_version?: string;
  experiment_id?: string;
}

export interface PredictResponse {
  request_id: string;
  action: PolicyAction;
  confidence: number;
  reasoning?: string;
  model_version: string;
  latency_ms: number;
  timestamp: string;
}

export interface BatchPredictRequest {
  requests: PredictRequest[];
}

export interface BatchPredictResponse {
  responses: PredictResponse[];
  total_latency_ms: number;
}

export interface DeployRequest {
  model_version: string;
  model_path?: string;
  mlflow_model_uri?: string;
  rollout_percentage?: number;
}

export interface DeployResponse {
  status: string;
  old_version?: string;
  new_version: string;
  deployed_at?: string;
}

export interface ServiceMetrics {
  total_requests: number;
  success_count: number;
  error_count: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  qps: number;
  model_version: string;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service?: string;
  model_loaded?: boolean;
  current_model_version?: string;
  fallback_model_version?: string;
  qps?: number;
  p95_latency_ms?: number;
  error_rate?: number;
  uptime_seconds?: number;
}

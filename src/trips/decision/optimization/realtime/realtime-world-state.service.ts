// src/trips/decision/optimization/realtime/realtime-world-state.service.ts
/**
 * 实时世界状态服务
 * 
 * 实现：
 * 1. 观测数据融合（贝叶斯更新）
 * 2. 状态变化检测
 * 3. 订阅管理
 * 4. 预测状态演变
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { ProbabilisticWorldModelService } from '../probabilistic/probabilistic-world-model.service';
import { ProbabilisticWorldModelContext, ProbabilisticWeather } from '../probabilistic/probabilistic-world-model.interface';
import { GaussianDistribution, createGaussian } from '../probabilistic/distribution.interface';
import {
  IRealtimeWorldStateService,
  WorldObservation,
  WeatherObservation,
  RoadStatusObservation,
  HazardObservation,
  HumanStateObservation,
  StateChangeEvent,
  RealtimeStateUpdate,
  SubscriptionConfig,
  BayesianUpdateConfig,
} from './realtime-world-state.interface';

/**
 * 默认贝叶斯更新配置
 */
const DEFAULT_BAYESIAN_CONFIG: BayesianUpdateConfig = {
  priorWeight: 0.6,
  observationDecay: 0.9,
  maxObservationsToFuse: 10,
  outlierThreshold: 3,
};

/**
 * 订阅记录
 */
interface Subscription {
  id: string;
  config: SubscriptionConfig;
  lastUpdate: string;
  intervalId?: ReturnType<typeof setInterval>;
}

/**
 * 实时状态更新事件
 */
export interface RealtimeUpdateEvent {
  subscriptionId: string;
  userId: string;
  update: RealtimeStateUpdate;
}

@Injectable()
export class RealtimeWorldStateService implements IRealtimeWorldStateService, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeWorldStateService.name);
  
  // 订阅管理
  private subscriptions: Map<string, Subscription> = new Map();
  
  // 观测缓存（按行程 ID）
  private observationCache: Map<string, WorldObservation[]> = new Map();
  
  // 状态缓存（按行程 ID）
  private stateCache: Map<string, ProbabilisticWorldModelContext> = new Map();
  
  // RxJS Subject 用于推送更新
  private readonly updateSubject = new Subject<RealtimeUpdateEvent>();
  
  /** 订阅更新流 */
  public readonly updates$: Observable<RealtimeUpdateEvent> = this.updateSubject.asObservable();

  constructor(
    private readonly probabilisticWorldModel: ProbabilisticWorldModelService,
  ) {}

  onModuleDestroy(): void {
    // 清理所有订阅
    for (const [, subscription] of this.subscriptions) {
      if (subscription.intervalId) {
        clearInterval(subscription.intervalId);
      }
    }
    this.subscriptions.clear();
  }

  /**
   * 订阅状态更新
   */
  async subscribe(config: SubscriptionConfig): Promise<string> {
    const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const subscription: Subscription = {
      id: subscriptionId,
      config,
      lastUpdate: new Date().toISOString(),
    };
    
    // 设置定时更新
    if (config.updateIntervalSeconds > 0) {
      subscription.intervalId = setInterval(
        () => this.pushUpdate(subscriptionId),
        config.updateIntervalSeconds * 1000,
      );
    }
    
    this.subscriptions.set(subscriptionId, subscription);
    
    this.logger.log(`[RealtimeWorldState] 新订阅: ${subscriptionId} for trip ${config.tripId}`);
    
    return subscriptionId;
  }

  /**
   * 取消订阅
   */
  async unsubscribe(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription?.intervalId) {
      clearInterval(subscription.intervalId);
    }
    this.subscriptions.delete(subscriptionId);
    
    this.logger.log(`[RealtimeWorldState] 取消订阅: ${subscriptionId}`);
  }

  /**
   * 提交观测
   */
  async submitObservation(observation: WorldObservation): Promise<void> {
    const tripId = observation.location?.segmentId?.split('_')[0] || 'default';
    
    // 添加到缓存
    if (!this.observationCache.has(tripId)) {
      this.observationCache.set(tripId, []);
    }
    
    const cache = this.observationCache.get(tripId)!;
    cache.push(observation);
    
    // 限制缓存大小
    if (cache.length > 100) {
      cache.shift();
    }
    
    this.logger.debug(`[RealtimeWorldState] 收到观测: ${observation.type} from ${observation.source}`);
    
    // 触发增量更新
    await this.triggerIncrementalUpdate(tripId, observation);
  }

  /**
   * 获取当前状态
   */
  async getCurrentState(tripId: string): Promise<ProbabilisticWorldModelContext | null> {
    const cached = this.stateCache.get(tripId);
    if (cached) {
      return cached;
    }
    
    // 如果没有缓存，返回 null（由控制器决定如何处理）
    return null;
  }
  
  /**
   * 检查状态是否存在
   */
  hasState(tripId: string): boolean {
    return this.stateCache.has(tripId);
  }

  /**
   * 初始化状态
   */
  initializeState(tripId: string, initialState: ProbabilisticWorldModelContext): void {
    this.stateCache.set(tripId, initialState);
    this.logger.log(`[RealtimeWorldState] 初始化状态: ${tripId}`);
  }

  /**
   * 贝叶斯更新
   */
  bayesianUpdate(
    currentState: ProbabilisticWorldModelContext,
    observations: WorldObservation[],
    config: BayesianUpdateConfig = DEFAULT_BAYESIAN_CONFIG,
  ): ProbabilisticWorldModelContext {
    if (observations.length === 0) {
      return currentState;
    }
    
    this.logger.debug(`[RealtimeWorldState] 贝叶斯更新: ${observations.length} 观测`);
    
    // 按类型分组观测
    const weatherObs = observations.filter(o => o.type === 'WEATHER') as WeatherObservation[];
    const roadObs = observations.filter(o => o.type === 'ROAD_STATUS') as RoadStatusObservation[];
    const hazardObs = observations.filter(o => o.type === 'HAZARD') as HazardObservation[];
    const humanObs = observations.filter(o => o.type === 'HUMAN_STATE') as HumanStateObservation[];
    
    // 复制当前状态
    const updatedState: ProbabilisticWorldModelContext = JSON.parse(JSON.stringify(currentState));
    updatedState.lastUpdated = new Date().toISOString();
    
    // 更新天气
    if (weatherObs.length > 0) {
      updatedState.physical.weather = this.updateWeatherWithObservations(
        currentState.physical.weather,
        weatherObs,
        config,
      );
    }
    
    // 更新道路状态
    if (roadObs.length > 0) {
      this.updateRoadStatusesWithObservations(
        updatedState.physical.roadStatuses,
        roadObs,
        config,
      );
    }
    
    // 更新危险区域
    if (hazardObs.length > 0) {
      this.updateHazardsWithObservations(
        updatedState.physical.hazards,
        hazardObs,
        config,
      );
    }
    
    // 更新人体状态
    if (humanObs.length > 0) {
      this.updateHumanStateWithObservations(
        updatedState.human,
        humanObs,
        config,
      );
    }
    
    return updatedState;
  }

  /**
   * 预测未来状态
   */
  predictFutureState(
    currentState: ProbabilisticWorldModelContext,
    hoursAhead: number,
  ): ProbabilisticWorldModelContext {
    this.logger.debug(`[RealtimeWorldState] 预测未来状态: ${hoursAhead}h`);
    
    const predictedState: ProbabilisticWorldModelContext = JSON.parse(JSON.stringify(currentState));
    
    // 天气不确定性随时间增长
    const uncertaintyGrowth = 1 + (currentState.physical.weather.uncertaintyGrowthRate * hoursAhead / 24);
    
    predictedState.physical.weather = this.growWeatherUncertainty(
      currentState.physical.weather,
      uncertaintyGrowth,
    );
    
    // 道路状态可能变化
    for (const road of predictedState.physical.roadStatuses) {
      // 增加状态不确定性
      road.status.confidence *= Math.pow(0.95, hoursAhead / 24);
    }
    
    // 人体疲劳增长
    const fatigueGrowth = hoursAhead * 0.02; // 每小时增加 2%
    if (predictedState.human.fatigueThreshold.params.mean) {
      predictedState.human.fatigueThreshold.params.mean = Math.min(
        predictedState.human.fatigueThreshold.params.mean + fatigueGrowth,
        1.5,
      );
    }
    
    predictedState.lastUpdated = new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString();
    
    return predictedState;
  }

  /**
   * 检测状态变化
   */
  detectChanges(
    previousState: ProbabilisticWorldModelContext,
    currentState: ProbabilisticWorldModelContext,
  ): StateChangeEvent[] {
    const events: StateChangeEvent[] = [];
    
    // 天气变化检测
    const weatherChange = this.detectWeatherChange(
      previousState.physical.weather,
      currentState.physical.weather,
    );
    if (weatherChange) {
      events.push(weatherChange);
    }
    
    // 道路状态变化检测
    const roadChanges = this.detectRoadChanges(
      previousState.physical.roadStatuses,
      currentState.physical.roadStatuses,
    );
    events.push(...roadChanges);
    
    // 危险区域变化检测
    const hazardChanges = this.detectHazardChanges(
      previousState.physical.hazards,
      currentState.physical.hazards,
    );
    events.push(...hazardChanges);
    
    // 疲劳警告检测
    const fatigueWarning = this.detectFatigueWarning(
      previousState.human,
      currentState.human,
    );
    if (fatigueWarning) {
      events.push(fatigueWarning);
    }
    
    return events;
  }

  // ========== 私有方法 ==========

  /**
   * 推送更新
   */
  private async pushUpdate(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;
    
    try {
      const currentState = await this.getCurrentState(subscription.config.tripId);
      
      // 如果状态未初始化，跳过推送
      if (!currentState) {
        this.logger.warn(`[RealtimeWorldState] 跳过推送: 行程 ${subscription.config.tripId} 状态未初始化`);
        return;
      }
      
      // 获取最近观测
      const observations = this.getRecentObservations(
        subscription.config.tripId,
        subscription.lastUpdate,
      );
      
      if (observations.length === 0 && !subscription.config.includePredictions) {
        return; // 无新数据，不推送
      }
      
      // 更新状态
      const previousState = this.stateCache.get(subscription.config.tripId);
      const updatedState = observations.length > 0
        ? this.bayesianUpdate(currentState, observations)
        : currentState;
      
      // 检测变化
      const events = previousState
        ? this.detectChanges(previousState, updatedState)
        : [];
      
      // 过滤事件
      const filteredEvents = events.filter(e => 
        subscription.config.eventTypes.includes(e.changeType) &&
        this.severityLevel(e.severity) >= this.severityLevel(subscription.config.minSeverity)
      );
      
      // 更新缓存
      this.stateCache.set(subscription.config.tripId, updatedState);
      subscription.lastUpdate = new Date().toISOString();
      
      // 创建更新对象
      const update: RealtimeStateUpdate = {
        updateId: `update_${Date.now()}`,
        tripId: subscription.config.tripId,
        timestamp: new Date().toISOString(),
        updatedWorldModel: updatedState,
        events: filteredEvents,
        requiresReplan: filteredEvents.some(e => e.severity === 'CRITICAL'),
        replanReason: filteredEvents.find(e => e.severity === 'CRITICAL')?.description,
        nextUpdateExpected: new Date(Date.now() + subscription.config.updateIntervalSeconds * 1000).toISOString(),
      };
      
      // 发送事件
      this.updateSubject.next({
        subscriptionId,
        userId: subscription.config.userId,
        update,
      });
      
    } catch (error) {
      this.logger.error(`[RealtimeWorldState] 推送更新失败: ${subscriptionId}`, error);
    }
  }

  /**
   * 触发增量更新
   */
  private async triggerIncrementalUpdate(tripId: string, observation: WorldObservation): Promise<void> {
    // 找到相关订阅
    const relevantSubscriptions = Array.from(this.subscriptions.values())
      .filter(s => s.config.tripId === tripId);
    
    for (const subscription of relevantSubscriptions) {
      // 立即推送重要观测
      if (observation.confidence > 0.8) {
        await this.pushUpdate(subscription.id);
      }
    }
  }

  /**
   * 获取最近观测
   */
  private getRecentObservations(tripId: string, since: string): WorldObservation[] {
    const cache = this.observationCache.get(tripId) || [];
    return cache.filter(o => o.timestamp > since);
  }

  /**
   * 更新天气分布
   */
  private updateWeatherWithObservations(
    prior: ProbabilisticWeather,
    observations: WeatherObservation[],
    config: BayesianUpdateConfig,
  ): ProbabilisticWeather {
    const updated = { ...prior };
    
    // 聚合观测
    const windObs = observations.filter(o => o.data.windSpeedMs !== undefined);
    const tempObs = observations.filter(o => o.data.temperatureC !== undefined);
    
    // 更新风速
    if (windObs.length > 0) {
      updated.windSpeed = this.bayesianUpdateGaussian(
        prior.windSpeed,
        windObs.map(o => ({ value: o.data.windSpeedMs!, confidence: o.confidence })),
        config,
      );
    }
    
    // 更新温度
    if (tempObs.length > 0) {
      updated.temperature = this.bayesianUpdateGaussian(
        prior.temperature,
        tempObs.map(o => ({ value: o.data.temperatureC!, confidence: o.confidence })),
        config,
      );
    }
    
    return updated;
  }

  /**
   * 高斯分布贝叶斯更新
   */
  private bayesianUpdateGaussian(
    prior: GaussianDistribution,
    observations: Array<{ value: number; confidence: number }>,
    config: BayesianUpdateConfig,
  ): GaussianDistribution {
    if (observations.length === 0) {
      return prior;
    }
    
    // 计算观测的加权均值
    let obsWeightSum = 0;
    let obsValueSum = 0;
    
    for (const obs of observations) {
      const weight = obs.confidence * config.observationDecay;
      obsWeightSum += weight;
      obsValueSum += obs.value * weight;
    }
    
    const obsMean = obsValueSum / obsWeightSum;
    
    // 贝叶斯更新
    const priorWeight = config.priorWeight;
    const obsWeight = 1 - priorWeight;
    
    const updatedMean = prior.params.mean * priorWeight + obsMean * obsWeight;
    
    // 方差通常会减小（更确定）
    const varianceReduction = Math.min(observations.length * 0.1, 0.5);
    const updatedVariance = prior.params.variance * (1 - varianceReduction);
    
    // 置信度增加
    const updatedConfidence = Math.min(prior.confidence + observations.length * 0.05, 0.95);
    
    return createGaussian(updatedMean, updatedVariance, updatedConfidence);
  }

  /**
   * 更新道路状态
   */
  private updateRoadStatusesWithObservations(
    roadStatuses: ProbabilisticWorldModelContext['physical']['roadStatuses'],
    observations: RoadStatusObservation[],
    config: BayesianUpdateConfig,
  ): void {
    for (const obs of observations) {
      const road = roadStatuses.find(r => r.roadId === obs.data.roadId);
      if (road) {
        // 更新状态分布
        const statusIndex = ['OPEN', 'RESTRICTED', 'CLOSED'].indexOf(obs.data.status);
        if (statusIndex >= 0) {
          // 提升观测到的状态概率
          const newProbs = road.status.params.probabilities.map((p, i) => {
            if (i === statusIndex) {
              return p + (1 - p) * obs.confidence * (1 - config.priorWeight);
            }
            return p * (1 - obs.confidence * (1 - config.priorWeight));
          });
          
          // 归一化
          const sum = newProbs.reduce((a, b) => a + b, 0);
          road.status.params.probabilities = newProbs.map(p => p / sum);
          road.status.confidence = Math.min(road.status.confidence + 0.1, 0.95);
        }
      }
    }
  }

  /**
   * 更新危险区域
   */
  private updateHazardsWithObservations(
    hazards: ProbabilisticWorldModelContext['physical']['hazards'],
    observations: HazardObservation[],
    _config: BayesianUpdateConfig,
  ): void {
    for (const obs of observations) {
      const hazard = hazards.find(h => h.type === obs.data.hazardType);
      if (hazard) {
        // 更新风险等级分布
        const levelIndex = ['LOW', 'MEDIUM', 'HIGH'].indexOf(obs.data.riskLevel);
        if (levelIndex >= 0) {
          const newProbs = hazard.riskLevel.params.probabilities.map((p, i) => {
            if (i === levelIndex) {
              return p + (1 - p) * obs.confidence * 0.5;
            }
            return p * (1 - obs.confidence * 0.3);
          });
          
          const sum = newProbs.reduce((a, b) => a + b, 0);
          hazard.riskLevel.params.probabilities = newProbs.map(p => p / sum);
        }
      }
    }
  }

  /**
   * 更新人体状态
   */
  private updateHumanStateWithObservations(
    human: ProbabilisticWorldModelContext['human'],
    observations: HumanStateObservation[],
    config: BayesianUpdateConfig,
  ): void {
    const fatigueObs = observations.filter(o => o.data.fatigueLevel !== undefined);
    
    if (fatigueObs.length > 0) {
      const avgFatigue = fatigueObs.reduce((sum, o) => sum + o.data.fatigueLevel!, 0) / fatigueObs.length;
      const avgConfidence = fatigueObs.reduce((sum, o) => sum + o.confidence, 0) / fatigueObs.length;
      
      // 更新疲劳阈值
      const priorWeight = config.priorWeight;
      human.fatigueThreshold.params.mean = 
        human.fatigueThreshold.params.mean * priorWeight + avgFatigue * (1 - priorWeight);
      human.fatigueThreshold.confidence = Math.min(
        human.fatigueThreshold.confidence + avgConfidence * 0.1,
        0.95,
      );
    }
  }

  /**
   * 增长天气不确定性
   */
  private growWeatherUncertainty(weather: ProbabilisticWeather, factor: number): ProbabilisticWeather {
    return {
      ...weather,
      windSpeed: {
        ...weather.windSpeed,
        params: {
          ...weather.windSpeed.params,
          variance: weather.windSpeed.params.variance * factor,
        },
        confidence: weather.windSpeed.confidence / factor,
      },
      temperature: {
        ...weather.temperature,
        params: {
          ...weather.temperature.params,
          variance: weather.temperature.params.variance * factor,
        },
        confidence: weather.temperature.confidence / factor,
      },
      precipitation: {
        ...weather.precipitation,
        params: {
          ...weather.precipitation.params,
          variance: weather.precipitation.params.variance * factor,
        },
        confidence: weather.precipitation.confidence / factor,
      },
      visibility: {
        ...weather.visibility,
        params: {
          ...weather.visibility.params,
          variance: weather.visibility.params.variance * factor,
        },
        confidence: weather.visibility.confidence / factor,
      },
    };
  }

  /**
   * 检测天气变化
   */
  private detectWeatherChange(
    previous: ProbabilisticWeather,
    current: ProbabilisticWeather,
  ): StateChangeEvent | null {
    const windChange = Math.abs(current.windSpeed.params.mean - previous.windSpeed.params.mean);
    const tempChange = Math.abs(current.temperature.params.mean - previous.temperature.params.mean);
    
    if (windChange > 5 || tempChange > 5) {
      const severity = windChange > 10 || tempChange > 10 ? 'CRITICAL' : 'WARNING';
      
      return {
        eventId: `weather_${Date.now()}`,
        changeType: 'WEATHER_CHANGE',
        severity,
        affectedSegments: [],
        description: `天气显著变化：风速变化 ${windChange.toFixed(1)}m/s，温度变化 ${tempChange.toFixed(1)}°C`,
        recommendedActions: severity === 'CRITICAL'
          ? ['考虑延迟出发', '检查备用计划']
          : ['关注天气变化'],
        timestamp: new Date().toISOString(),
      };
    }
    
    return null;
  }

  /**
   * 检测道路状态变化
   */
  private detectRoadChanges(
    previous: ProbabilisticWorldModelContext['physical']['roadStatuses'],
    current: ProbabilisticWorldModelContext['physical']['roadStatuses'],
  ): StateChangeEvent[] {
    const events: StateChangeEvent[] = [];
    
    for (const currentRoad of current) {
      const prevRoad = previous.find(r => r.roadId === currentRoad.roadId);
      if (!prevRoad) continue;
      
      // 检查关闭概率变化
      const closedIndex = currentRoad.status.params.categories.indexOf('CLOSED');
      const prevClosedProb = prevRoad.status.params.probabilities[closedIndex] || 0;
      const currClosedProb = currentRoad.status.params.probabilities[closedIndex] || 0;
      
      if (currClosedProb - prevClosedProb > 0.3) {
        events.push({
          eventId: `road_${currentRoad.roadId}_${Date.now()}`,
          changeType: 'ROAD_CLOSURE',
          severity: currClosedProb > 0.7 ? 'CRITICAL' : 'WARNING',
          affectedSegments: [currentRoad.roadId],
          description: `道路 ${currentRoad.roadId} 关闭概率上升至 ${(currClosedProb * 100).toFixed(0)}%`,
          recommendedActions: ['检查替代路线', '联系当地管理部门确认'],
          timestamp: new Date().toISOString(),
        });
      }
    }
    
    return events;
  }

  /**
   * 检测危险区域变化
   */
  private detectHazardChanges(
    previous: ProbabilisticWorldModelContext['physical']['hazards'],
    current: ProbabilisticWorldModelContext['physical']['hazards'],
  ): StateChangeEvent[] {
    const events: StateChangeEvent[] = [];
    
    for (const currentHazard of current) {
      const prevHazard = previous.find(h => h.type === currentHazard.type);
      if (!prevHazard) continue;
      
      // 检查高风险概率变化
      const highIndex = currentHazard.riskLevel.params.categories.indexOf('HIGH');
      const prevHighProb = prevHazard.riskLevel.params.probabilities[highIndex] || 0;
      const currHighProb = currentHazard.riskLevel.params.probabilities[highIndex] || 0;
      
      if (currHighProb - prevHighProb > 0.2) {
        events.push({
          eventId: `hazard_${currentHazard.type}_${Date.now()}`,
          changeType: 'HAZARD_ALERT',
          severity: currHighProb > 0.5 ? 'CRITICAL' : 'WARNING',
          affectedSegments: [],
          description: `${currentHazard.type} 风险上升，高风险概率 ${(currHighProb * 100).toFixed(0)}%`,
          recommendedActions: ['评估当前位置安全性', '准备撤离方案'],
          timestamp: new Date().toISOString(),
        });
      }
    }
    
    return events;
  }

  /**
   * 检测疲劳警告
   */
  private detectFatigueWarning(
    previous: ProbabilisticWorldModelContext['human'],
    current: ProbabilisticWorldModelContext['human'],
  ): StateChangeEvent | null {
    const prevFatigue = previous.fatigueThreshold.params.mean;
    const currFatigue = current.fatigueThreshold.params.mean;
    
    if (currFatigue > 1.2 && currFatigue - prevFatigue > 0.1) {
      return {
        eventId: `fatigue_${Date.now()}`,
        changeType: 'FATIGUE_WARNING',
        severity: currFatigue > 1.5 ? 'CRITICAL' : 'WARNING',
        affectedSegments: [],
        description: `疲劳水平上升至 ${currFatigue.toFixed(2)}，建议休息`,
        recommendedActions: currFatigue > 1.5
          ? ['立即休息', '缩短当日行程']
          : ['安排休息时间', '放慢节奏'],
        timestamp: new Date().toISOString(),
      };
    }
    
    return null;
  }

  /**
   * 严重程度转数值
   */
  private severityLevel(severity: StateChangeEvent['severity']): number {
    return { 'INFO': 0, 'WARNING': 1, 'CRITICAL': 2 }[severity];
  }
}

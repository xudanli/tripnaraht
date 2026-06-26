// Round 3: Calibration Loop Service
// 搭子校准闭环：pre-trip 预测 vs post-trip 实际
// 参考: 等渗回归, 温度缩放

import { Injectable, Logger } from '@nestjs/common';
import {
  CalibrationCurve,
  CompatibilityDimension,
  DimensionCalibration,
  CompanionCalibrationRecord,
  ColdStartPhase,
  ColdStartConfig,
} from '../../trips/attribution/types/self-evolution.types';

/**
 * 校准记录请求
 */
export interface CalibrationRecordRequest {
  postId: string;
  applicationId: string;
  preTripPrediction: number; // 0-1
  postTripSatisfaction: number; // 0-1
  dimensionPredictions: Map<CompatibilityDimension, number>; // 10 维预测
  dimensionSatisfactions: Map<CompatibilityDimension, number>; // 10 维实际
  tripId?: string;
}

/**
 * 校准曲线构建请求
 */
export interface CalibrationCurveRequest {
  predictions: number[];
  actuals: number[];
}

@Injectable()
export class CalibrationLoopService {
  private readonly logger = new Logger(CalibrationLoopService.name);
  private calibrationRecords = new Map<string, CompanionCalibrationRecord>(); // 内存存储
  private calibrationCurves = new Map<CompatibilityDimension, CalibrationCurve>(); // 维度校准曲线

  // 冷启动配置
  private coldStartConfig: ColdStartConfig = {
    questionnaireThreshold: 0,
    heuristicThreshold: 5,
    offlineShapleyThreshold: 10,
    realtimeThreshold: 11,
  };

  // 用户旅行计数（用于冷启动阶段判断）
  private userTripCounts = new Map<string, number>();

  /**
   * 记录校准数据
   */
  async recordCalibration(request: CalibrationRecordRequest): Promise<CompanionCalibrationRecord> {
    const record: CompanionCalibrationRecord = {
      id: this.generateId(),
      postId: request.postId,
      applicationId: request.applicationId,
      preTripPrediction: request.preTripPrediction,
      postTripSatisfaction: request.postTripSatisfaction,
      calibrationCurve: await this.buildCalibrationCurve({
        predictions: [request.preTripPrediction],
        actuals: [request.postTripSatisfaction],
      }),
      dimensionScores: await this.calibrateByDimensions(
        request.dimensionPredictions,
        request.dimensionSatisfactions,
      ),
      calibrationAccuracy: this.calculateAccuracy(
        request.preTripPrediction,
        request.postTripSatisfaction,
      ),
      needsRetraining: false,
      tripId: request.tripId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 存储记录
    this.calibrationRecords.set(record.id, record);

    // 更新维度校准曲线
    await this.updateDimensionCalibrationCurves(record);

    this.logger.log(
      `Recorded calibration for application ${request.applicationId}: prediction=${request.preTripPrediction.toFixed(2)}, actual=${request.postTripSatisfaction.toFixed(2)}`,
    );

    return record;
  }

  /**
   * 构建校准曲线（等渗回归）
   * 等渗回归：单调非减约束
   */
  async buildCalibrationCurve(request: CalibrationCurveRequest): Promise<CalibrationCurve> {
    const { predictions, actuals } = request;

    // 排序（按预测值）
    const sorted = this.sortByPrediction(predictions, actuals);

    // 等渗回归（简化实现：PAVA 算法）
    const calibrated = this.isotonicRegression(sorted.actuals);

    // 温度缩放（快速近似）
    const temperature = this.fitTemperature(predictions, actuals);

    const accuracy = this.calculateCurveAccuracy(sorted.predictions, calibrated);

    return {
      predictions: sorted.predictions,
      actuals: sorted.actuals,
      calibrated,
      temperature,
      accuracy,
    };
  }

  /**
   * 按预测值排序
   */
  private sortByPrediction(predictions: number[], actuals: number[]): any {
    const paired = predictions.map((p, i) => ({ prediction: p, actual: actuals[i] }));
    paired.sort((a, b) => a.prediction - b.prediction);

    return {
      predictions: paired.map(p => p.prediction),
      actuals: paired.map(p => p.actual),
    };
  }

  /**
   * 等渗回归（PAVA - Pool Adjacent Violators Algorithm）
   * 简化实现
   */
  private isotonicRegression(actuals: number[]): number[] {
    if (actuals.length === 0) return [];

    // PAVA 算法
    let blocks = actuals.map((value, index) => ({
      start: index,
      end: index,
      value,
      count: 1,
    }));

    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < blocks.length - 1; i++) {
        if (blocks[i].value > blocks[i + 1].value) {
          // 合并相邻块
          const mergedValue =
            (blocks[i].value * blocks[i].count + blocks[i + 1].value * blocks[i + 1].count) /
            (blocks[i].count + blocks[i + 1].count);
          blocks[i] = {
            start: blocks[i].start,
            end: blocks[i + 1].end,
            value: mergedValue,
            count: blocks[i].count + blocks[i + 1].count,
          };
          blocks.splice(i + 1, 1);
          changed = true;
        }
      }
    }

    // 展开为校准值
    const calibrated = new Array(actuals.length).fill(0);
    for (const block of blocks) {
      for (let i = block.start; i <= block.end; i++) {
        calibrated[i] = block.value;
      }
    }

    return calibrated;
  }

  /**
   * 温度缩放（快速近似）
   */
  private fitTemperature(predictions: number[], actuals: number[]): number {
    // 简化实现：基于预测和实际的标准差比率
    const predStd = this.calculateStd(predictions);
    const actualStd = this.calculateStd(actuals);

    if (actualStd === 0) return 1.0;
    return predStd / actualStd;
  }

  /**
   * 计算标准差
   */
  private calculateStd(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * 计算校准曲线准确度
   */
  private calculateCurveAccuracy(predictions: number[], calibrated: number[]): number {
    if (predictions.length === 0) return 0;

    // 计算校准值与实际值的相关性
    const meanCalibrated = calibrated.reduce((a, b) => a + b, 0) / calibrated.length;
    const meanPredictions = predictions.reduce((a, b) => a + b, 0) / predictions.length;

    const numerator = predictions.reduce((sum, p, i) => {
      return sum + (p - meanPredictions) * (calibrated[i] - meanCalibrated);
    }, 0);

    const denominatorPred = Math.sqrt(
      predictions.reduce((sum, p) => sum + Math.pow(p - meanPredictions, 2), 0),
    );
    const denominatorCal = Math.sqrt(
      calibrated.reduce((sum, c) => sum + Math.pow(c - meanCalibrated, 2), 0),
    );

    if (denominatorPred === 0 || denominatorCal === 0) return 0;

    return Math.abs(numerator / (denominatorPred * denominatorCal));
  }

  /**
   * 分维度校准
   */
  async calibrateByDimensions(
    predictions: Map<CompatibilityDimension, number>,
    actuals: Map<CompatibilityDimension, number>,
  ): Promise<Map<CompatibilityDimension, DimensionCalibration>> {
    const result = new Map<CompatibilityDimension, DimensionCalibration>();

    for (const dimension of Object.values(CompatibilityDimension)) {
      const prediction = predictions.get(dimension) || 0.5;
      const actual = actuals.get(dimension) || 0.5;

      const curve = await this.buildCalibrationCurve({
        predictions: [prediction],
        actuals: [actual],
      });

      const accuracy = this.calculateAccuracy(prediction, actual);

      result.set(dimension, {
        dimension,
        curve,
        accuracy,
        needsRetraining: accuracy < 0.7,
      });
    }

    return result;
  }

  /**
   * 更新维度校准曲线
   */
  private async updateDimensionCalibrationCurves(record: CompanionCalibrationRecord): Promise<void> {
    for (const [dimension, calibration] of record.dimensionScores) {
      const existingCurve = this.calibrationCurves.get(dimension);
      if (existingCurve) {
        // 合并曲线（简化：取平均）
        const mergedCurve: CalibrationCurve = {
          predictions: [...existingCurve.predictions, ...calibration.curve.predictions],
          actuals: [...existingCurve.actuals, ...calibration.curve.actuals],
          calibrated: [...existingCurve.calibrated, ...calibration.curve.calibrated],
          temperature: (existingCurve.temperature + calibration.curve.temperature) / 2,
          accuracy: (existingCurve.accuracy + calibration.curve.accuracy) / 2,
        };
        this.calibrationCurves.set(dimension, mergedCurve);
      } else {
        this.calibrationCurves.set(dimension, calibration.curve);
      }
    }
  }

  /**
   * 计算准确度
   */
  private calculateAccuracy(prediction: number, actual: number): number {
    const error = Math.abs(prediction - actual);
    return Math.max(0, 1 - error);
  }

  /**
   * 应用校准
   * 使用校准曲线调整预测值
   */
  async applyCalibration(
    dimension: CompatibilityDimension,
    prediction: number,
  ): Promise<number> {
    const curve = this.calibrationCurves.get(dimension);
    if (!curve) {
      return prediction; // 没有校准曲线，返回原值
    }

    // 简化实现：使用温度缩放
    const calibrated = this.applyTemperatureScaling(prediction, curve.temperature);

    return Math.max(0, Math.min(1, calibrated));
  }

  /**
   * 温度缩放
   */
  private applyTemperatureScaling(prediction: number, temperature: number): number {
    // Sigmoid 温度缩放
    const scaled = 1 / (1 + Math.exp(-(prediction - 0.5) / temperature));
    return scaled;
  }

  /**
   * 获取校准曲线
   */
  getCalibrationCurve(dimension: CompatibilityDimension): CalibrationCurve | undefined {
    return this.calibrationCurves.get(dimension);
  }

  /**
   * 获取所有校准曲线
   */
  getAllCalibrationCurves(): Map<CompatibilityDimension, CalibrationCurve> {
    return new Map(this.calibrationCurves);
  }

  /**
   * 获取校准记录
   */
  getCalibrationRecords(): CompanionCalibrationRecord[] {
    return Array.from(this.calibrationRecords.values());
  }

  /**
   * 获取用户的校准记录
   */
  getUserCalibrationRecords(tripId: string): CompanionCalibrationRecord[] {
    return Array.from(this.calibrationRecords.values()).filter(
      r => r.tripId === tripId,
    );
  }

  /**
   * 判断冷启动阶段
   */
  getColdStartPhase(userId: string): ColdStartPhase {
    const tripCount = this.userTripCounts.get(userId) || 0;

    if (tripCount < this.coldStartConfig.questionnaireThreshold) {
      return ColdStartPhase.QUESTIONNAIRE;
    }
    if (tripCount < this.coldStartConfig.heuristicThreshold) {
      return ColdStartPhase.HEURISTIC;
    }
    if (tripCount < this.coldStartConfig.offlineShapleyThreshold) {
      return ColdStartPhase.OFFLINE_SHAPLEY;
    }
    return ColdStartPhase.REALTIME_CALIBRATION;
  }

  /**
   * 更新用户旅行计数
   */
  updateUserTripCount(userId: string): void {
    const currentCount = this.userTripCounts.get(userId) || 0;
    this.userTripCounts.set(userId, currentCount + 1);
  }

  /**
   * 获取用户旅行计数
   */
  getUserTripCount(userId: string): number {
    return this.userTripCounts.get(userId) || 0;
  }

  /**
   * 批量记录校准
   */
  async recordCalibrationBatch(requests: CalibrationRecordRequest[]): Promise<CompanionCalibrationRecord[]> {
    return Promise.all(requests.map(req => this.recordCalibration(req)));
  }

  /**
   * 重置校准曲线
   */
  resetCalibrationCurves(): void {
    this.calibrationCurves.clear();
    this.logger.log('Reset all calibration curves');
  }

  /**
   * 更新冷启动配置
   */
  updateColdStartConfig(config: Partial<ColdStartConfig>): void {
    this.coldStartConfig = { ...this.coldStartConfig, ...config };
    this.logger.log('Cold start config updated', this.coldStartConfig);
  }

  /**
   * 获取冷启动配置
   */
  getColdStartConfig(): ColdStartConfig {
    return { ...this.coldStartConfig };
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `calibration_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

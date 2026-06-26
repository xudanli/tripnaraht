/**
 * Calibration Controller
 *
 * Provides HTTP API for companion calibration loop.
 * Round 3: Pre-trip prediction vs post-trip satisfaction calibration.
 */

import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { CalibrationLoopService, CalibrationRecordRequest } from '../services/calibration-loop.service';
import { CompatibilityDimension } from '../../trips/attribution/types/self-evolution.types';

@Controller('match-square/calibration')
export class CalibrationController {
  constructor(private readonly calibrationService: CalibrationLoopService) {}

  /**
   * Record calibration data
   * POST /match-square/calibration
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async recordCalibration(
    @Body() request: CalibrationRecordRequest,
  ) {
    return this.calibrationService.recordCalibration(request);
  }

  /**
   * Batch record calibration data
   * POST /match-square/calibration/batch
   */
  @Post('batch')
  @HttpCode(HttpStatus.CREATED)
  async recordCalibrationBatch(
    @Body() requests: CalibrationRecordRequest[],
  ) {
    return this.calibrationService.recordCalibrationBatch(requests);
  }

  /**
   * Get calibration curve for a dimension
   * GET /match-square/calibration/curve/:dimension
   */
  @Get('curve/:dimension')
  async getCalibrationCurve(
    @Param('dimension') dimension: string,
  ) {
    return this.calibrationService.getCalibrationCurve(dimension as CompatibilityDimension);
  }

  /**
   * Get all calibration curves
   * GET /match-square/calibration/curves
   */
  @Get('curves')
  async getAllCalibrationCurves() {
    return this.calibrationService.getAllCalibrationCurves();
  }

  /**
   * Apply calibration to a prediction
   * POST /match-square/calibration/apply
   */
  @Post('apply')
  @HttpCode(HttpStatus.OK)
  async applyCalibration(
    @Body('dimension') dimension: string,
    @Body('prediction') prediction: number,
  ) {
    return this.calibrationService.applyCalibration(
      dimension as CompatibilityDimension,
      prediction,
    );
  }

  /**
   * Get calibration records for a trip
   * GET /match-square/calibration/trip/:tripId
   */
  @Get('trip/:tripId')
  async getTripCalibrationRecords(
    @Param('tripId') tripId: string,
  ) {
    return this.calibrationService.getUserCalibrationRecords(tripId);
  }

  /**
   * Get all calibration records
   * GET /match-square/calibration/records
   */
  @Get('records')
  async getAllCalibrationRecords() {
    return this.calibrationService.getCalibrationRecords();
  }

  /**
   * Get cold start phase for a user
   * GET /match-square/calibration/cold-start/:userId
   */
  @Get('cold-start/:userId')
  async getColdStartPhase(
    @Param('userId') userId: string,
  ) {
    return {
      userId,
      phase: this.calibrationService.getColdStartPhase(userId),
      tripCount: this.calibrationService.getUserTripCount(userId),
    };
  }

  /**
   * Update user trip count
   * POST /match-square/calibration/trip-count/:userId
   */
  @Post('trip-count/:userId')
  @HttpCode(HttpStatus.OK)
  async updateUserTripCount(
    @Param('userId') userId: string,
  ) {
    this.calibrationService.updateUserTripCount(userId);
    return {
      userId,
      tripCount: this.calibrationService.getUserTripCount(userId),
    };
  }

  /**
   * Reset calibration curves
   * POST /match-square/calibration/reset
   */
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  async resetCalibrationCurves() {
    this.calibrationService.resetCalibrationCurves();
    return { message: 'Calibration curves reset successfully' };
  }

  /**
   * Update cold start configuration
   * POST /match-square/calibration/config
   */
  @Post('config')
  @HttpCode(HttpStatus.OK)
  async updateColdStartConfig(
    @Body() config: any,
  ) {
    this.calibrationService.updateColdStartConfig(config);
    return this.calibrationService.getColdStartConfig();
  }

  /**
   * Get cold start configuration
   * GET /match-square/calibration/config
   */
  @Get('config')
  async getColdStartConfig() {
    return this.calibrationService.getColdStartConfig();
  }
}

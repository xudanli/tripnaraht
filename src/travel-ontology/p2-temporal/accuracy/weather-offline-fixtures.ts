/**
 * Offline weather accuracy fixtures — historical forecast × actual × P1 replay shape
 */

import type { WeatherOfflineAccuracyCase } from '../weather-shadow/weather-forecast-series.types';

/**
 * Case A: forecast correctly anticipates ORANGE→RED; aligned with P1 weather pilot shape
 * (onset ~09:00 hazard confirm, deteriorate 11:00 RED, calm later).
 */
export const WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED: WeatherOfflineAccuracyCase = {
  caseId: 'wx_offline_south_coast_aligned',
  tripId: 'ont_p1_is_weather_pilot_01',
  regionId: 'south_coast',
  subjectId: 'wx_south_coast',
  affectedScopes: ['seg_south_coast', 'HIGH_ROOF_CAMPER'],
  asOf: '2026-07-23T06:00:00.000Z',
  horizonEndAt: '2026-07-23T20:00:00.000Z',
  forecastSeries: [
    {
      at: '2026-07-23T08:00:00.000Z',
      predictedLevel: 'YELLOW',
      forecastIssuedAt: '2026-07-23T06:00:00.000Z',
    },
    {
      at: '2026-07-23T09:00:00.000Z',
      predictedLevel: 'ORANGE',
      forecastIssuedAt: '2026-07-23T06:00:00.000Z',
    },
    {
      at: '2026-07-23T11:00:00.000Z',
      predictedLevel: 'RED',
      forecastIssuedAt: '2026-07-23T06:00:00.000Z',
    },
    {
      at: '2026-07-23T15:00:00.000Z',
      predictedLevel: 'NONE',
      forecastIssuedAt: '2026-07-23T06:00:00.000Z',
    },
  ],
  actualSeries: [
    { at: '2026-07-23T09:00:00.000Z', actualLevel: 'ORANGE' },
    { at: '2026-07-23T09:05:00.000Z', actualLevel: 'ORANGE' },
    { at: '2026-07-23T11:00:00.000Z', actualLevel: 'RED' },
    { at: '2026-07-23T15:00:00.000Z', actualLevel: 'NONE' },
  ],
  p1ReplayAnchors: {
    onsetAt: '2026-07-23T09:00:00.000Z',
    deterioratedAt: '2026-07-23T11:00:00.000Z',
    lastActionBy: '2026-07-23T20:00:00.000Z',
    peakLevel: 'RED',
    replayFingerprint: 'rp_p1_weather_fixture_aligned',
  },
  expect: { wouldAffectPlan: true, peakAtLeast: 'ORANGE' },
};

/** Case B: false positive — forecast ORANGE but actual stays YELLOW/NONE */
export const WEATHER_OFFLINE_CASE_FALSE_POSITIVE: WeatherOfflineAccuracyCase = {
  caseId: 'wx_offline_false_positive',
  tripId: 'ont_p2_wx_fp_01',
  regionId: 'south_coast',
  subjectId: 'wx_south_coast',
  affectedScopes: ['seg_south_coast'],
  asOf: '2026-07-22T06:00:00.000Z',
  horizonEndAt: '2026-07-22T20:00:00.000Z',
  forecastSeries: [
    {
      at: '2026-07-22T12:00:00.000Z',
      predictedLevel: 'ORANGE',
      forecastIssuedAt: '2026-07-22T06:00:00.000Z',
    },
    {
      at: '2026-07-22T16:00:00.000Z',
      predictedLevel: 'ORANGE',
      forecastIssuedAt: '2026-07-22T06:00:00.000Z',
    },
  ],
  actualSeries: [
    { at: '2026-07-22T12:00:00.000Z', actualLevel: 'YELLOW' },
    { at: '2026-07-22T16:00:00.000Z', actualLevel: 'NONE' },
  ],
  expect: { wouldAffectPlan: true, peakAtLeast: 'ORANGE' },
};

/** Case C: false negative — forecast calm, actual ORANGE (miss) */
export const WEATHER_OFFLINE_CASE_FALSE_NEGATIVE: WeatherOfflineAccuracyCase = {
  caseId: 'wx_offline_false_negative',
  tripId: 'ont_p2_wx_fn_01',
  regionId: 'reykjanes',
  subjectId: 'wx_reykjanes',
  affectedScopes: ['seg_reykjanes'],
  asOf: '2026-07-21T06:00:00.000Z',
  horizonEndAt: '2026-07-21T20:00:00.000Z',
  forecastSeries: [
    {
      at: '2026-07-21T10:00:00.000Z',
      predictedLevel: 'NONE',
      forecastIssuedAt: '2026-07-21T06:00:00.000Z',
    },
    {
      at: '2026-07-21T14:00:00.000Z',
      predictedLevel: 'YELLOW',
      forecastIssuedAt: '2026-07-21T06:00:00.000Z',
    },
  ],
  actualSeries: [
    { at: '2026-07-21T10:00:00.000Z', actualLevel: 'NONE' },
    { at: '2026-07-21T14:00:00.000Z', actualLevel: 'ORANGE' },
  ],
  expect: { wouldAffectPlan: false, peakAtLeast: 'NONE' },
};

/** Case D: partial — onset off by ~2h vs actual */
export const WEATHER_OFFLINE_CASE_PARTIAL_ONSET: WeatherOfflineAccuracyCase = {
  caseId: 'wx_offline_partial_onset',
  tripId: 'ont_p2_wx_partial_01',
  regionId: 'east_fjords',
  subjectId: 'wx_east',
  affectedScopes: ['seg_east'],
  asOf: '2026-07-20T04:00:00.000Z',
  horizonEndAt: '2026-07-20T22:00:00.000Z',
  forecastSeries: [
    {
      at: '2026-07-20T14:00:00.000Z',
      predictedLevel: 'ORANGE',
      forecastIssuedAt: '2026-07-20T04:00:00.000Z',
    },
  ],
  actualSeries: [
    { at: '2026-07-20T12:00:00.000Z', actualLevel: 'ORANGE' },
    { at: '2026-07-20T18:00:00.000Z', actualLevel: 'NONE' },
  ],
  expect: { wouldAffectPlan: true, peakAtLeast: 'ORANGE' },
};

export const WEATHER_OFFLINE_ACCURACY_FIXTURES: WeatherOfflineAccuracyCase[] = [
  WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
  WEATHER_OFFLINE_CASE_FALSE_POSITIVE,
  WEATHER_OFFLINE_CASE_FALSE_NEGATIVE,
  WEATHER_OFFLINE_CASE_PARTIAL_ONSET,
];

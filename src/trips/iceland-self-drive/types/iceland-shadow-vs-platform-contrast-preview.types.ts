/**
 * FE-facing calibration summary for Shadow vs platform contrast.
 * Never drives Confirm / Apply — Shadow capabilities remain authoritative.
 */

import type { ShadowVsPlatformContrastReport } from './iceland-shadow-vs-platform-contrast.types';
import type { PostApplyBundleContrast } from '../utils/post-apply-bundle-contrast.util';

export interface ShadowVsPlatformContrastPreviewSummary {
  schemaId: 'tripnara.iceland_shadow_vs_platform_contrast_summary@v1';
  peerId: 'platform_comparable_rule_surface@v1';
  gateAligned: boolean;
  mappedAligned: boolean;
  iceland: {
    allowConfirm: boolean;
    aggregateOutcome: string;
  };
  platform: {
    allowConfirm: boolean;
    overallStatus: string;
    gateway?: {
      overallStatus: string;
      allowConfirm: boolean | null;
      gateAlignedWithShadow: boolean | null;
      gateCompareSkipped: boolean;
    };
  };
  unmappedIcelandCids: string[];
  /** Always true — FE must not gate Confirm/Apply on this block. */
  doesNotAffectCapabilities: true;
  notes: string[];
  postApplyBundle?: {
    gateAlignedWithShadow: boolean;
    allowConfirmProjection: boolean;
    worstAggregateStatus: string;
    blockingKeys: string[];
    error?: string;
  };
}

export function toContrastPreviewSummary(
  report: ShadowVsPlatformContrastReport,
): ShadowVsPlatformContrastPreviewSummary {
  const gateway = report.platform.gateway;
  const post = report.postApplyBundle;
  return {
    schemaId: 'tripnara.iceland_shadow_vs_platform_contrast_summary@v1',
    peerId: 'platform_comparable_rule_surface@v1',
    gateAligned: report.gateAligned,
    mappedAligned: report.mappedAligned,
    iceland: {
      allowConfirm: report.iceland.allowConfirm,
      aggregateOutcome: report.iceland.aggregateOutcome,
    },
    platform: {
      allowConfirm: report.platform.allowConfirm,
      overallStatus: report.platform.overallStatus,
      gateway: gateway
        ? {
            overallStatus: gateway.overallStatus,
            allowConfirm: gateway.allowConfirm,
            gateAlignedWithShadow: gateway.gateCompareSkipped
              ? null
              : report.gateAlignedWithGateway === true,
            gateCompareSkipped: gateway.gateCompareSkipped,
          }
        : undefined,
    },
    unmappedIcelandCids: report.unmappedIcelandCids,
    doesNotAffectCapabilities: true,
    notes: report.notes,
    postApplyBundle: post
      ? {
          gateAlignedWithShadow: post.gateAlignedWithShadow,
          allowConfirmProjection: post.bundle.allowConfirmProjection,
          worstAggregateStatus: post.bundle.worstAggregateStatus,
          blockingKeys: post.bundle.blockingKeys,
          error: post.error,
        }
      : undefined,
  };
}

export type { PostApplyBundleContrast };

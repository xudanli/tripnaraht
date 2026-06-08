import {
  buildApplicantVerifiedCredentialsEmbed,
  isLikelySlotPersonaLabel,
  resolveApplicantIdentityFields,
} from './application-identity.util';
import { buildVerifiedCredentialsView } from '../../odyssey-intake/util/verified-credentials.util';

describe('application-identity.util', () => {
  it('detects slot persona labels', () => {
    expect(isLikelySlotPersonaLabel('建议补位 · INTJ · 气象精算师')).toBe(true);
    expect(isLikelySlotPersonaLabel('Live 现场的即兴音乐人')).toBe(false);
  });

  it('prefers credentials displayName and profile card title over dirty row', () => {
    const vc = buildVerifiedCredentialsView({
      trust: { verified: true, provider: 'real_name_id', displayName: '晶' },
      credentials: null,
    });

    const identity = resolveApplicantIdentityFields({
      row: {
        applicantDisplayName: '建议补位 · ESFP · 乐手',
        applicantCardTitle: '建议补位 · ESFP · 乐手',
        applicantInteractionMode: 'easy_companion',
        applicantPersonaSnapshot: {
          cardTitle: 'Live 现场的即兴音乐人',
          interactionModeLabel: '轻松陪伴型',
        },
        targetSlotLabel: '建议补位 · ESFP · 乐手',
      },
      profileCardTitle: 'Live 现场的即兴音乐人',
      credentialsCtx: { verifiedCredentials: vc, trust: { displayName: '晶' } },
    });

    expect(identity.applicantDisplayName).toBe('晶');
    expect(identity.applicantCardTitle).toBe('Live 现场的即兴音乐人');
    expect(identity.applicantInteractionModeLabel).toBe('轻松陪伴型');
    expect(identity.applicantVerifiedCredentials.dossier.displayName).toBe('晶');
  });

  it('embeds applicant verified credentials snapshot', () => {
    const vc = buildVerifiedCredentialsView({
      trust: { verified: true, provider: 'real_name_id', displayName: '晶' },
      credentials: {
        education: {
          verified: true,
          degreeLevel: 'master',
          tierTag: 'overseas',
          displayTag: '🎓 硕士(海归)(已认证)',
          verificationChannel: 'xuexin_online_code',
          badge: {
            verified: true,
            badgeLabel: '已认证',
            badgeMark: '✓',
            renderHint: 'vector_component_watermark',
          },
          verifiedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    const embed = buildApplicantVerifiedCredentialsEmbed(vc);
    expect(embed.dossier.displayName).toBe('晶');
    expect(embed.dossier.educationTags).toContain('🎓 硕士(海归)(已认证)');
  });
});

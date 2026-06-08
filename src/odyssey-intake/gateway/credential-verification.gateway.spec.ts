import { BadRequestException } from '@nestjs/common';
import { CredentialVerificationGateway } from './credential-verification.gateway';

describe('CredentialVerificationGateway', () => {
  let gateway: CredentialVerificationGateway;

  beforeEach(() => {
    gateway = new CredentialVerificationGateway();
  });

  it('resolves xuexin code to tier without storing school', async () => {
    const result = await gateway.verifyXuexinOnlineCode('985-demo-code');
    expect(result.tierTag).toBe('985_211');
  });

  it('sends and verifies work email code', async () => {
    const sent = await gateway.sendWorkEmailVerificationCode('danny@tencent.com');
    expect(sent.expiresInSeconds).toBe(600);
    expect(sent.devCode).toMatch(/^\d{6}$/);

    const verified = await gateway.verifyWorkEmailCode('danny@tencent.com', sent.devCode!);
    expect(verified.channel).toBe('work_email');
    expect(verified.industryTag).toBe('tech');
    expect(verified.roleLevelTag).toBe('employee');
  });

  it('rejects unknown email domain', async () => {
    await expect(gateway.sendWorkEmailVerificationCode('a@unknown-startup.xyz')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('uploads and verifies badge image locally', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const uploaded = await gateway.uploadProfessionBadgeImage(
      userId,
      Buffer.from('腾讯 AI产品总监 工牌认证测试数据 padding').toString('base64'),
      'image/jpeg',
    );
    expect(uploaded.imageToken).toBeTruthy();

    const verified = await gateway.verifyProfessionBadgeOcr(userId, uploaded.imageToken);
    expect(verified.channel).toBe('badge_ocr');
    expect(verified.industryTag).toBe('tech');
  });
});

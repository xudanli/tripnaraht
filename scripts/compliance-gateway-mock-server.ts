/**
 * 本地合规网关 Mock — 用于 hybrid 联调 PRD 3.1.3 四通道 HTTP 契约
 *
 * Usage:
 *   npm run credential:mock-gateway
 *
 * Then in .env:
 *   CREDENTIAL_VERIFICATION_MODE=hybrid
 *   CREDENTIAL_GATEWAY_API_KEY=dev-mock-key
 *   CREDENTIAL_XUEXIN_GATEWAY_URL=http://127.0.0.1:3099/chsi
 *   CREDENTIAL_MAIL_GATEWAY_URL=http://127.0.0.1:3099/mail
 *   CREDENTIAL_OAUTH_GATEWAY_URL=http://127.0.0.1:3099/oauth
 *   CREDENTIAL_BADGE_OCR_GATEWAY_URL=http://127.0.0.1:3099/badge-ocr
 */
import express from 'express';

const PORT = Number(process.env.CREDENTIAL_MOCK_GATEWAY_PORT ?? 3099);
const API_KEY = process.env.CREDENTIAL_GATEWAY_API_KEY ?? 'dev-mock-key';

const app = express();
app.use(express.json({ limit: '2mb' }));

function authorize(req: express.Request, res: express.Response): boolean {
  const header = req.headers.authorization ?? '';
  const expected = `Bearer ${API_KEY}`;
  if (header !== expected) {
    res.status(401).json({ message: 'Unauthorized' });
    return false;
  }
  return true;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'credential-compliance-mock' });
});

app.post('/chsi/v1/verify', (req, res) => {
  if (!authorize(req, res)) return;
  const code = String(req.body?.verificationCode ?? '').toLowerCase();
  if (!code) {
    res.status(400).json({ message: 'verificationCode required' });
    return;
  }
  if (code.startsWith('985') || code.includes('211')) {
    res.json({ degreeLevel: 'bachelor', tierTag: '985_211' });
    return;
  }
  if (code.startsWith('overseas')) {
    res.json({ degreeLevel: 'master', tierTag: 'overseas' });
    return;
  }
  res.json({ degreeLevel: 'master', tierTag: 'general' });
});

app.post('/mail/v1/send-otp', (req, res) => {
  if (!authorize(req, res)) return;
  const to = req.body?.to;
  const code = req.body?.variables?.code;
  console.log(`[mock-mail] OTP to=${to} code=${code}`);
  res.json({ messageId: `mock-${Date.now()}` });
});

app.post('/oauth/v1/:provider/exchange', (req, res) => {
  if (!authorize(req, res)) return;
  const provider = req.params.provider;
  if (provider !== 'maimai' && provider !== 'linkedin') {
    res.status(400).json({ message: 'unsupported provider' });
    return;
  }
  res.json({
    industryTag: 'tech',
    companyTierTag: 'tier1_tech',
    roleLevelTag: 'product_director',
  });
});

app.post('/badge-ocr/v1/verify', (req, res) => {
  if (!authorize(req, res)) return;
  res.json({
    industryTag: 'manufacturing',
    companyTierTag: 'known_manufacturing',
    roleLevelTag: 'solutions_expert',
  });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Credential mock compliance gateway listening on http://127.0.0.1:${PORT}`);
  console.log(`Authorization: Bearer ${API_KEY}`);
  console.log('Endpoints: /chsi/v1/verify /mail/v1/send-otp /oauth/v1/:provider/exchange /badge-ocr/v1/verify');
});

/**
 * Authorization Policy Gateway feature flags.
 */

export function isAuthorizationPolicyGatewayEnabled(): boolean {
  const v = process.env.AUTHORIZATION_POLICY_GATEWAY_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

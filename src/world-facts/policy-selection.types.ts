/** Registry / Router 解析 bundle 时的原因码（与 policy-registry 共用，避免循环依赖）。 */
export type PolicyBundleSelectionReason =
  | 'embedded_default'
  | 'registry_fallback_first'
  | 'env_bundle_id'
  | 'env_revision'
  | 'domain_rule'
  | 'routing_skipped_no_context'
  | 'routing_disabled';

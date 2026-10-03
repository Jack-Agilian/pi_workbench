import { exact } from './worker-ipc.ts';

// Product display vocabulary, not a universal Pi error-code API. Never accept free-form errors.
export const providerErrorCodes = ['invalid_api_key', 'insufficient_quota', 'rate_limit_exceeded',
  'model_not_found', 'permission_denied', 'access_denied', 'context_length_exceeded',
  'invalid_request_error', 'server_error', 'internal_error', 'overloaded_error',
  'content_policy_violation', 'unsupported_parameter', 'invalid_value'] as const;
export type ProviderErrorCode = typeof providerErrorCodes[number];
export interface ModelError { httpStatus?: number; code?: ProviderErrorCode }
export function providerErrorCode(value: unknown): ProviderErrorCode | undefined {
  return typeof value === 'string' ? providerErrorCodes.find(code => code === value) : undefined;
}
export function parseModelError(value: unknown): ModelError {
  const r = exact(value, [...(Object.hasOwn(Object(value), 'httpStatus') ? ['httpStatus'] : []),
    ...(Object.hasOwn(Object(value), 'code') ? ['code'] : [])]);
  if (Object.hasOwn(r, 'httpStatus') && (typeof r.httpStatus !== 'number' || !Number.isInteger(r.httpStatus) || r.httpStatus < 300 || r.httpStatus > 599)) throw new Error('model_error_status');
  if (Object.hasOwn(r, 'code') && !providerErrorCode(r.code)) throw new Error('model_error_code');
  return r as ModelError;
}

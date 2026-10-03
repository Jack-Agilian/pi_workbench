import { parseModelError, type ModelError, type ProviderErrorCode } from '../../packages/app-contracts/model-error.ts';
const descriptions: Record<ProviderErrorCode, string> = {
  invalid_api_key: '服务报告 API Key 无效；请检查应用的凭据配置。',
  insufficient_quota: '服务报告可用额度不足；请核对服务侧额度。',
  rate_limit_exceeded: '服务报告请求限流；稍后可手动再试。',
  model_not_found: '服务报告模型不存在或当前账户不可访问。',
  permission_denied: '服务报告权限不足。', access_denied: '服务拒绝访问。',
  context_length_exceeded: '服务报告上下文超出模型限制。',
  invalid_request_error: '服务报告请求参数不被接受。',
  server_error: '服务报告内部错误。', internal_error: '服务报告内部错误。',
  overloaded_error: '服务报告繁忙；稍后可手动再试。',
  content_policy_violation: '服务报告请求触及其内容策略。',
  unsupported_parameter: '服务报告存在不支持的参数。', invalid_value: '服务报告某个参数值无效。',
};
export function modelErrorText(value: ModelError | undefined): string {
  if (!value) return '本条历史未保存错误详情，无法补推当时的错误码。';
  const error = parseModelError(value);
  const status = error.httpStatus;
  const summary = error.code ? descriptions[error.code]
    : status === 401 ? '服务未接受身份验证。'
    : status === 403 ? '服务拒绝了请求，具体原因未确认。'
    : status === 429 ? '服务限制了请求，可能涉及速率或额度；具体原因未确认。'
    : status && status >= 500 ? '服务端请求失败。'
    : '请求或流式响应失败，没有可安全展示的具体原因。';
  return `${status ? `HTTP ${status} · ` : ''}${error.code ? `上游错误码 ${error.code} · ` : ''}${summary} 上游原始错误正文未保存；不会自动重试。`;
}

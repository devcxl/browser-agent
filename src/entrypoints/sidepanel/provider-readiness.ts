import type { ProviderConfig, ProviderModelConfig } from '@/shared/types';

/** Provider 就绪度检查对应的向导步骤 */
export type ProviderWizardStep = 'connection' | 'models';

/**
 * 检查单个模型配置是否合法。
 * 条件：id 非空、name 非空、context > output > 0、
 * defaultOutput > 0、defaultOutput <= output。
 */
export function isProviderModelValid(model: ProviderModelConfig): boolean {
  const id = model.id?.trim() ?? '';
  const name = model.name?.trim() ?? '';
  const context = model.limit?.context ?? 0;
  const output = model.limit?.output ?? 0;
  const defaultOutput = model.defaults?.maxOutputTokens ?? output;
  return Boolean(id && name && context > output && output > 0 && defaultOutput > 0 && defaultOutput <= output);
}

/**
 * 判断 Provider 就绪度。
 * API Key 和 isLocalTrusted 不参与判断。
 */
export function getProviderReadiness(provider: ProviderConfig): {
  isComplete: boolean;
  initialStep: ProviderWizardStep | null;
} {
  const endpoint = provider.api?.trim() || provider.endpoint?.trim();
  if (!endpoint) {
    return { isComplete: false, initialStep: 'connection' };
  }

  const models = Object.values(provider.models ?? {});
  const hasValidModel = models.some(isProviderModelValid);

  if (!hasValidModel) {
    return { isComplete: false, initialStep: 'models' };
  }

  return { isComplete: true, initialStep: null };
}

import React, { useEffect, useMemo, useState } from 'react';
import type { ProviderConfig, ProviderModelConfig, ReasoningEffort } from '@/shared/types';
import { ProviderCatalog, type CatalogProvider } from '@/provider/provider-catalog';
import { useI18n } from '../i18n/useI18n';
import { isProviderModelValid } from '../provider-readiness';
import type { ProviderWizardStep } from '../provider-readiness';
import { cn } from '../utils';

interface Props {
  provider?: ProviderConfig;
  onSave: (provider: ProviderConfig) => void;
  onClose: () => void;
  initialStep?: ProviderWizardStep;
}

type Step = 'template' | 'connection' | 'models';

const EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'max'];

function createCustomDraft(): ProviderConfig {
  return {
    id: crypto.randomUUID(),
    name: '',
    npm: '@ai-sdk/openai-compatible',
    api: '',
    env: [],
    models: {},
    apiKey: '',
    isLocalTrusted: false,
    isCustom: true,
  };
}

function createDraft(template: CatalogProvider): ProviderConfig {
  return {
    id: crypto.randomUUID(),
    name: template.name,
    sourceProviderId: template.id,
    npm: template.npm,
    api: template.api,
    env: template.env,
    models: structuredClone(template.models),
    defaultModelId: Object.values(template.models)[0]?.id,
    apiKey: '',
    isLocalTrusted: false,
  };
}

function emptyModel(): ProviderModelConfig {
  return {
    id: '',
    name: '',
    limit: { context: 32768, output: 8192 },
    defaults: { maxOutputTokens: 4096 },
    tool_call: true,
    reasoning: false,
  };
}

export function ProviderWizard({ provider, onSave, onClose, initialStep }: Props) {
  const { t } = useI18n();
  const defaultStep: Step = initialStep ?? (provider ? 'connection' : 'template');
  const [step, setStep] = useState<Step>(defaultStep);
  const [draft, setDraft] = useState<ProviderConfig>(provider ? structuredClone(provider) : createCustomDraft());
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [search, setSearch] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState<React.ReactNode>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    ProviderCatalog.getInstance().getProviderList()
      .then(async (entries) => Promise.all(entries.map((entry) => ProviderCatalog.getInstance().getProvider(entry.id))))
      .then((providers) => setCatalog(providers.filter((item): item is CatalogProvider => item !== null)))
      .catch(() => setCatalog([]));
  }, []);

  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return catalog;
    return catalog.filter((item) => item.name.toLowerCase().includes(query) || item.id.toLowerCase().includes(query));
  }, [catalog, search]);

  const models = Object.values(draft.models ?? {});
  const hasDuplicateModelIds = new Set(models.map((model) => model.id.trim())).size !== models.length;
  const modelsValid = models.length > 0 && !hasDuplicateModelIds && models.every(isProviderModelValid);

  const selectTemplate = (template?: CatalogProvider) => {
    setDraft(template ? createDraft(template) : createCustomDraft());
    setStep('connection');
  };

  const updateDraft = (patch: Partial<ProviderConfig>) => setDraft((current) => ({ ...current, ...patch }));

  const updateModel = (oldId: string, patch: Partial<ProviderModelConfig>) => {
    setDraft((current) => {
      const currentModel = current.models?.[oldId];
      if (!currentModel) return current;
      const nextModel = { ...currentModel, ...patch };
      return { ...current, models: { ...current.models, [oldId]: nextModel } };
    });
  };

  const addModel = () => {
    const model = emptyModel();
    const key = crypto.randomUUID();
    setDraft((current) => ({ ...current, models: { ...current.models, [key]: model } }));
  };

  const removeModel = (id: string) => {
    setDraft((current) => {
      const nextModels = { ...current.models };
      delete nextModels[id];
      const nextDefault = current.defaultModelId === id ? Object.values(nextModels)[0]?.id : current.defaultModelId;
      return { ...current, models: nextModels, defaultModelId: nextDefault };
    });
  };

  const discoverModels = async () => {
    if (!draft.api) return;
    setDiscovering(true);
    setDiscoveryMessage(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${draft.api.replace(/\/+$/, '')}/models`, {
        headers: {
          ...(draft.apiKey ? { Authorization: `Bearer ${draft.apiKey}` } : {}),
          ...draft.extraHeaders,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { data?: Array<{ id?: string }> };
      const ids = payload.data?.flatMap((item) => item.id ? [item.id] : []) ?? [];
      setDraft((current) => {
        const nextModels = { ...current.models };
        for (const id of ids) {
          nextModels[id] ??= { ...emptyModel(), id, name: id };
        }
        return { ...current, models: nextModels };
      });
      setDiscoveryMessage(t('settings.provider.wizard.models.discovered', { count: ids.length }));
    } catch (error) {
      setDiscoveryMessage(t('settings.provider.wizard.models.discoverFailed', { message: (error as Error).message }));
    } finally {
      clearTimeout(timeoutId);
      setDiscovering(false);
    }
  };

  const save = () => {
    if (!modelsValid) {
      setValidationMessage(
        hasDuplicateModelIds
          ? t('settings.provider.wizard.models.duplicateId')
          : t('settings.provider.wizard.validation.modelInvalid'),
      );
      return;
    }
    const normalizedModels = Object.fromEntries(models.map((model) => [model.id, model]));
    const defaultModelId = normalizedModels[draft.defaultModelId ?? '']
      ? draft.defaultModelId
      : models[0]?.id;
    onSave({ ...draft, models: normalizedModels, defaultModelId });
  };

  const steps: Array<{ id: Step; label: string }> = [
    { id: 'template', label: t('settings.provider.wizard.stepLabels.template') },
    { id: 'connection', label: t('settings.provider.wizard.stepLabels.connection') },
    { id: 'models', label: t('settings.provider.wizard.stepLabels.models') },
  ];

  return (
    <div data-testid="provider-wizard" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onClose} className="text-sm text-mute hover:text-ink">
          ← {t('settings.provider.wizard.back')}
        </button>
        <div className="flex gap-2 text-[11px] text-mute">
          {steps.map((item) => (
            <span key={item.id} className={cn(step === item.id && 'font-semibold text-primary')}>{item.label}</span>
          ))}
        </div>
      </div>

      {step === 'template' && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">{t('settings.provider.wizard.template.title')}</h3>
            <p className="text-xs text-mute mt-1">{t('settings.provider.wizard.template.description')}</p>
          </div>
          <button
            type="button"
            data-testid="custom-template-button"
            onClick={() => selectTemplate()}
            className="w-full text-left border border-primary/40 rounded-xl px-3 py-3 hover:bg-primary/5"
          >
            <div className="text-sm font-medium text-ink">{t('settings.provider.wizard.template.useCustom')}</div>
            <div className="text-xs text-mute mt-1">{t('settings.provider.wizard.template.useCustomDesc')}</div>
          </button>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('settings.provider.wizard.template.searchPlaceholder')}
            className="w-full px-3 py-2 text-sm border border-hairline rounded-lg bg-surface-soft text-ink focus:outline-none focus:border-primary"
          />
          <div className="max-h-64 overflow-y-auto border border-hairline rounded-xl divide-y divide-hairline">
            {filteredCatalog.map((item) => (
              <button key={item.id} type="button" onClick={() => selectTemplate(item)} className="w-full text-left px-3 py-2.5 hover:bg-surface-soft">
                <div className="text-sm font-medium text-ink">{item.name}</div>
                <div className="text-xs text-mute">
                  {t('settings.provider.wizard.template.itemCount', { count: Object.keys(item.models).length, id: item.id })}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'connection' && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-ink">{t('settings.provider.wizard.connection.title')}</h3>
            <p className="text-xs text-mute mt-1">{t('settings.provider.wizard.connection.description')}</p>
          </div>
          <label className="block text-sm text-mute">
            {t('settings.provider.wizard.connection.nameLabel')}
            <input
              data-testid="provider-name-input"
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              placeholder={t('settings.provider.wizard.connection.namePlaceholder')}
              className="mt-1 w-full px-3 py-2 border border-hairline rounded-lg bg-surface-soft text-ink focus:outline-none focus:border-primary"
            />
          </label>
          <label className="block text-sm text-mute">
            {t('settings.provider.wizard.connection.endpointLabel')}
            <input
              data-testid="provider-api-input"
              type="url"
              value={draft.api ?? ''}
              onChange={(event) => updateDraft({ api: event.target.value, endpoint: event.target.value })}
              placeholder={t('settings.provider.wizard.connection.endpointPlaceholder')}
              className="mt-1 w-full px-3 py-2 border border-hairline rounded-lg bg-surface-soft text-ink focus:outline-none focus:border-primary"
            />
          </label>
          <label className="block text-sm text-mute">
            {t('settings.provider.wizard.connection.apiKeyLabel')}
            <input
              data-testid="provider-apikey-input"
              type="password"
              value={draft.apiKey}
              onChange={(event) => updateDraft({ apiKey: event.target.value })}
              placeholder={t('settings.provider.wizard.connection.apiKeyPlaceholder')}
              className="mt-1 w-full px-3 py-2 border border-hairline rounded-lg bg-surface-soft text-ink focus:outline-none focus:border-primary"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-mute">
            <input type="checkbox" checked={draft.isLocalTrusted} onChange={(event) => updateDraft({ isLocalTrusted: event.target.checked })} />
            {' '}{t('settings.provider.wizard.connection.trustedLabel')}
          </label>
          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => (provider ? onClose() : setStep('template'))} className="px-3 py-2 text-sm text-mute hover:text-ink">
              {t('settings.provider.wizard.connection.back')}
            </button>
            <button type="button" data-testid="provider-connection-next" disabled={!draft.name.trim() || !draft.api?.trim()} onClick={() => setStep('models')} className="px-4 py-2 text-sm rounded-lg bg-primary text-on-primary disabled:bg-hairline-soft disabled:text-mute">
              {t('settings.provider.wizard.connection.continue')}
            </button>
          </div>
        </div>
      )}

      {step === 'models' && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">{t('settings.provider.wizard.models.title')}</h3>
              <p className="text-xs text-mute mt-1">{t('settings.provider.wizard.models.description')}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={discoverModels} disabled={discovering} className="text-xs px-2 py-1 rounded-md border border-hairline text-mute hover:text-ink">
                {discovering ? t('settings.provider.wizard.models.discovering') : t('settings.provider.wizard.models.discoverButton')}
              </button>
              <button type="button" data-testid="add-model-button" onClick={addModel} className="text-xs px-2 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/5">
                {t('settings.provider.wizard.models.addModel')}
              </button>
            </div>
          </div>
          {discoveryMessage && <p className="text-xs text-mute">{discoveryMessage}</p>}
          {models.map((model, index) => {
            const key = Object.entries(draft.models ?? {}).find(([, value]) => value === model)?.[0] ?? model.id;
            const isDefault = draft.defaultModelId === model.id;
            const selectedEfforts = model.reasoningEfforts ?? [];
            return (
              <div key={`${key}-${index}`} className="border border-hairline rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{model.name || t('settings.provider.wizard.models.newModel')}</span>
                  <div className="flex gap-2">
                    <label className="text-xs text-mute">
                      <input type="radio" name="default-model" checked={isDefault} onChange={() => updateDraft({ defaultModelId: model.id })} />
                      {' '}{t('settings.provider.wizard.models.defaultModel')}
                    </label>
                    <button type="button" onClick={() => removeModel(key)} className="text-xs text-danger">
                      {t('settings.provider.wizard.models.deleteModel')}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={model.id} onChange={(event) => updateModel(key, { id: event.target.value })} placeholder={t('settings.provider.wizard.models.idPlaceholder')} className="px-2 py-1.5 text-xs border border-hairline rounded-md bg-surface-soft text-ink" />
                  <input value={model.name} onChange={(event) => updateModel(key, { name: event.target.value })} placeholder={t('settings.provider.wizard.models.namePlaceholder')} className="px-2 py-1.5 text-xs border border-hairline rounded-md bg-surface-soft text-ink" />
                  <input type="number" value={model.limit?.context ?? ''} onChange={(event) => updateModel(key, { limit: { ...model.limit, context: Number(event.target.value) } })} placeholder={t('settings.provider.wizard.models.contextPlaceholder')} className="px-2 py-1.5 text-xs border border-hairline rounded-md bg-surface-soft text-ink" />
                  <input type="number" value={model.limit?.output ?? ''} onChange={(event) => updateModel(key, { limit: { ...model.limit, output: Number(event.target.value) } })} placeholder={t('settings.provider.wizard.models.maxOutputPlaceholder')} className="px-2 py-1.5 text-xs border border-hairline rounded-md bg-surface-soft text-ink" />
                  <input type="number" value={model.defaults?.maxOutputTokens ?? ''} onChange={(event) => updateModel(key, { defaults: { ...model.defaults, maxOutputTokens: Number(event.target.value) } })} placeholder={t('settings.provider.wizard.models.defaultOutputPlaceholder')} className="px-2 py-1.5 text-xs border border-hairline rounded-md bg-surface-soft text-ink" />
                  <input type="number" step="0.1" value={model.defaults?.temperature ?? ''} onChange={(event) => updateModel(key, { defaults: { ...model.defaults, temperature: Number(event.target.value) } })} placeholder={t('settings.provider.wizard.models.temperaturePlaceholder')} className="px-2 py-1.5 text-xs border border-hairline rounded-md bg-surface-soft text-ink" />
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-mute">
                  <label>
                    <input type="checkbox" checked={model.tool_call ?? false} onChange={(event) => updateModel(key, { tool_call: event.target.checked })} />
                    {' '}{t('settings.provider.wizard.models.supportsTools')}
                  </label>
                  <label>
                    <input type="checkbox" checked={model.reasoning ?? false} onChange={(event) => updateModel(key, { reasoning: event.target.checked, reasoningEfforts: event.target.checked ? selectedEfforts : [], defaultReasoningEffort: event.target.checked ? model.defaultReasoningEffort : undefined })} />
                    {' '}{t('settings.provider.wizard.models.supportsReasoning')}
                  </label>
                  {model.reasoning && EFFORTS.map((effort) => (
                    <label key={effort}>
                      <input type="checkbox" checked={selectedEfforts.includes(effort)} onChange={(event) => {
                        const next = event.target.checked ? [...selectedEfforts, effort] : selectedEfforts.filter((item) => item !== effort);
                        updateModel(key, { reasoningEfforts: next, defaultReasoningEffort: next.includes(model.defaultReasoningEffort ?? '') ? model.defaultReasoningEffort : next[0] });
                      }} />
                      {' '}{t(`settings.agent.reasoningOptions.${effort}`)}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {!models.length && <p className="text-sm text-mute text-center py-4">{t('settings.provider.wizard.models.noValidModels')}</p>}
          {validationMessage && <p className="text-xs text-danger">{validationMessage}</p>}
          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep('connection')} className="px-3 py-2 text-sm text-mute hover:text-ink">
              {t('settings.provider.wizard.models.back')}
            </button>
            <button type="button" data-testid="save-provider-button" disabled={!modelsValid} onClick={save} className="px-4 py-2 text-sm rounded-lg bg-primary text-on-primary disabled:bg-hairline-soft disabled:text-mute">
              {t('settings.provider.wizard.models.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

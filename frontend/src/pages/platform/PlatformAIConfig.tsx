import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    CircleHelp,
    KeyRound,
    RefreshCw,
    Save,
    Server,
    Settings,
} from 'lucide-react';
import apiService from '../../services/api';

interface ModelOption { id: string; label?: string; dim?: number }
interface ProviderInfo {
    available: boolean;
    models: ModelOption[];
    note?: string;
}
interface SystemModels {
    embedding: Record<string, ProviderInfo>;
    llm: Record<string, ProviderInfo>;
    current_vector_dim: number;
    current_embedding_provider: string;
    current_embedding_model: string;
}
interface AIConfig {
    llm_provider: string;
    llm_model: string;
    llm_api_key: string;
    llm_api_base: string;
    embedding_provider: string;
    embedding_model: string;
    embedding_api_key: string;
    embedding_api_base: string;
    max_tokens_per_request: number;
    requests_per_minute: number;
    updated_at?: string;
}

type EmbedMeta = { label: string; needsKey: boolean; needsBase: boolean };
type LlmMeta = { label: string; needsKey: boolean; needsBase: boolean };

const EMBED_META: Record<string, EmbedMeta> = {
    sentence_transformers: { label: 'SentenceTransformers (Local)', needsKey: false, needsBase: false },
    openai: { label: 'OpenAI Embeddings', needsKey: true, needsBase: false },
    huggingface: { label: 'HuggingFace Embeddings', needsKey: true, needsBase: false },
};

const LLM_META: Record<string, LlmMeta> = {
    openai: { label: 'OpenAI', needsKey: true, needsBase: false },
    ollama: { label: 'Ollama (Local)', needsKey: false, needsBase: true },
    anthropic: { label: 'Anthropic', needsKey: true, needsBase: false },
    huggingface: { label: 'HuggingFace', needsKey: true, needsBase: false },
    local: { label: 'Local Transformers', needsKey: false, needsBase: false },
};

const LOCAL_LLM_PROVIDERS = new Set(['ollama', 'local']);
const LOCAL_EMBEDDING_PROVIDERS = new Set(['sentence_transformers']);

const inputCls =
    'w-full h-11 px-3 rounded-lg border border-border text-text-main text-sm ' +
    'placeholder-text-muted bg-surface ' +
    'focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:border-transparent ' +
    'transition-all duration-150';

const selectCls =
    'w-full h-11 px-3 rounded-lg border border-border text-text-main text-sm ' +
    'bg-surface focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:border-transparent ' +
    'transition-all duration-150';

const StatusPill: React.FC<{ ok: boolean; okLabel: string; badLabel: string; subtle?: boolean }> = ({
    ok,
    okLabel,
    badLabel,
    subtle = false,
}) => (
    <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${ok
            ? subtle ? 'bg-green-500/10 text-green-600 border border-green-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'
            : subtle ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
            }`}
    >
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-green-500' : subtle ? 'bg-amber-500' : 'bg-red-500'}`} />
        {ok ? okLabel : badLabel}
    </span>
);

const HelpTooltip: React.FC<{ title: string; steps: string[] }> = ({ title, steps }) => (
    <div className="group relative inline-flex items-center">
        <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-text-muted transition hover:text-text-main"
            aria-label={`Help for ${title}`}
        >
            <CircleHelp className="h-3.5 w-3.5" />
        </button>
        <div className="pointer-events-none absolute left-0 top-8 z-[120] w-72 max-w-[calc(100vw-2rem)] translate-y-1 rounded-xl border border-border bg-surface p-3 text-left opacity-0 shadow-lg transition-all duration-150 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
            <p className="text-xs font-semibold text-text-main">{title}</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-xs text-text-muted">
                {steps.map((step) => (
                    <li key={step}>{step}</li>
                ))}
            </ol>
        </div>
    </div>
);

const FieldLabel: React.FC<{ children: React.ReactNode; helpTitle?: string; helpSteps?: string[] }> = ({
    children,
    helpTitle,
    helpSteps,
}) => (
    <div className="mb-1.5 flex items-center gap-2">
        <label className="text-sm font-medium text-text-main">{children}</label>
        {helpTitle && helpSteps && helpSteps.length > 0 && (
            <HelpTooltip title={helpTitle} steps={helpSteps} />
        )}
    </div>
);

const ProviderButtons: React.FC<{
    providers: [string, ProviderInfo][];
    selected: string;
    onSelect: (provider: string) => void;
    meta: Record<string, { label: string }>;
    disabledProviders?: Set<string>;
}> = ({ providers, selected, onSelect, meta, disabledProviders }) => (
    <div className="grid gap-2 sm:grid-cols-2">
        {providers.map(([provider, info]) => {
            const isSelected = provider === selected;
            const isDisabled = Boolean(disabledProviders?.has(provider));
            return (
                <button
                    key={provider}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => onSelect(provider)}
                    className={`rounded-xl border p-3 text-left transition-all duration-150 ${isSelected
                        ? 'border-accent-cyan bg-accent-cyan/10'
                        : isDisabled
                            ? 'border-border bg-surface opacity-60 cursor-not-allowed'
                            : 'border-border bg-surface hover:border-accent-cyan/60'
                        }`}
                >
                    <p className="text-sm font-semibold text-text-main">{meta[provider]?.label ?? provider}</p>
                    <div className="mt-1.5">
                        {isDisabled ? (
                            <StatusPill ok={false} okLabel="" badLabel="Locked" subtle />
                        ) : (
                            <StatusPill ok={info.available} okLabel="Detected" badLabel="Not detected" subtle />
                        )}
                    </div>
                </button>
            );
        })}
    </div>
);

const ModelField: React.FC<{
    models: ModelOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    hint?: string;
}> = ({ models, value, onChange, placeholder, hint }) => (
    <div className="space-y-1.5">
        {models.length > 0 ? (
            <select className={selectCls} value={value} onChange={(event) => onChange(event.target.value)}>
                {models.map((model) => (
                    <option key={model.id} value={model.id}>
                        {model.label || model.id}
                        {model.dim ? ` (${model.dim}d)` : ''}
                    </option>
                ))}
            </select>
        ) : (
            <input
                className={inputCls}
                type="text"
                value={value}
                placeholder={placeholder}
                onChange={(event) => onChange(event.target.value)}
            />
        )}
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
);

const ApiKeyField: React.FC<{
    value: string;
    onChange: (value: string) => void;
    hasSavedKey: boolean;
    providerLabel: string;
}> = ({ value, onChange, hasSavedKey, providerLabel }) => (
    <div className="space-y-1.5">
        <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted/70" />
            <input
                className={`${inputCls} pl-9 font-mono text-xs`}
                type="password"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={hasSavedKey ? 'Keep empty to use saved key, or type a new one' : `Enter ${providerLabel} key`}
            />
        </div>
        {hasSavedKey && !value && <p className="text-xs text-green-600">Saved key is already available.</p>}
    </div>
);

export const PlatformAIConfig: React.FC = () => {
    const [config, setConfig] = useState<AIConfig>({
        llm_provider: 'openai',
        llm_model: '',
        llm_api_key: '',
        llm_api_base: '',
        embedding_provider: 'sentence_transformers',
        embedding_model: '',
        embedding_api_key: '',
        embedding_api_base: '',
        max_tokens_per_request: 1000,
        requests_per_minute: 60,
    });

    const [savedConfig, setSavedConfig] = useState<AIConfig | null>(null);
    const [savedKeyState, setSavedKeyState] = useState({ llm: false, embedding: false });

    const [system, setSystem] = useState<SystemModels | null>(null);
    const [llmKeyInput, setLlmKeyInput] = useState('');
    const [embedKeyInput, setEmbedKeyInput] = useState('');

    const [loading, setLoading] = useState(true);
    const [probing, setProbing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [showEmbeddingChangeConfirm, setShowEmbeddingChangeConfirm] = useState(false);

    const applyFetchedConfig = useCallback((data: AIConfig) => {
        setConfig(data);
        setSavedConfig(data);
        setSavedKeyState({
            llm: (data.llm_api_key || '').includes('***'),
            embedding: (data.embedding_api_key || '').includes('***'),
        });
        setLlmKeyInput('');
        setEmbedKeyInput('');
    }, []);

    const fetchConfig = useCallback(async () => {
        const response = await apiService.get('/platform/ai-config/');
        applyFetchedConfig(response.data as AIConfig);
    }, [applyFetchedConfig]);

    const fetchSystem = useCallback(async () => {
        setProbing(true);
        try {
            const response = await apiService.get('/platform/ai-config/available-models/');
            setSystem(response.data as SystemModels);
        } finally {
            setProbing(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                await Promise.all([fetchConfig(), fetchSystem()]);
            } catch {
                if (active) setErrorMsg('Failed to load AI configuration.');
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => {
            active = false;
        };
    }, [fetchConfig, fetchSystem]);

    const embedProviders = useMemo(
        () => (system ? (Object.entries(system.embedding) as [string, ProviderInfo][]) : []),
        [system]
    );
    const llmProviders = useMemo(
        () => (system ? (Object.entries(system.llm) as [string, ProviderInfo][]) : []),
        [system]
    );

    const isLocalLlmMode = LOCAL_LLM_PROVIDERS.has(config.llm_provider);

    const disabledEmbeddingProviders = useMemo(() => {
        const disabled = new Set<string>();
        if (!isLocalLlmMode) return disabled;
        for (const [provider] of embedProviders) {
            if (!LOCAL_EMBEDDING_PROVIDERS.has(provider)) {
                disabled.add(provider);
            }
        }
        return disabled;
    }, [embedProviders, isLocalLlmMode]);

    useEffect(() => {
        if (!isLocalLlmMode) return;
        if (LOCAL_EMBEDDING_PROVIDERS.has(config.embedding_provider)) return;

        const fallbackProvider = 'sentence_transformers';
        const fallbackModel = system?.embedding?.[fallbackProvider]?.models?.[0]?.id || '';
        setConfig((prev) => ({
            ...prev,
            embedding_provider: fallbackProvider,
            embedding_model: fallbackModel,
            embedding_api_base: '',
        }));
        setEmbedKeyInput('');
    }, [config.embedding_provider, isLocalLlmMode, system]);

    const embedMeta = EMBED_META[config.embedding_provider] || {
        label: config.embedding_provider,
        needsKey: true,
        needsBase: false,
    };

    const llmMeta = LLM_META[config.llm_provider] || {
        label: config.llm_provider,
        needsKey: true,
        needsBase: false,
    };

    const currentEmbedInfo = system?.embedding?.[config.embedding_provider];
    const currentLlmInfo = system?.llm?.[config.llm_provider];

    const fieldsToCompare: Array<keyof AIConfig> = [
        'llm_provider',
        'llm_model',
        'llm_api_base',
        'embedding_provider',
        'embedding_model',
        'embedding_api_base',
        'max_tokens_per_request',
        'requests_per_minute',
    ];

    const hasUnsavedFieldChanges =
        Boolean(savedConfig) && fieldsToCompare.some((field) => config[field] !== savedConfig?.[field]);

    const hasUnsavedKeyDraft = llmKeyInput.trim().length > 0 || embedKeyInput.trim().length > 0;
    const hasUnsavedDraft = hasUnsavedFieldChanges || hasUnsavedKeyDraft;

    const embeddingConfigChanged = Boolean(savedConfig) && (
        config.embedding_provider !== savedConfig?.embedding_provider ||
        config.embedding_model !== savedConfig?.embedding_model
    );

    const embeddingImpactItems = [
        'Existing vectors may no longer match the new embedding space until documents are reprocessed.',
        'Search quality can drop temporarily because old and new embeddings are mixed.',
        'If vector dimensions differ, chunks can be skipped during indexing/search paths.',
        'Document processing jobs may increase while full re-indexing is running.',
    ];

    const embeddingActionItems = [
        'Reprocess all completed documents after saving.',
        'Monitor document processing queue/progress until all finish.',
        'Validate a few critical chatbot queries after re-indexing.',
    ];

    const performSave = async () => {
        setSaving(true);
        setStatus('idle');
        setErrorMsg('');

        try {
            const payload: Record<string, unknown> = {
                llm_provider: config.llm_provider,
                llm_model: config.llm_model,
                llm_api_base: config.llm_api_base,
                embedding_provider: config.embedding_provider,
                embedding_model: config.embedding_model,
                embedding_api_base: config.embedding_api_base,
                max_tokens_per_request: config.max_tokens_per_request,
                requests_per_minute: config.requests_per_minute,
            };

            if (llmKeyInput.trim().length > 0) payload.llm_api_key_input = llmKeyInput.trim();
            if (embedKeyInput.trim().length > 0) payload.embedding_api_key_input = embedKeyInput.trim();

            const response = await apiService.put('/platform/ai-config/update/', payload);
            applyFetchedConfig(response.data as AIConfig);
            setStatus('success');
            await fetchSystem();
            window.setTimeout(() => setStatus('idle'), 3000);
        } catch (error: unknown) {
            setStatus('error');
            const axiosError = error as { response?: { data?: { detail?: string } } };
            setErrorMsg(axiosError?.response?.data?.detail || 'Failed to save configuration.');
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        if (embeddingConfigChanged) {
            setShowEmbeddingChangeConfirm(true);
            return;
        }
        await performSave();
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center gap-2 text-text-muted">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Loading AI configuration...
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-5xl space-y-5 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-main">
                        <Settings className="h-6 w-6 text-accent-cyan" />
                        AI Configuration
                    </h1>
                    <p className="mt-1 text-sm text-text-muted">Simple flow: choose provider, choose model, save.</p>
                </div>
                <button
                    type="button"
                    onClick={async () => {
                        setErrorMsg('');
                        try {
                            await Promise.all([fetchConfig(), fetchSystem()]);
                        } catch {
                            setErrorMsg('Failed to refresh provider status.');
                        }
                    }}
                    disabled={probing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text-muted transition-all hover:bg-surface-hover hover:text-text-main disabled:opacity-60"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${probing ? 'animate-spin' : ''}`} />
                    {probing ? 'Refreshing' : 'Refresh Status'}
                </button>
            </div>

            {status === 'success' && (
                <div className="flex items-start gap-2 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    Configuration saved successfully.
                </div>
            )}

            {(status === 'error' || errorMsg) && (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {errorMsg || 'Failed to save configuration.'}
                </div>
            )}

            {hasUnsavedDraft && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    You have unsaved changes.
                </div>
            )}

            {isLocalLlmMode && (
                <div className="flex items-start gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-600">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    Local LLM selected. Only local embedding providers are enabled.
                </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold text-text-main">Embedding</h2>
                            <HelpTooltip
                                title="Embedding tab"
                                steps={[
                                    'Select embedding provider.',
                                    'Select embedding model.',
                                    'Add embedding key only if provider needs it.',
                                    'Save to apply changes.',
                                ]}
                            />
                        </div>
                        <StatusPill
                            ok={Boolean(currentEmbedInfo?.available) || config.embedding_provider === 'sentence_transformers'}
                            okLabel="Connected"
                            badLabel="Check provider"
                            subtle
                        />
                    </div>

                    <div className="mt-4 space-y-4">
                        <div>
                            <FieldLabel>Provider</FieldLabel>
                            <ProviderButtons
                                providers={embedProviders}
                                selected={config.embedding_provider}
                                disabledProviders={disabledEmbeddingProviders}
                                onSelect={(provider) => {
                                    if (disabledEmbeddingProviders.has(provider)) return;
                                    const firstModel = system?.embedding?.[provider]?.models?.[0]?.id || '';
                                    setConfig((prev) => ({
                                        ...prev,
                                        embedding_provider: provider,
                                        embedding_model: firstModel,
                                    }));
                                    setEmbedKeyInput('');
                                }}
                                meta={EMBED_META}
                            />
                            {currentEmbedInfo?.note && <p className="mt-1.5 text-xs text-text-muted">{currentEmbedInfo.note}</p>}
                        </div>

                        <div>
                            <FieldLabel
                                helpTitle="Embedding model"
                                helpSteps={[
                                    'Pick one model from list.',
                                    'If list is empty, type model id manually.',
                                    'Changing model can require re-indexing documents.',
                                ]}
                            >
                                Model
                            </FieldLabel>
                            <ModelField
                                models={currentEmbedInfo?.models || []}
                                value={config.embedding_model}
                                onChange={(value) => setConfig((prev) => ({ ...prev, embedding_model: value }))}
                                placeholder={config.embedding_provider === 'sentence_transformers' ? 'Example: all-MiniLM-L6-v2' : 'Embedding model id'}
                                hint={
                                    system?.current_vector_dim
                                        ? `Current vector size: ${system.current_vector_dim}d`
                                        : undefined
                                }
                            />
                        </div>

                        {embedMeta.needsKey && (
                            <div>
                                <FieldLabel
                                    helpTitle="Embedding API key"
                                    helpSteps={[
                                        'Only needed for cloud embedding providers.',
                                        'Leave empty to keep existing saved key.',
                                        'Type a new key to replace current one.',
                                    ]}
                                >
                                    API Key
                                </FieldLabel>
                                <ApiKeyField
                                    value={embedKeyInput}
                                    onChange={setEmbedKeyInput}
                                    hasSavedKey={savedKeyState.embedding}
                                    providerLabel={embedMeta.label}
                                />
                            </div>
                        )}

                        {config.embedding_provider === 'huggingface' && (
                            <div>
                                <FieldLabel>Base URL (optional)</FieldLabel>
                                <div className="relative">
                                    <Server className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted/70" />
                                    <input
                                        className={`${inputCls} pl-9 font-mono text-xs`}
                                        type="text"
                                        value={config.embedding_api_base}
                                        onChange={(event) => setConfig((prev) => ({ ...prev, embedding_api_base: event.target.value }))}
                                        placeholder="https://api-inference.huggingface.co/..."
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold text-text-main">LLM</h2>
                            <HelpTooltip
                                title="LLM tab"
                                steps={[
                                    'Select LLM provider.',
                                    'Select model.',
                                    'Add API key if needed.',
                                    'Save to make this LLM active.',
                                ]}
                            />
                        </div>
                        <StatusPill
                            ok={Boolean(currentLlmInfo?.available)}
                            okLabel="Connected"
                            badLabel="Check provider"
                            subtle
                        />
                    </div>

                    <div className="mt-4 space-y-4">
                        <div>
                            <FieldLabel>Provider</FieldLabel>
                            <ProviderButtons
                                providers={llmProviders}
                                selected={config.llm_provider}
                                onSelect={(provider) => {
                                    const firstModel = system?.llm?.[provider]?.models?.[0]?.id || '';
                                    const nextIsLocalMode = LOCAL_LLM_PROVIDERS.has(provider);
                                    const fallbackEmbeddingProvider = 'sentence_transformers';
                                    const fallbackEmbeddingModel = system?.embedding?.[fallbackEmbeddingProvider]?.models?.[0]?.id || '';

                                    setConfig((prev) => {
                                        const next = {
                                            ...prev,
                                            llm_provider: provider,
                                            llm_model: firstModel,
                                        };
                                        if (nextIsLocalMode && !LOCAL_EMBEDDING_PROVIDERS.has(prev.embedding_provider)) {
                                            return {
                                                ...next,
                                                embedding_provider: fallbackEmbeddingProvider,
                                                embedding_model: fallbackEmbeddingModel,
                                                embedding_api_base: '',
                                            };
                                        }
                                        return next;
                                    });

                                    if (nextIsLocalMode) {
                                        setEmbedKeyInput('');
                                    }
                                    setLlmKeyInput('');
                                }}
                                meta={LLM_META}
                            />
                            {currentLlmInfo?.note && <p className="mt-1.5 text-xs text-text-muted">{currentLlmInfo.note}</p>}
                        </div>

                        <div>
                            <FieldLabel
                                helpTitle="LLM model"
                                helpSteps={[
                                    'Pick one model from list.',
                                    'If list is empty, type model id manually.',
                                    'Use Refresh Status after changing provider/key.',
                                ]}
                            >
                                Model
                            </FieldLabel>
                            <ModelField
                                models={currentLlmInfo?.models || []}
                                value={config.llm_model}
                                onChange={(value) => setConfig((prev) => ({ ...prev, llm_model: value }))}
                                placeholder={config.llm_provider === 'ollama' ? 'Example: llama3' : 'LLM model id'}
                            />
                        </div>

                        {llmMeta.needsKey && (
                            <div>
                                <FieldLabel
                                    helpTitle="LLM API key"
                                    helpSteps={[
                                        'Needed for cloud LLM providers.',
                                        'Leave empty to keep existing key.',
                                        'Type new key only when replacing.',
                                    ]}
                                >
                                    API Key
                                </FieldLabel>
                                <ApiKeyField
                                    value={llmKeyInput}
                                    onChange={setLlmKeyInput}
                                    hasSavedKey={savedKeyState.llm}
                                    providerLabel={llmMeta.label}
                                />
                            </div>
                        )}

                        {(llmMeta.needsBase || config.llm_provider === 'huggingface') && (
                            <div>
                                <FieldLabel>Base URL {config.llm_provider === 'ollama' ? '' : '(optional)'}</FieldLabel>
                                <div className="relative">
                                    <Server className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted/70" />
                                    <input
                                        className={`${inputCls} pl-9 font-mono text-xs`}
                                        type="text"
                                        value={config.llm_api_base}
                                        onChange={(event) => setConfig((prev) => ({ ...prev, llm_api_base: event.target.value }))}
                                        placeholder={config.llm_provider === 'ollama' ? 'http://localhost:11434' : 'https://router.huggingface.co'}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-text-main">Rate Limits</h2>
                    <HelpTooltip
                        title="Rate limits tab"
                        steps={[
                            'Set requests per minute limit.',
                            'Set max tokens per response.',
                            'Save to apply limits for new requests.',
                        ]}
                    />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                        <FieldLabel>Requests per minute</FieldLabel>
                        <input
                            className={inputCls}
                            type="number"
                            min={1}
                            max={1000}
                            value={config.requests_per_minute}
                            onChange={(event) => setConfig((prev) => ({ ...prev, requests_per_minute: Number(event.target.value) }))}
                        />
                    </div>
                    <div>
                        <FieldLabel>Max tokens per response</FieldLabel>
                        <input
                            className={inputCls}
                            type="number"
                            min={100}
                            max={8096}
                            value={config.max_tokens_per_request}
                            onChange={(event) => setConfig((prev) => ({ ...prev, max_tokens_per_request: Number(event.target.value) }))}
                        />
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm font-semibold text-text-main">Current active runtime</p>
                    <p className="mt-1 text-xs text-text-muted">
                        LLM: {LLM_META[savedConfig?.llm_provider || '']?.label || savedConfig?.llm_provider || '-'}
                        {' | '}
                        Embedding: {EMBED_META[savedConfig?.embedding_provider || '']?.label || savedConfig?.embedding_provider || '-'}
                    </p>
                    {config.updated_at && (
                        <p className="mt-1 text-xs text-text-muted">Last saved: {new Date(config.updated_at).toLocaleString()}</p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent-cyan px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent-cyan/90 disabled:opacity-60"
                >
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Saving configuration' : 'Save Configuration'}
                </button>
            </div>

            {showEmbeddingChangeConfirm && (
                <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4">
                    <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface shadow-xl">
                        <div className="border-b border-border px-5 py-4">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                                <div>
                                    <h3 className="text-base font-semibold text-text-main">Embedding change requires full reprocessing</h3>
                                    <p className="mt-1 text-sm text-text-muted">
                                        You changed the embedding provider/model. This can affect vector compatibility and search until documents are reprocessed.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 px-5 py-4">
                            <div>
                                <p className="text-sm font-semibold text-text-main">Possible impact</p>
                                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-text-muted">
                                    {embeddingImpactItems.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <p className="text-sm font-semibold text-text-main">Recommended after save</p>
                                <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm text-text-muted">
                                    {embeddingActionItems.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ol>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
                            <button
                                type="button"
                                onClick={() => setShowEmbeddingChangeConfirm(false)}
                                disabled={saving}
                                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-main transition hover:bg-surface-hover disabled:opacity-60"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    setShowEmbeddingChangeConfirm(false);
                                    await performSave();
                                }}
                                disabled={saving}
                                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                            >
                                Confirm and Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

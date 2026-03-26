/**
 * PlatformAIConfig — light-theme consistent version.
 *
 * Follows the app's design tokens exactly:
 *   - bg-white cards, border-gray-200 borders
 *   - text-gray-900 headings, text-gray-600 body, text-gray-500 hints
 *   - focus:ring-brand-500 / focus:border-brand-500  (indigo-500 = #6366F1)
 *   - brand-600 for active state buttons
 *   - No dark-mode overrides anywhere
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Settings, RefreshCw, Save, CheckCircle, AlertTriangle, Key, Server } from 'lucide-react';
import apiService from '../../services/api';

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Provider display labels ────────────────────────────────────────────────────

const EMBED_META: Record<string, { label: string; needsKey: boolean }> = {
    sentence_transformers: { label: 'SentenceTransformers (Local)', needsKey: false },
    openai: { label: 'OpenAI Embeddings', needsKey: true },
    huggingface: { label: 'HuggingFace Inference', needsKey: true },
};
const LLM_META: Record<string, { label: string; needsKey: boolean; needsBase: boolean }> = {
    openai: { label: 'OpenAI', needsKey: true, needsBase: false },
    ollama: { label: 'Ollama', needsKey: false, needsBase: true },
    anthropic: { label: 'Anthropic', needsKey: true, needsBase: false },
    huggingface: { label: 'HuggingFace', needsKey: true, needsBase: false },
};

// ── Shared input className — matches the app's Input component exactly ─────────
const inputCls =
    'w-full h-11 px-3 rounded-lg border border-border text-text-main text-sm ' +
    'placeholder-text-muted bg-surface ' +
    'focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:border-transparent ' +
    'transition-all duration-150';

const selectCls =
    'w-full h-11 px-3 rounded-lg border border-border text-text-main text-sm ' +
    'bg-surface focus:outline-none focus:ring-2 focus:ring-accent-cyan focus:border-transparent ' +
    'transition-all duration-150';

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Available = green, unavailable = light gray */
const StatusPill: React.FC<{ available: boolean; label: string }> = ({ available, label }) => (
    <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${available
            ? 'bg-green-500/10 text-green-500 ring-1 ring-green-500/20'
            : 'bg-surface-hover text-text-muted'
            }`}
    >
        <span className={`w-1.5 h-1.5 rounded-full ${available ? 'bg-green-500' : 'bg-text-muted/50'}`} />
        {label}
    </span>
);

/** Provider selector buttons — indigo when active, light when inactive, muted when unavailable */
const ProviderButtons: React.FC<{
    providers: [string, ProviderInfo][];
    selected: string;
    onSelect: (p: string) => void;
    meta: Record<string, { label: string }>;
}> = ({ providers, selected, onSelect, meta }) => (
    <div className="flex flex-wrap gap-2">
        {providers.map(([id, info]) => {
            const isActive = id === selected;
            return (
                <button
                    key={id}
                    onClick={() => onSelect(id)}
                    type="button"
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-150 ${isActive
                        ? 'bg-accent-cyan border-accent-cyan text-white shadow-sm'
                        : info.available
                            ? 'bg-surface border-border text-text-main hover:border-accent-cyan hover:text-accent-cyan'
                            : 'bg-surface-hover border-border text-text-muted cursor-default'
                        }`}
                >
                    {meta[id]?.label ?? id}
                    {!info.available && !isActive && (
                        <span className="ml-1.5 opacity-50 text-xs font-normal">— unavailable</span>
                    )}
                </button>
            );
        })}
    </div>
);

/** Select dropdown or plain text input based on available models */
const ModelField: React.FC<{
    models: ModelOption[];
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    hint?: string;
    warning?: string;
}> = ({ models, value, onChange, placeholder, hint, warning }) => (
    <div className="space-y-1.5">
        {models.length > 0 ? (
            <select value={value} onChange={e => onChange(e.target.value)} className={selectCls}>
                {models.map(m => (
                    <option key={m.id} value={m.id}>
                        {m.label || m.id}{m.dim ? ` (${m.dim}d)` : ''}
                    </option>
                ))}
            </select>
        ) : (
            <input
                type="text"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder || 'Model ID'}
                className={inputCls}
            />
        )}
        {hint && <p className="text-xs text-text-muted opacity-80">{hint}</p>}
        {warning && (
            <p className="text-xs text-amber-500 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{warning}
            </p>
        )}
    </div>
);

/** API key field with lock icon and saved confirmation */
const ApiKeyField: React.FC<{
    value: string;
    onChange: (v: string) => void;
    isSaved: boolean;
    placeholder?: string;
}> = ({ value, onChange, isSaved, placeholder }) => (
    <div className="space-y-1.5">
        <div className="relative">
            <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted opacity-50" />
            <input
                type="password"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={isSaved ? 'Leave blank to keep the saved key' : placeholder || 'Enter API key'}
                className={inputCls + ' pl-9 font-mono'}
            />
        </div>
        {isSaved && (
            <p className="text-xs text-green-500 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                API key is configured. Type a new one to replace it.
            </p>
        )}
    </div>
);

/** Consistent field label matching the rest of the app */
const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <label className="block text-sm font-medium text-text-main mb-1.5">{children}</label>
);

// ── Main page ──────────────────────────────────────────────────────────────────

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

    const [system, setSystem] = useState<SystemModels | null>(null);
    const [llmKeyInput, setLlmKeyInput] = useState('');
    const [embedKeyInput, setEmbedKeyInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [probing, setProbing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    // ── Fetch ─────────────────────────────────────────────────────────────────────

    const fetchConfig = useCallback(async () => {
        try {
            const res = await apiService.get('/platform/ai-config/');
            setConfig(res.data);
            setLlmKeyInput(res.data.llm_api_key || '');
            setEmbedKeyInput(res.data.embedding_api_key || '');
        } catch {
            setErrorMsg('Failed to load configuration.');
        }
    }, []);

    const fetchSystem = useCallback(async () => {
        setProbing(true);
        try {
            const res = await apiService.get('/platform/ai-config/available-models/');
            setSystem(res.data);
        } catch { /* non-fatal */ } finally { setProbing(false); }
    }, []);

    useEffect(() => {
        Promise.all([fetchConfig(), fetchSystem()]).finally(() => setLoading(false));
    }, [fetchConfig, fetchSystem]);

    // ── Save ──────────────────────────────────────────────────────────────────────

    const handleSave = async () => {
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
            if (llmKeyInput && !llmKeyInput.includes('***')) payload.llm_api_key_input = llmKeyInput;
            if (embedKeyInput && !embedKeyInput.includes('***')) payload.embedding_api_key_input = embedKeyInput;

            const res = await apiService.put('/platform/ai-config/update/', payload);
            setConfig(res.data);
            setStatus('success');
            setTimeout(() => setStatus('idle'), 3000);
            fetchSystem();
        } catch (e: unknown) {
            setStatus('error');
            const axiosErr = e as { response?: { data?: { detail?: string } } };
            setErrorMsg(axiosErr?.response?.data?.detail || 'Failed to save configuration.');
        } finally {
            setSaving(false);
        }
    };

    // ── Derived ───────────────────────────────────────────────────────────────────

    const embedProviders = system ? Object.entries(system.embedding) as [string, ProviderInfo][] : [];
    const llmProviders = system ? Object.entries(system.llm) as [string, ProviderInfo][] : [];

    const curEmbedInfo = system?.embedding[config.embedding_provider];
    const curLlmInfo = system?.llm[config.llm_provider];

    const embedMeta = EMBED_META[config.embedding_provider] ?? { label: config.embedding_provider, needsKey: false };
    const llmMeta = LLM_META[config.llm_provider] ?? { label: config.llm_provider, needsKey: true, needsBase: false };

    const hasLlmKey = !!config.llm_api_key?.includes('***');
    const hasEmbedKey = !!config.embedding_api_key?.includes('***');

    const handleEmbedProviderChange = (p: string) => {
        const first = system?.embedding[p]?.models?.[0]?.id ?? '';
        setConfig(c => ({ ...c, embedding_provider: p, embedding_model: first }));
        setEmbedKeyInput('');
    };
    const handleLlmProviderChange = (p: string) => {
        const first = system?.llm[p]?.models?.[0]?.id ?? '';
        setConfig(c => ({ ...c, llm_provider: p, llm_model: first }));
        setLlmKeyInput('');
    };

    // ── Loading ───────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 gap-2 text-text-muted">
                <RefreshCw className="animate-spin w-4 h-4" />
                Loading AI configuration…
            </div>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────────

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-5">

            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-text-main flex items-center gap-2">
                        <Settings className="w-5 h-5 text-accent-cyan" />
                        AI Configuration
                    </h1>
                    <p className="text-sm text-text-muted mt-0.5">
                        Configure the LLM and embedding model that power the RAG pipeline.
                        Only models available on this system are shown.
                    </p>
                </div>
                <button
                    onClick={() => { fetchConfig(); fetchSystem(); }}
                    disabled={probing}
                    type="button"
                    className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-main border border-border rounded-lg px-3 py-1.5 bg-surface hover:bg-surface-hover transition-all disabled:opacity-50"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
                    {probing ? 'Probing…' : 'Re-probe'}
                </button>
            </div>

            {/* Banners */}
            {status === 'success' && (
                <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3 text-green-500 text-sm">
                    <CheckCircle className="w-4 h-4 shrink-0" /> Configuration saved successfully.
                </div>
            )}
            {(status === 'error' || errorMsg) && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-500 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {errorMsg}
                </div>
            )}

            {/* ── Main form card — bg-white like every other card in the app ── */}
            <div className="bg-surface rounded-xl border border-border shadow-sm divide-y divide-border">

                {/* ══ Embedding section ══ */}
                <div className="p-6 space-y-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-text-main">Embedding</h2>
                        <StatusPill
                            available={!!curEmbedInfo?.available}
                            label={curEmbedInfo?.available ? 'Available' : embedMeta.needsKey ? 'API key required' : 'Not detected'}
                        />
                    </div>

                    <div>
                        <FieldLabel>Provider</FieldLabel>
                        <ProviderButtons
                            providers={embedProviders}
                            selected={config.embedding_provider}
                            onSelect={handleEmbedProviderChange}
                            meta={EMBED_META}
                        />
                        {curEmbedInfo?.note && (
                            <p className="mt-2 text-xs text-text-muted opacity-80">{curEmbedInfo.note}</p>
                        )}
                    </div>

                    <div>
                        <FieldLabel>
                            Model
                            {system?.current_vector_dim && (
                                <span className="ml-2 font-normal text-text-muted opacity-50 text-xs">
                                    active Qdrant dimension: {system.current_vector_dim}d
                                </span>
                            )}
                        </FieldLabel>
                        <ModelField
                            models={curEmbedInfo?.models ?? []}
                            value={config.embedding_model}
                            onChange={v => setConfig(c => ({ ...c, embedding_model: v }))}
                            placeholder={
                                config.embedding_provider === 'sentence_transformers'
                                    ? 'e.g. all-MiniLM-L6-v2'
                                    : config.embedding_provider === 'huggingface'
                                        ? 'e.g. BAAI/bge-small-en-v1.5'
                                        : 'Model ID'
                            }
                            hint={
                                config.embedding_provider === 'sentence_transformers' && !curEmbedInfo?.models.length
                                    ? 'No cached models found — model will be downloaded on first use.'
                                    : undefined
                            }
                            warning={
                                system?.current_embedding_model && config.embedding_model !== system.current_embedding_model
                                    ? 'Changing the model changes the vector dimension — all documents must be re-indexed after saving.'
                                    : undefined
                            }
                        />
                    </div>

                    {embedMeta.needsKey && (
                        <div>
                            <FieldLabel>API Key</FieldLabel>
                            <ApiKeyField
                                value={embedKeyInput}
                                onChange={setEmbedKeyInput}
                                isSaved={hasEmbedKey}
                                placeholder={`Enter ${embedMeta.label} API key`}
                            />
                        </div>
                    )}

                    {config.embedding_provider === 'huggingface' && (
                        <div>
                            <FieldLabel>Custom Base URL <span className="font-normal text-text-muted opacity-50">(optional)</span></FieldLabel>
                            <div className="relative">
                                <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted opacity-50" />
                                <input
                                    type="text"
                                    value={config.embedding_api_base}
                                    onChange={e => setConfig(c => ({ ...c, embedding_api_base: e.target.value }))}
                                    placeholder="https://api-inference.huggingface.co/..."
                                    className={inputCls + ' pl-9 font-mono text-xs'}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* ══ LLM section ══ */}
                <div className="p-6 space-y-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-base font-semibold text-text-main">Language Model (LLM)</h2>
                        <StatusPill
                            available={!!curLlmInfo?.available}
                            label={curLlmInfo?.available ? 'Available' : llmMeta.needsKey ? 'API key required' : 'Not running'}
                        />
                    </div>

                    <div>
                        <FieldLabel>Provider</FieldLabel>
                        <ProviderButtons
                            providers={llmProviders}
                            selected={config.llm_provider}
                            onSelect={handleLlmProviderChange}
                            meta={LLM_META}
                        />
                        {curLlmInfo?.note && (
                            <p className="mt-2 text-xs text-text-muted opacity-80">{curLlmInfo.note}</p>
                        )}
                    </div>

                    <div>
                        <FieldLabel>Model</FieldLabel>
                        <ModelField
                            models={curLlmInfo?.models ?? []}
                            value={config.llm_model}
                            onChange={v => setConfig(c => ({ ...c, llm_model: v }))}
                            placeholder={
                                config.llm_provider === 'ollama'
                                    ? 'e.g. llama3  (run: ollama pull llama3)'
                                    : config.llm_provider === 'huggingface'
                                        ? 'e.g. mistralai/Mistral-7B-Instruct-v0.2'
                                        : 'Model ID'
                            }
                            warning={
                                config.llm_provider === 'ollama' && !curLlmInfo?.available
                                    ? 'Ollama is not running. Start it with: ollama serve'
                                    : undefined
                            }
                        />
                    </div>

                    {llmMeta.needsKey && (
                        <div>
                            <FieldLabel>API Key</FieldLabel>
                            <ApiKeyField
                                value={llmKeyInput}
                                onChange={setLlmKeyInput}
                                isSaved={hasLlmKey}
                                placeholder={`Enter ${llmMeta.label} API key`}
                            />
                            <p className="mt-1.5 text-xs text-text-muted opacity-50">
                                After saving, click Re-probe to unlock models for this provider.
                            </p>
                        </div>
                    )}

                    {(llmMeta.needsBase || config.llm_provider === 'huggingface') && (
                        <div>
                            <FieldLabel>
                                {config.llm_provider === 'ollama' ? 'Ollama Base URL' : 'Custom API Base URL'}
                                {config.llm_provider !== 'ollama' && (
                                    <span className="font-normal text-text-muted opacity-50"> (optional)</span>
                                )}
                            </FieldLabel>
                            <div className="relative">
                                <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted opacity-50" />
                                <input
                                    type="text"
                                    value={config.llm_api_base}
                                    onChange={e => setConfig(c => ({ ...c, llm_api_base: e.target.value }))}
                                    placeholder={config.llm_provider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1'}
                                    className={inputCls + ' pl-9 font-mono text-xs'}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* ══ Rate limits ══ */}
                <div className="p-6 space-y-4">
                    <h2 className="text-base font-semibold text-text-main">Rate Limits</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <FieldLabel>Requests / minute</FieldLabel>
                            <input
                                type="number" min={1} max={1000}
                                value={config.requests_per_minute}
                                onChange={e => setConfig(c => ({ ...c, requests_per_minute: Number(e.target.value) }))}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <FieldLabel>Max tokens / response</FieldLabel>
                            <input
                                type="number" min={100} max={8096}
                                value={config.max_tokens_per_request}
                                onChange={e => setConfig(c => ({ ...c, max_tokens_per_request: Number(e.target.value) }))}
                                className={inputCls}
                            />
                        </div>
                    </div>
                </div>

            </div>

            {/* Footer */}
            <div className="flex items-center justify-between">
                {config.updated_at ? (
                    <span className="text-xs text-text-muted opacity-50">
                        Last saved: {new Date(config.updated_at).toLocaleString()}
                    </span>
                ) : <span />}

                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-accent-cyan hover:bg-accent-cyan/90 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg shadow-sm transition-all duration-150"
                >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Saving…' : 'Save Configuration'}
                </button>
            </div>

        </div>
    );
};

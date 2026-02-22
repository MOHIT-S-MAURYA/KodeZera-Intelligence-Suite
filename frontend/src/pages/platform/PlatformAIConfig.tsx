import React, { useState, useEffect } from 'react';
import { Settings, Zap, Key, Server, CheckCircle, AlertTriangle, RefreshCw, Save } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import apiService from '../../services/api';

// ── Types ──────────────────────────────────────────────────────────────────
type LLMProvider = 'openai' | 'huggingface' | 'anthropic' | 'ollama';
type EmbeddingProvider = 'openai' | 'huggingface' | 'sentence_transformers';

interface AIConfig {
    llm_provider: LLMProvider;
    llm_model: string;
    llm_api_key: string;         // always masked from API
    llm_api_base: string;
    embedding_provider: EmbeddingProvider;
    embedding_model: string;
    embedding_api_key: string;   // always masked from API
    embedding_api_base: string;
    max_tokens_per_request: number;
    requests_per_minute: number;
    updated_at?: string;
}

// ── Model presets per provider ─────────────────────────────────────────────
const LLM_PRESETS: Record<LLMProvider, string[]> = {
    openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    huggingface: ['mistralai/Mistral-7B-Instruct-v0.3', 'meta-llama/Llama-3-8B-Instruct',
        'HuggingFaceH4/zephyr-7b-beta', 'google/flan-t5-xxl'],
    anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    ollama: ['llama3', 'llama3.1', 'mistral', 'phi3', 'gemma2', 'codellama'],
};

const EMBEDDING_PRESETS: Record<EmbeddingProvider, string[]> = {
    openai: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
    huggingface: ['BAAI/bge-small-en-v1.5', 'BAAI/bge-large-en-v1.5',
        'sentence-transformers/all-MiniLM-L6-v2'],
    sentence_transformers: ['all-MiniLM-L6-v2', 'all-mpnet-base-v2', 'BAAI/bge-base-en-v1.5'],
};

const PROVIDER_INFO: Record<LLMProvider, { label: string; needsKey: boolean; needsBase: boolean; note: string }> = {
    openai: { label: 'OpenAI', needsKey: true, needsBase: false, note: 'GPT-4, GPT-3.5, etc.' },
    huggingface: { label: 'HuggingFace Inference', needsKey: true, needsBase: false, note: 'Free tier available on hf.co' },
    anthropic: { label: 'Anthropic', needsKey: true, needsBase: false, note: 'Claude 3.5 Sonnet, Opus, Haiku' },
    ollama: { label: 'Ollama (Local)', needsKey: false, needsBase: true, note: 'Run models locally via Ollama' },
};

const EMBED_INFO: Record<EmbeddingProvider, { label: string; needsKey: boolean; needsBase: boolean }> = {
    openai: { label: 'OpenAI', needsKey: true, needsBase: false },
    huggingface: { label: 'HuggingFace Inference', needsKey: true, needsBase: false },
    sentence_transformers: { label: 'SentenceTransformers (Local)', needsKey: false, needsBase: false },
};

// ── Component ──────────────────────────────────────────────────────────────
export const PlatformAIConfig: React.FC = () => {
    const [config, setConfig] = useState<AIConfig>({
        llm_provider: 'openai',
        llm_model: 'gpt-3.5-turbo',
        llm_api_key: '',
        llm_api_base: '',
        embedding_provider: 'openai',
        embedding_model: 'text-embedding-3-small',
        embedding_api_key: '',
        embedding_api_base: '',
        max_tokens_per_request: 1000,
        requests_per_minute: 60,
    });

    // Track user-entered key values separately (to distinguish untouched masked vs new)
    const [llmKeyInput, setLlmKeyInput] = useState('');
    const [embedKeyInput, setEmbedKeyInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const resp = await apiService.get('/platform/ai-config/');
            setConfig(resp.data);
            // Show masked key as placeholder; user must type a new one to replace
            setLlmKeyInput(resp.data.llm_api_key || '');
            setEmbedKeyInput(resp.data.embedding_api_key || '');
        } catch (e: any) {
            setErrorMsg('Failed to load AI configuration.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchConfig(); }, []);

    const handleSave = async () => {
        setSaving(true);
        setSaveStatus('idle');
        setErrorMsg('');
        try {
            const payload: any = {
                llm_provider: config.llm_provider,
                llm_model: config.llm_model,
                llm_api_base: config.llm_api_base,
                embedding_provider: config.embedding_provider,
                embedding_model: config.embedding_model,
                embedding_api_base: config.embedding_api_base,
                max_tokens_per_request: config.max_tokens_per_request,
                requests_per_minute: config.requests_per_minute,
            };
            // Only send API keys if user actually typed something new (not the masked placeholder)
            if (llmKeyInput && !llmKeyInput.includes('***')) payload.llm_api_key_input = llmKeyInput;
            if (embedKeyInput && !embedKeyInput.includes('***')) payload.embedding_api_key_input = embedKeyInput;

            const resp = await apiService.put('/platform/ai-config/update/', payload);
            setConfig(resp.data);
            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (e: any) {
            setSaveStatus('error');
            setErrorMsg(e.response?.data?.detail || 'Failed to save configuration.');
        } finally {
            setSaving(false);
        }
    };

    const handleProviderChange = (provider: LLMProvider) => {
        const presets = LLM_PRESETS[provider];
        setConfig(c => ({ ...c, llm_provider: provider, llm_model: presets[0] }));
        setLlmKeyInput('');
    };

    const handleEmbedProviderChange = (provider: EmbeddingProvider) => {
        const presets = EMBEDDING_PRESETS[provider];
        setConfig(c => ({ ...c, embedding_provider: provider, embedding_model: presets[0] }));
        setEmbedKeyInput('');
    };

    const llmInfo = PROVIDER_INFO[config.llm_provider];
    const embedInfo = EMBED_INFO[config.embedding_provider];

    const hasLLMKey = !!(config.llm_api_key && config.llm_api_key.includes('***'));
    const hasEmbedKey = !!(config.embedding_api_key && config.embedding_api_key.includes('***'));

    const statusBadge = (hasKey: boolean, provider: string) => {
        if (provider === 'ollama' || provider === 'sentence_transformers') {
            return <Badge variant="info">Local — No Key Needed</Badge>;
        }
        return hasKey
            ? <Badge variant="success">✅ Key Configured</Badge>
            : <Badge variant="warning">⚠️ Dev Mode (no key)</Badge>;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <RefreshCw className="animate-spin text-indigo-400 w-8 h-8" />
                <span className="ml-3 text-gray-400">Loading AI configuration...</span>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Settings className="w-6 h-6 text-indigo-400" />
                        AI Provider Configuration
                    </h1>
                    <p className="text-gray-400 mt-1 text-sm">
                        Configure which LLM and embedding provider powers the RAG pipeline.
                        Changes take effect immediately — no restart required.
                    </p>
                </div>
                <Button onClick={fetchConfig} variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                    <RefreshCw className="w-4 h-4" />
                </Button>
            </div>

            {/* Status banner */}
            {saveStatus === 'success' && (
                <div className="flex items-center gap-2 bg-green-900/40 border border-green-600/40 rounded-lg px-4 py-3 text-green-300">
                    <CheckCircle className="w-5 h-5" /> Configuration saved and active!
                </div>
            )}
            {(saveStatus === 'error' || errorMsg) && (
                <div className="flex items-center gap-2 bg-red-900/40 border border-red-600/40 rounded-lg px-4 py-3 text-red-300">
                    <AlertTriangle className="w-5 h-5" /> {errorMsg}
                </div>
            )}

            {/* ── LLM Settings ── */}
            <Card className="p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-5 h-5 text-yellow-400" />
                    <h2 className="text-lg font-semibold text-white">LLM Provider</h2>
                    {statusBadge(hasLLMKey, config.llm_provider)}
                </div>

                {/* Provider selector */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Provider</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {(Object.keys(PROVIDER_INFO) as LLMProvider[]).map(p => (
                            <button
                                key={p}
                                onClick={() => handleProviderChange(p)}
                                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${config.llm_provider === p
                                        ? 'bg-indigo-600 border-indigo-500 text-white'
                                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-indigo-500'
                                    }`}
                            >
                                {PROVIDER_INFO[p].label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{llmInfo.note}</p>
                </div>

                {/* Model */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Model</label>
                    <div className="flex gap-2">
                        <select
                            value={LLM_PRESETS[config.llm_provider].includes(config.llm_model) ? config.llm_model : '__custom__'}
                            onChange={e => {
                                if (e.target.value !== '__custom__') setConfig(c => ({ ...c, llm_model: e.target.value }));
                            }}
                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                        >
                            {LLM_PRESETS[config.llm_provider].map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                            <option value="__custom__">Custom…</option>
                        </select>
                        <input
                            type="text"
                            value={config.llm_model}
                            onChange={e => setConfig(c => ({ ...c, llm_model: e.target.value }))}
                            placeholder="Custom model ID"
                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                        />
                    </div>
                </div>

                {/* API Key */}
                {llmInfo.needsKey && (
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-1">
                            <Key className="w-4 h-4" /> API Key
                            {hasLLMKey && <span className="text-green-400 text-xs ml-1">(currently set — type new value to replace)</span>}
                        </label>
                        <input
                            type="password"
                            value={llmKeyInput}
                            onChange={e => setLlmKeyInput(e.target.value)}
                            placeholder={hasLLMKey ? '(key saved — leave blank to keep)' : 'Enter API key…'}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-indigo-500 focus:outline-none"
                        />
                    </div>
                )}

                {/* API Base URL (Ollama / HF custom endpoint) */}
                {(llmInfo.needsBase || config.llm_provider === 'huggingface') && (
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-1">
                            <Server className="w-4 h-4" />
                            {config.llm_provider === 'ollama' ? 'Ollama Base URL' : 'Custom API Base URL (optional)'}
                        </label>
                        <input
                            type="text"
                            value={config.llm_api_base}
                            onChange={e => setConfig(c => ({ ...c, llm_api_base: e.target.value }))}
                            placeholder={config.llm_provider === 'ollama' ? 'http://localhost:11434' : 'https://api.openai.com/v1'}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-indigo-500 focus:outline-none"
                        />
                    </div>
                )}

                {/* Max tokens */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Max Tokens per Response</label>
                    <input
                        type="number"
                        min={100} max={8096}
                        value={config.max_tokens_per_request}
                        onChange={e => setConfig(c => ({ ...c, max_tokens_per_request: Number(e.target.value) }))}
                        className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                    />
                </div>
            </Card>

            {/* ── Embedding Settings ── */}
            <Card className="p-6 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-purple-400 text-lg">⚡</span>
                    <h2 className="text-lg font-semibold text-white">Embedding Provider</h2>
                    {statusBadge(hasEmbedKey, config.embedding_provider)}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Provider</label>
                    <div className="grid grid-cols-3 gap-2">
                        {(Object.keys(EMBED_INFO) as EmbeddingProvider[]).map(p => (
                            <button
                                key={p}
                                onClick={() => handleEmbedProviderChange(p)}
                                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${config.embedding_provider === p
                                        ? 'bg-purple-600 border-purple-500 text-white'
                                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-purple-500'
                                    }`}
                            >
                                {EMBED_INFO[p].label}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Embedding Model</label>
                    <div className="flex gap-2">
                        <select
                            value={EMBEDDING_PRESETS[config.embedding_provider].includes(config.embedding_model) ? config.embedding_model : '__custom__'}
                            onChange={e => {
                                if (e.target.value !== '__custom__') setConfig(c => ({ ...c, embedding_model: e.target.value }));
                            }}
                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                        >
                            {EMBEDDING_PRESETS[config.embedding_provider].map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                            <option value="__custom__">Custom…</option>
                        </select>
                        <input
                            type="text"
                            value={config.embedding_model}
                            onChange={e => setConfig(c => ({ ...c, embedding_model: e.target.value }))}
                            placeholder="Custom model ID"
                            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                        />
                    </div>
                </div>

                {embedInfo.needsKey && (
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-1">
                            <Key className="w-4 h-4" /> Embedding API Key
                            {hasEmbedKey && <span className="text-green-400 text-xs ml-1">(currently set)</span>}
                        </label>
                        <input
                            type="password"
                            value={embedKeyInput}
                            onChange={e => setEmbedKeyInput(e.target.value)}
                            placeholder={hasEmbedKey ? '(key saved — leave blank to keep)' : 'Enter embedding API key…'}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-indigo-500 focus:outline-none"
                        />
                    </div>
                )}

                {(config.embedding_provider === 'huggingface') && (
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Custom API Base URL (optional)</label>
                        <input
                            type="text"
                            value={config.embedding_api_base}
                            onChange={e => setConfig(c => ({ ...c, embedding_api_base: e.target.value }))}
                            placeholder="https://api-inference.huggingface.co/pipeline/feature-extraction/..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-indigo-500 focus:outline-none"
                        />
                    </div>
                )}

                {config.embedding_provider === 'sentence_transformers' && (
                    <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 text-yellow-300 text-sm">
                        ⚠️ SentenceTransformers requires <code className="bg-yellow-900/40 px-1 rounded">pip install sentence-transformers</code> on the backend server.
                        No API key needed — models are downloaded locally on first use.
                    </div>
                )}
            </Card>

            {/* ── Rate Limits ── */}
            <Card className="p-6">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-orange-400" /> Rate Limits
                </h2>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Requests per Minute</label>
                        <input
                            type="number" min={1} max={1000}
                            value={config.requests_per_minute}
                            onChange={e => setConfig(c => ({ ...c, requests_per_minute: Number(e.target.value) }))}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Max Tokens / Request</label>
                        <input
                            type="number" min={100} max={8096}
                            value={config.max_tokens_per_request}
                            onChange={e => setConfig(c => ({ ...c, max_tokens_per_request: Number(e.target.value) }))}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                        />
                    </div>
                </div>
            </Card>

            {/* Save / Last updated */}
            <div className="flex items-center justify-between">
                {config.updated_at && (
                    <span className="text-xs text-gray-500">
                        Last updated: {new Date(config.updated_at).toLocaleString()}
                    </span>
                )}
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6"
                >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Saving…' : 'Save Configuration'}
                </Button>
            </div>
        </div>
    );
};

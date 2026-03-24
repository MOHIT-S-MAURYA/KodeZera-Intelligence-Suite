
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export interface Option {
    label: string;
    value: string;
    searchText?: string; // extra hidden text to search against
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    label?: string;
    disabled?: boolean;
    className?: string;
}

/**
 * Score how well `query` matches `haystack`.
 * Returns 0 = no match, higher = better match.
 * Supports multi-word queries: ALL words must appear somewhere.
 */
function scoreMatch(haystack: string, query: string): number {
    const text = haystack.toLowerCase();
    const q = query.toLowerCase().trim();
    if (!q) return 1;

    const words = q.split(/\s+/).filter(Boolean);

    // Every word must appear somewhere in the text
    if (!words.every(w => text.includes(w))) return 0;

    let score = 1;
    // Bonus: exact phrase substring
    if (text.includes(q)) score += 20;
    // Bonus: text starts with the full query
    if (text.startsWith(q)) score += 10;
    // Bonus: any word starts at a word-boundary
    for (const w of words) {
        if (new RegExp(`(?:^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(text)) score += 5;
    }
    // Bonus: shorter text = more specific match
    score += Math.max(0, 50 - text.length) * 0.1;
    return score;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Search...',
    label,
    disabled = false,
    className = '',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    // When closed, always show the selected label (or empty)
    useEffect(() => {
        if (!isOpen) {
            setSearchTerm(selectedOption?.label ?? '');
        }
    }, [isOpen, selectedOption]);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Ranked filter: score each option, drop zeros, sort descending
    const query = isOpen ? searchTerm : '';
    const filteredOptions = query
        ? options
            .map(opt => {
                const hay = `${opt.label} ${opt.value} ${opt.searchText ?? ''}`;
                return { opt, score: scoreMatch(hay, query) };
            })
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score)
            .map(({ opt }) => opt)
        : options; // no query → show full list in original (sorted) order

    const handleFocus = () => {
        if (disabled) return;
        // Clear input so the user sees all options and starts a fresh search
        setSearchTerm('');
        setIsOpen(true);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        if (!isOpen) setIsOpen(true);
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setSearchTerm('');
        setIsOpen(true);
        inputRef.current?.focus();
    };

    const handleSelect = (opt: Option) => {
        onChange(opt.value);
        setSearchTerm(opt.label);
        setIsOpen(false);
    };

    const handleToggle = () => {
        if (disabled) return;
        if (isOpen) {
            setIsOpen(false);
        } else {
            setSearchTerm('');
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    };

    return (
        <div className={`w-full ${className}`}>
            {label && (
                <label className="block text-sm font-semibold text-text-main mb-1.5">{label}</label>
            )}
            <div className="relative group" ref={dropdownRef}>
                {/* Input row */}
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-text-muted group-focus-within:text-accent-cyan transition-colors" />
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        disabled={disabled}
                        className={`block w-full pl-11 pr-16 h-11 border border-border rounded-xl text-sm
                            focus:outline-none focus:ring-2 focus:ring-accent-cyan/50 focus:border-accent-cyan hover:border-border-light
                            placeholder-text-muted/60 transition-all duration-200
                            ${disabled ? 'bg-background cursor-not-allowed text-text-muted opacity-60' : 'bg-surface text-text-main shadow-sm'}`}
                        placeholder={placeholder}
                        value={searchTerm}
                        onChange={handleChange}
                        onFocus={handleFocus}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
                        {/* Clear button — only when a value is selected */}
                        {value && !disabled && (
                            <button
                                type="button"
                                onClick={handleClear}
                                className="p-1 rounded-md text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
                                tabIndex={-1}
                                aria-label="Clear"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleToggle}
                            disabled={disabled}
                            className="p-1 rounded-md text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"
                            tabIndex={-1}
                            aria-label="Toggle dropdown"
                        >
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-accent-cyan' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Dropdown */}
                {isOpen && !disabled && (
                    <div className="absolute z-50 w-full mt-2 bg-surface rounded-xl shadow-glass border border-border-light max-h-64 overflow-y-auto animate-scale-in">
                        {filteredOptions.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-text-muted text-center flex flex-col items-center">
                                <Search className="w-6 h-6 mb-2 opacity-20" />
                                No results for &ldquo;{searchTerm}&rdquo;
                            </div>
                        ) : (
                            <ul className="py-1">
                                {query && (
                                    <li className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-text-muted border-b border-border select-none bg-surface sticky top-0">
                                        {filteredOptions.length} result{filteredOptions.length !== 1 ? 's' : ''}
                                    </li>
                                )}
                                {filteredOptions.map(opt => (
                                    <li
                                        key={opt.value}
                                        className={`px-4 py-2.5 text-sm cursor-pointer select-none transition-colors
                                            ${opt.value === value
                                                ? 'bg-accent-cyan/10 text-accent-cyan font-semibold border-l-2 border-accent-cyan'
                                                : 'text-text-main hover:bg-surface-hover border-l-2 border-transparent'}`}
                                        onMouseDown={(e) => e.preventDefault()} // keep focus in input
                                        onClick={() => handleSelect(opt)}
                                    >
                                        {opt.label}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};


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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
            )}
            <div className="relative" ref={dropdownRef}>
                {/* Input row */}
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        disabled={disabled}
                        className={`block w-full pl-10 pr-16 h-12 border border-gray-200 rounded-lg text-sm
                            focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                            placeholder-gray-400 transition-all duration-150
                            ${disabled ? 'bg-gray-100 cursor-not-allowed text-gray-500' : 'bg-white text-gray-900'}`}
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
                                className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                                tabIndex={-1}
                                aria-label="Clear"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleToggle}
                            disabled={disabled}
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                            tabIndex={-1}
                            aria-label="Toggle dropdown"
                        >
                            <ChevronDown className={`h-4 w-4 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Dropdown */}
                {isOpen && !disabled && (
                    <div className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-64 overflow-y-auto">
                        {filteredOptions.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-gray-500 text-center">
                                No results for &ldquo;{searchTerm}&rdquo;
                            </div>
                        ) : (
                            <ul className="py-1">
                                {query && (
                                    <li className="px-3 py-1 text-xs text-gray-400 border-b border-gray-100 select-none">
                                        {filteredOptions.length} result{filteredOptions.length !== 1 ? 's' : ''}
                                    </li>
                                )}
                                {filteredOptions.map(opt => (
                                    <li
                                        key={opt.value}
                                        className={`px-3 py-2 text-sm cursor-pointer select-none
                                            ${opt.value === value
                                                ? 'bg-brand-50 text-brand-700 font-medium'
                                                : 'text-gray-900 hover:bg-gray-50'}`}
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

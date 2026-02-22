
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export interface Option {
    label: string;
    value: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = "Select...",
    className = ""
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Get selected label
    const selectedOption = options.find(opt => opt.value === value);

    // Initialize search term with selected label on mount or value change
    // But only if not currently open/editing
    useEffect(() => {
        if (!isOpen && selectedOption) {
            setSearchTerm(selectedOption.label);
        } else if (!isOpen && !selectedOption) {
            setSearchTerm('');
        }
    }, [value, selectedOption, isOpen]);

    // Filter options
    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        opt.value.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // Reset search term to selected value on close without selection
                if (selectedOption) {
                    setSearchTerm(selectedOption.label);
                } else {
                    setSearchTerm('');
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [selectedOption]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        if (!isOpen) setIsOpen(true);
    };

    const handleInputFocus = () => {
        setIsOpen(true);
        // Select text on focus for easy replacement
        inputRef.current?.select();

        // If the current search term matches the selected option, clear it to show all options? 
        // Or keep it to show current selection? 
        // User asked for "Searchable", usually means typing filters the list. 
        // If I click, I might want to see all options or just filter.
        // Let's keep it simple: Focus opens dropdown, text remains.
    };

    const handleOptionSelect = (option: Option) => {
        onChange(option.value);
        setSearchTerm(option.label);
        setIsOpen(false);
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            {/* Combobox Input */}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-gray-400" />
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    className="block w-full pl-10 pr-10 py-2 text-sm border border-gray-300 rounded-lg focus:ring-brand-500 focus:border-brand-500 placeholder-gray-400"
                    placeholder={placeholder}
                    value={searchTerm}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
                    <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
                </div>
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white rounded-md shadow-lg border border-gray-200 max-h-60 overflow-auto">
                    <ul className="py-1 text-base sm:text-sm focus:outline-none">
                        {filteredOptions.length === 0 ? (
                            <li className="px-4 py-2 text-gray-500 select-none">
                                No results found
                            </li>
                        ) : (
                            filteredOptions.map((option) => (
                                <li
                                    key={option.value}
                                    className={`relative cursor-pointer select-none py-2 pl-3 pr-9 hover:bg-brand-50 ${option.value === value ? 'text-brand-600 bg-brand-50 font-medium' : 'text-gray-900'
                                        }`}
                                    onClick={() => handleOptionSelect(option)}
                                >
                                    <div className="flex flex-col">
                                        <span className="block truncate">{option.label}</span>
                                        {/* Show ID if explicitly searching or if it mimics the filter logic */}
                                        {option.value !== 'all' && (
                                            <span className="text-xs text-gray-400 truncate">ID: {option.value}</span>
                                        )}
                                    </div>
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
};

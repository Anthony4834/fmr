'use client';

import { useState, useEffect, useRef } from 'react';
import { useDebouncedCallback } from 'use-debounce';

interface AutocompleteResult {
  type: 'zip' | 'city' | 'county' | 'address';
  display: string;
  value: string;
  state?: string;
  zipCode?: string; // ZIP code for address suggestions
}

interface SearchInputProps {
  onSelect: (value: string, type: 'zip' | 'city' | 'county' | 'address') => void;
}

export default function SearchInput({ onSelect }: SearchInputProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompleteResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [wasPasted, setWasPasted] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useDebouncedCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(false);
    try {
      // Check if query looks like an address (has numbers and street-like words)
      const looksLikeAddress = /\d/.test(searchQuery) && 
        (searchQuery.length > 5 || /\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|blvd|boulevard|way|circle|ct|court|court|pl|place)\b/i.test(searchQuery));
      
      // Fetch both regular autocomplete and address autocomplete in parallel
      const [regularResponse, addressResponse] = await Promise.all([
        fetch(`/api/search/autocomplete?q=${encodeURIComponent(searchQuery)}`).catch(() => ({ json: () => ({ results: [] }) })),
        looksLikeAddress || searchQuery.length >= 3
          ? fetch(`/api/search/address-autocomplete?q=${encodeURIComponent(searchQuery)}`).catch(() => ({ json: () => ({ results: [] }) }))
          : Promise.resolve({ json: () => ({ results: [] }) })
      ]);

      const regularData = await regularResponse.json();
      const addressData = await addressResponse.json();

      // Combine results: addresses first, then regular results
      const addressResults: AutocompleteResult[] = (addressData.results || []).map((addr: any) => ({
        type: 'address' as const,
        display: addr.display,
        value: addr.value,
        state: addr.state,
        zipCode: addr.zipCode // Store ZIP code for address suggestions
      }));

      const regularResults: AutocompleteResult[] = regularData.results || [];
      
      // Combine and limit total results
      setSuggestions([...addressResults, ...regularResults].slice(0, 10));
      setHasSearched(true); // Mark that a search has completed
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
      setHasSearched(true);
    } finally {
      setIsLoading(false);
    }
  }, 400);
  
  useEffect(() => {
    fetchSuggestions(query);
  }, [query, fetchSuggestions]);
  
  // Auto-select single suggestion after paste - only for addresses
  useEffect(() => {
    if (wasPasted && !isLoading && suggestions.length === 1 && suggestions[0].type === 'address') {
      // Small delay to ensure UI is ready
      const timer = setTimeout(() => {
        handleSelect(suggestions[0]);
        setWasPasted(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [wasPasted, isLoading, suggestions]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSuggestions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setShowSuggestions(true);
    setSelectedIndex(-1);
    // Reset hasSearched when user starts typing again
    if (e.target.value.length < 2) {
      setHasSearched(false);
    }
  };
  
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    // Mark that a paste occurred - will be used to auto-select single results
    setWasPasted(true);
  };

  const handleSelect = (suggestion: AutocompleteResult) => {
    setQuery(suggestion.display);
    setShowSuggestions(false);
    setSuggestions([]);
    
    // For addresses with a ZIP code from autocomplete, include it in the value
    // Format: "address|zipCode" so the API can use the ZIP directly
    if (suggestion.type === 'address' && suggestion.zipCode) {
      onSelect(`${suggestion.value}|${suggestion.zipCode}`, suggestion.type);
    } else {
      // For other types, pass the value as-is
      onSelect(suggestion.value, suggestion.type);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      handleSelect(suggestions[selectedIndex]);
    } else if (query.trim()) {
      const trimmed = query.trim();
      
      // Try to extract ZIP code from address string (e.g., "123 Main St, City, ST 12345")
      const zipMatch = trimmed.match(/\b(\d{5})(-\d{4})?\b/);
      if (zipMatch) {
        // Found a ZIP code in the string - use it directly
        onSelect(zipMatch[1], 'zip');
        return;
      }
      
      // Check if it's a "city, state" or "county, state" format
      const cityStateMatch = trimmed.match(/^(.+?),\s*([A-Z]{2})$/i);
      if (cityStateMatch) {
        const [, location, state] = cityStateMatch;
        // Try to determine if it's a city or county by checking if it ends with "County"
        if (location.toLowerCase().includes('county')) {
          onSelect(trimmed, 'county');
        } else {
          onSelect(trimmed, 'city');
        }
      } else if (/^\d{5}(-\d{4})?$/.test(trimmed)) {
        // It's a ZIP code
        onSelect(trimmed.replace(/-\d{4}$/, ''), 'zip');
      } else {
        // Treat as address if no specific format detected
        onSelect(trimmed, 'address');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            placeholder="Enter ZIP code, city, county, or address..."
            className={`w-full px-4 py-3.5 text-base bg-white border border-[#e5e5e5] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a0a0a] focus:border-[#0a0a0a] transition-all placeholder:text-[#a3a3a3] text-[#0a0a0a] ${
              isLoading ? 'pr-10' : ''
            }`}
          />
          {isLoading && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#0a0a0a] border-t-transparent"></div>
            </div>
          )}
        </div>
      </form>

      {showSuggestions && (
        <div className="absolute z-10 w-full mt-1.5 bg-white border border-[#e5e5e5] rounded-lg shadow-lg overflow-hidden">
          {suggestions.length > 0 ? (
            <div className="max-h-64 overflow-y-auto custom-scrollbar">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.type}-${suggestion.value}-${index}`}
                  type="button"
                  onClick={() => handleSelect(suggestion)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-[#fafafa] focus:bg-[#fafafa] focus:outline-none transition-colors ${
                    index === selectedIndex ? 'bg-[#fafafa]' : ''
                  } ${index > 0 ? 'border-t border-[#e5e5e5]' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`font-medium text-[#0a0a0a] text-sm flex-1 min-w-0 ${
                      suggestion.type === 'address' ? 'font-semibold' : ''
                    }`}>
                      {suggestion.display}
                    </span>
                    <span className={`text-xs uppercase px-2 py-0.5 rounded font-medium shrink-0 ${
                      suggestion.type === 'address' 
                        ? 'text-[#0a0a0a] bg-[#e5e5e5]' 
                        : suggestion.type === 'zip'
                        ? 'text-[#7c3aed] bg-[#faf5ff]'
                        : suggestion.type === 'city'
                        ? 'text-[#2563eb] bg-[#eff6ff]'
                        : 'text-[#4f46e5] bg-[#eef2ff]'
                    }`}>
                      {suggestion.type === 'address' ? '📍' : suggestion.type}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            !isLoading && hasSearched && query.length >= 2 && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-[#525252] font-medium mb-1">No results found</p>
                <p className="text-xs text-[#737373]">Try a different search term</p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}


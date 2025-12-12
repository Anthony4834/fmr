'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
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

function normalizeLoose(s: string) {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .toLowerCase();
}

function normalizeForMatch(s: string) {
  // More forgiving normalization for user-typed addresses vs provider formatting
  // (e.g. missing commas, extra state words, etc.)
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripCountyWord(s: string) {
  return s.replace(/\bcounty\b/gi, '').replace(/\s+/g, ' ').trim();
}

function ensureCountySuffix(countyName: string) {
  const trimmed = countyName.trim();
  if (!trimmed) return trimmed;
  return /\bcounty\b/i.test(trimmed) ? trimmed.replace(/\s+county\b/i, ' County') : `${trimmed} County`;
}

function parseLocationCommaState(input: string): { location: string; state: string } | null {
  const m = input.trim().match(/^(.+?),\s*([A-Z]{2})$/i);
  if (!m) return null;
  return { location: m[1].trim(), state: m[2].trim().toUpperCase() };
}

function looksLikeZip(input: string) {
  return /^\d{5}(-\d{4})?$/.test(input.trim());
}

function extractZipFromText(input: string) {
  const m = input.match(/\b(\d{5})(-\d{4})?\b/);
  return m?.[1] || null;
}

function extractHouseNumber(input: string) {
  const m = input.trim().match(/^(\d{1,8})\b/);
  return m?.[1] || null;
}

function looksLikeAddress(input: string) {
  const q = input.trim();
  return (
    /\d/.test(q) &&
    (q.length > 5 ||
      /\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|blvd|boulevard|way|circle|ct|court|pl|place)\b/i.test(q))
  );
}

function suggestionMatchesInput(suggestion: AutocompleteResult, input: string) {
  // For addresses, prefer numeric matching (more reliable than string matching
  // when providers expand abbreviations like "WA" -> "Washington", "S" -> "South").
  if (suggestion.type === 'address') {
    const inputZip = extractZipFromText(input);
    const suggestionZip = suggestion.zipCode || extractZipFromText(suggestion.display) || extractZipFromText(suggestion.value);
    const inputHouse = extractHouseNumber(input);
    const suggestionHouse = extractHouseNumber(suggestion.display) || extractHouseNumber(suggestion.value);

    if (inputHouse && suggestionHouse && inputHouse === suggestionHouse) {
      if (inputZip && suggestionZip) {
        return inputZip === suggestionZip;
      }
      // If no ZIP present, house number match is still a strong signal
      return true;
    }
  }

  const q = normalizeForMatch(input);
  if (q.length < 5) return false;
  const a = normalizeForMatch(suggestion.display);
  const b = normalizeForMatch(suggestion.value);
  // Strong-enough match, but tolerant of punctuation differences
  return a === q || b === q || a.startsWith(q) || b.startsWith(q) || a.includes(q) || b.includes(q);
}

export default function SearchInput({ onSelect }: SearchInputProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompleteResult[]>([]);
  const [suggestionsForQuery, setSuggestionsForQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [completedQuery, setCompletedQuery] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef<string>('');
  const autocompleteAbortRef = useRef<AbortController | null>(null);
  const autocompleteRequestIdRef = useRef(0);
  const autoSelectTimerRef = useRef<number | null>(null);

  const fetchSuggestions = useDebouncedCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setSuggestions([]);
      setSuggestionsForQuery(searchQuery);
      setIsLoading(false);
      setCompletedQuery('');
      return;
    }

    setIsLoading(true);

    // Cancel any in-flight autocomplete request (prevents stale responses)
    if (autocompleteAbortRef.current) {
      autocompleteAbortRef.current.abort();
    }
    const abortController = new AbortController();
    autocompleteAbortRef.current = abortController;
    const requestId = ++autocompleteRequestIdRef.current;

    try {
      const addressy = looksLikeAddress(searchQuery);

      // Fetch both regular autocomplete and address autocomplete in parallel
      const [regularResponse, addressResponse] = await Promise.all([
        fetch(`/api/search/autocomplete?q=${encodeURIComponent(searchQuery)}`, { signal: abortController.signal }).catch(() => ({ json: () => ({ results: [] }) })),
        addressy || searchQuery.length >= 3
          ? fetch(`/api/search/address-autocomplete?q=${encodeURIComponent(searchQuery)}`, { signal: abortController.signal }).catch(() => ({ json: () => ({ results: [] }) }))
          : Promise.resolve({ json: () => ({ results: [] }) })
      ]);

      const regularData = await regularResponse.json();
      const addressData = await addressResponse.json();

      if (abortController.signal.aborted || requestId !== autocompleteRequestIdRef.current) {
        return;
      }

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
      const combined = [...addressResults, ...regularResults].slice(0, 10);
      setSuggestions(combined);
      setSuggestionsForQuery(searchQuery);
      setCompletedQuery(searchQuery); // only for this exact query
    } catch (error) {
      // If aborted, silently ignore
      if (autocompleteAbortRef.current?.signal.aborted) {
        return;
      }
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
      setSuggestionsForQuery(searchQuery);
      setCompletedQuery(searchQuery);
    } finally {
      // Only end loading for the latest request
      if (!abortController.signal.aborted && requestId === autocompleteRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, 220);
  
  useEffect(() => {
    queryRef.current = query;
    fetchSuggestions(query);
  }, [query, fetchSuggestions]);

  // Autofocus on initial load
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  // Type-to-focus: if the user starts typing anywhere, focus search and keep the first keystroke
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        !!target?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select';
      if (isEditable) return;

      const input = inputRef.current;
      if (!input) return;

      // Ignore navigation keys; handle Backspace and printable characters
      if (e.key === 'Backspace') {
        e.preventDefault();
        input.focus();
        setQuery(prev => prev.slice(0, -1));
        setShowSuggestions(true);
        setSelectedIndex(-1);
        setCompletedQuery('');
        return;
      }

      if (e.key.length === 1) {
        e.preventDefault();
        input.focus();
        setQuery(prev => prev + e.key);
        setShowSuggestions(true);
        setSelectedIndex(-1);
        setCompletedQuery('');
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);
  
  useEffect(() => {
    return () => {
      if (autocompleteAbortRef.current) {
        autocompleteAbortRef.current.abort();
      }
      if (autoSelectTimerRef.current) {
        window.clearTimeout(autoSelectTimerRef.current);
      }
    };
  }, []);

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
    const next = e.target.value;
    setQuery(next);
    setShowSuggestions(true);
    setSelectedIndex(-1);
    // Clear "completed" marker so we don't show an empty-state while debounced request hasn't fired
    setCompletedQuery('');
    if (autoSelectTimerRef.current) {
      window.clearTimeout(autoSelectTimerRef.current);
    }
  };
  
  const handleSelect = (suggestion: AutocompleteResult) => {
    setQuery(suggestion.display);
    setShowSuggestions(false);
    setSuggestions([]);
    setSuggestionsForQuery('');
    
    // For addresses with a ZIP code from autocomplete, include it in the value
    // Format: "address|zipCode" so the API can use the ZIP directly
    if (suggestion.type === 'address' && suggestion.zipCode) {
      onSelect(`${suggestion.value}|${suggestion.zipCode}`, suggestion.type);
    } else {
      // For other types, pass the value as-is
      onSelect(suggestion.value, suggestion.type);
    }
  };

  const resolveCityOrCountyFromApi = async (input: string): Promise<{ value: string; type: 'city' | 'county' } | null> => {
    const parsed = parseLocationCommaState(input);
    if (!parsed) return null;
    const { location, state } = parsed;
    const normalizedLocationBase = normalizeLoose(stripCountyWord(location));
    const full = `${location}, ${state}`;

    const tryType = async (type: 'city' | 'county') => {
      const res = await fetch(`/api/search/autocomplete?q=${encodeURIComponent(full)}&type=${type}`);
      const data = await res.json();
      const results: AutocompleteResult[] = data.results || [];
      if (results.length === 0) return null;
      // Pick the first result that matches the base name strongly
      const match = results.find(r => normalizeLoose(stripCountyWord(r.display.split(',')[0] || '')) === normalizedLocationBase) || results[0];
      if (!match) return null;
      return { value: match.value, type };
    };

    // County first so "<county>, <state>" works reliably
    const county = await tryType('county');
    if (county && normalizeLoose(stripCountyWord(county.value.split(',')[0] || '')) === normalizedLocationBase) {
      return county;
    }
    const city = await tryType('city');
    if (city && normalizeLoose(city.value.split(',')[0] || '') === normalizedLocationBase) {
      return city;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (selectedIndex >= 0 && suggestions[selectedIndex]) {
      handleSelect(suggestions[selectedIndex]);
    } else if (query.trim()) {
      const trimmed = query.trim();
      
      // Try to extract ZIP code from address string (e.g., "123 Main St, City, ST 12345")
      const zipFromText = extractZipFromText(trimmed);
      if (zipFromText) {
        // Found a ZIP code in the string - use it directly
        onSelect(zipFromText, 'zip');
        return;
      }
      
      // Check if it's a "city, state" or "county, state" format
      const parsed = parseLocationCommaState(trimmed);
      if (parsed) {
        const { location, state } = parsed;

        // If user typed "X County, ST" (any casing), normalize to "X County, ST"
        if (/\bcounty\b/i.test(location)) {
          const countyName = ensureCountySuffix(stripCountyWord(location));
          onSelect(`${countyName}, ${state}`, 'county');
          return;
        }

        // Otherwise, resolve city vs county via API (county-first)
        setIsSubmitting(true);
        try {
          const resolved = await resolveCityOrCountyFromApi(`${location}, ${state}`);
          if (resolved) {
            if (resolved.type === 'county') {
              const countyName = ensureCountySuffix(stripCountyWord(resolved.value.split(',')[0] || location));
              onSelect(`${countyName}, ${state}`, 'county');
            } else {
              onSelect(`${location}, ${state}`, 'city');
            }
            return;
          }

          // Fallback: if nothing matches, treat as city (most intuitive)
          onSelect(`${location}, ${state}`, 'city');
        } finally {
          setIsSubmitting(false);
        }
      } else if (looksLikeZip(trimmed)) {
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

  const displayedSuggestions = useMemo(() => {
    // Only show suggestions that correspond to the current input, to avoid stale flashes
    if (normalizeLoose(suggestionsForQuery) !== normalizeLoose(query)) return [];
    return suggestions;
  }, [suggestions, suggestionsForQuery, query]);

  // Auto-submit: if there's exactly one address suggestion and it matches the current input
  // (must be based on rendered suggestion state to avoid timing/staleness issues)
  useEffect(() => {
    if (!showSuggestions) return;
    if (isLoading || isSubmitting) return;
    if (query.trim().length < 3) return;
    if (normalizeLoose(completedQuery) !== normalizeLoose(query)) return;
    if (displayedSuggestions.length !== 1) return;

    const only = displayedSuggestions[0];
    if (!only || only.type !== 'address') return;
    // Keep it simple:
    // - only auto-submit for address-like inputs
    // - only when we have exactly one address suggestion for the *current* query
    // - light sanity check: if a house number exists in input, it must appear in suggestion text
    if (!looksLikeAddress(query)) return;
    const hn = extractHouseNumber(query);
    if (hn) {
      const hay = `${only.display} ${only.value}`.toLowerCase();
      if (!hay.includes(hn)) return;
    }

    if (autoSelectTimerRef.current) {
      window.clearTimeout(autoSelectTimerRef.current);
    }
    autoSelectTimerRef.current = window.setTimeout(() => {
      // Re-check staleness right before selecting
      const liveValue = inputRef.current?.value ?? '';
      if (normalizeLoose(liveValue) !== normalizeLoose(query)) return;
      handleSelect(only);
    }, 140);

    return () => {
      if (autoSelectTimerRef.current) {
        window.clearTimeout(autoSelectTimerRef.current);
      }
    };
  }, [completedQuery, displayedSuggestions, isLoading, isSubmitting, query, showSuggestions]);

  const showEmptyState =
    !isLoading &&
    query.trim().length >= 2 &&
    normalizeLoose(completedQuery) === normalizeLoose(query) &&
    displayedSuggestions.length === 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#737373]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M21 21l-4.35-4.35"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            ref={inputRef}
            placeholder="Search ZIP, city, county, or address…"
            className={`w-full pl-10 pr-24 py-3.5 text-[15px] bg-white border border-[#e5e5e5] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#d4d4d4] focus:border-[#0a0a0a] transition-all placeholder:text-[#a3a3a3] text-[#0a0a0a] shadow-sm hover:shadow ${
              isLoading || isSubmitting ? 'pr-24' : 'pr-16'
            }`}
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
          />
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {(isLoading || isSubmitting) && (
              <div className="pointer-events-none mr-1.5">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#0a0a0a] border-t-transparent"></div>
              </div>
            )}
            {query.trim().length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSuggestions([]);
                  setSuggestionsForQuery('');
                  setCompletedQuery('');
                  setSelectedIndex(-1);
                  inputRef.current?.focus();
                }}
                className="h-9 px-3 text-xs font-semibold rounded-lg border border-[#e5e5e5] bg-white text-[#0a0a0a] hover:bg-[#fafafa] transition-colors"
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              className="h-9 px-4 text-xs font-semibold rounded-lg bg-[#0a0a0a] text-white hover:opacity-90 transition-opacity"
            >
              Search
            </button>
          </div>
        </div>
      </form>

      {showSuggestions && (
        <div className="absolute z-10 w-full mt-2 bg-white border border-[#e5e5e5] rounded-xl shadow-lg overflow-hidden">
          {isLoading && query.trim().length >= 2 && displayedSuggestions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-[#525252]">
              Searching…
            </div>
          ) : displayedSuggestions.length > 0 ? (
            <div className="max-h-72 overflow-y-auto custom-scrollbar">
              {displayedSuggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion.type}-${suggestion.value}-${index}`}
                  type="button"
                  onClick={() => handleSelect(suggestion)}
                  className={`w-full text-left px-4 py-3 hover:bg-[#fafafa] focus:bg-[#fafafa] focus:outline-none transition-colors ${
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
                      {suggestion.type === 'address' ? 'Address' : suggestion.type}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            showEmptyState && (
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


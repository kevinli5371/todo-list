import { useState, useEffect, useRef } from 'react';

const API_URL = 'http://localhost:8000';
const DEBOUNCE_MS = 2000;

/**
 * Sends todos to the FastAPI classification server and returns a Map of
 * id -> { category, importance, reasoning }.
 * Gracefully handles the server being offline — the app works fine without it.
 */
export const useClassify = (todos) => {
  const [classifications, setClassifications] = useState(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const activeTodos = todos.filter((t) => t.text.trim());
    if (activeTodos.length === 0) {
      setClassifications(new Map());
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/classify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ todos: activeTodos }),
          signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        const data = await res.json();
        const map = new Map();
        data.results.forEach((r) => map.set(r.id, r));
        setClassifications(map);
      } catch (err) {
        // Don't surface network errors as UI errors — server is optional
        if (err.name !== 'AbortError' && !err.message.includes('fetch')) {
          setError(err.message);
        }
        console.warn('Classification server unavailable:', err.message);
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [todos]);

  return { classifications, isLoading, error };
};

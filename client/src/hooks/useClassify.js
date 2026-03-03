import { useState, useEffect, useRef } from 'react';

const API_URL = 'http://localhost:8000';
const DEBOUNCE_MS = 1500;

// Fingerprint covers only the fields that affect classification (not x/y/completed/timestamp)
const fingerprint = (t) => `${t.text.trim()}|${t.dueDate ?? ''}|${t.repeat ?? ''}`;

/**
 * Classifies todos via the FastAPI server.
 * - Debounces calls so rapid edits/drags don't spam the server.
 * - Only re-sends todos whose text/date/repeat actually changed.
 * - Results are kept in React state (never a stale ref), so a page refresh
 *   always triggers a clean re-classification.
 */
export const useClassify = (todos) => {
  const [classifications, setClassifications] = useState(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef(null);
  // Track fingerprints of what's currently classified to skip unchanged todos
  const lastFingerprints = useRef(new Map()); // id -> fingerprint

  useEffect(() => {
    const activeTodos = todos.filter((t) => t.text.trim());

    if (activeTodos.length === 0) {
      lastFingerprints.current.clear();
      setClassifications(new Map());
      return;
    }

    // Evict deleted todos from fingerprint tracking
    const activeIds = new Set(activeTodos.map((t) => t.id));
    lastFingerprints.current.forEach((_, id) => {
      if (!activeIds.has(id)) lastFingerprints.current.delete(id);
    });

    // Only re-classify todos whose content changed since the last successful call
    const changed = activeTodos.filter(
      (t) => lastFingerprints.current.get(t.id) !== fingerprint(t)
    );
    if (changed.length === 0) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/classify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ todos: changed }),
          signal: AbortSignal.timeout(60000),
        });

        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        const data = await res.json();

        // Mark these todos as up-to-date
        changed.forEach((t) => lastFingerprints.current.set(t.id, fingerprint(t)));

        // Merge new results into existing classifications state
        setClassifications((prev) => {
          const next = new Map(prev);
          data.results.forEach((r) => next.set(r.id, r));
          // Remove entries for todos that no longer exist
          next.forEach((_, id) => { if (!activeIds.has(id)) next.delete(id); });
          // Apply global ranks across all classified todos
          const sorted = [...next.values()].sort((a, b) => b.importance - a.importance);
          sorted.forEach((item, i) => { item.rank = i + 1; });
          return next;
        });
      } catch (err) {
        console.warn('Classification server unavailable:', err.message);
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [todos]);

  return { classifications, isLoading };
};

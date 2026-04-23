import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/api/client';

// 1.5s debounce: fast enough to feel "live" as the author types, slow enough to
// coalesce bursts of keystrokes into a single round-trip. Mirrors the cadence
// the author tends to pause at between fields / list entries.
const DEBOUNCE_MS = 1500;

/**
 * Autosave hook. Watches `dirty` and, while dirty, schedules a debounced PUT
 * against the resume endpoint. Reruns the debounce timer on every state change,
 * so rapid typing never races — only the last state hits the server.
 *
 * On ETag conflict (412) it calls `onStale` so the Edit page can refetch + rehydrate.
 * A manual flush — e.g. a ⌘S shortcut — can call `flushNow()` to bypass the debounce.
 *
 * @param {object} p
 * @param {string} p.resumeId
 * @param {object} p.resume       the current resume in state (from useReducer)
 * @param {string} p.etag         the last known etag
 * @param {boolean} p.dirty       true iff local state has unsaved changes
 * @param {(etag: string) => void} p.onSaved  called on 200; should dispatch `actions.saved(etag)`
 * @param {() => Promise<void>}   p.onStale   called on 412; should refetch + rehydrate the reducer
 */
export const useAutosave = ({ resumeId, resume, etag, dirty, onSaved, onStale }) => {
  const [status, setStatus] = useState('idle'); // 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  const [savedAt, setSavedAt] = useState(null);

  const timerRef = useRef(null);
  // Hold the latest state in a ref so `flushNow` can read it without being
  // recreated on every keystroke (which would retrigger the keybind listener).
  const latestRef = useRef({ resume, etag });
  useEffect(() => { latestRef.current = { resume, etag }; }, [resume, etag]);

  // `override` lets callers pass a freshly-computed {resume, etag} when they can't rely
  // on React having committed a pending dispatch yet (PhotoUpload's photoKey race).
  const performSave = useCallback(async (override) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const { resume: r, etag: e } = override ?? latestRef.current;
    setStatus('saving');
    try {
      const { etag: newEtag } = await api.putResume(resumeId, r, e);
      onSaved(newEtag);
      setStatus('saved');
      setSavedAt(Date.now());
    } catch (err) {
      // 412 = someone else (or another tab) wrote first. Silently refetch — we
      // can't merge graph-shaped state — and warn the user so they know to expect
      // the page to reload under them.
      if (err instanceof ApiError && err.status === 412) {
        toast.warning('Your copy was stale — reloaded');
        await onStale();
        setStatus('idle');
      } else {
        console.error('autosave failed', err);
        setStatus('error');
      }
    }
  }, [resumeId, onSaved, onStale]);

  // Schedule a debounced save whenever state changes while dirty. Cleanup clears
  // the pending timer on every rerun, so rapid edits naturally coalesce.
  useEffect(() => {
    if (!dirty) return undefined;
    setStatus('pending');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(performSave, DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [dirty, resume, performSave]);

  return { status, savedAt, flushNow: performSave };
};

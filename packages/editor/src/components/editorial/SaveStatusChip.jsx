import { useEffect, useState } from 'react';
import MetaChip from './MetaChip';

// Human-readable "time since" without pulling in dayjs's relativeTime plugin.
// Granularity matches human perception: "just now" for <10s, seconds up to a minute,
// then minutes up to an hour, then settles on "a while ago" for the rare case where
// the user has left the tab idle.
const relativeTime = (ms) => {
  if (!ms) return '';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 10)   return 'just now';
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return 'a while ago';
};

/**
 * Header chip that reflects the autosave state.
 *
 *   status ∈ 'idle' | 'pending' | 'saving' | 'saved' | 'error'
 *   savedAt: epoch ms of the last successful save (drives "Saved · 2s ago")
 *   onRetry: called when the chip is clicked while in 'error' state
 */
const SaveStatusChip = ({ status, savedAt, onRetry }) => {
  // Tick the component every 15s while in 'saved' state so the "Ns ago" label
  // stays fresh without re-rendering the whole editor on every second.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== 'saved') return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, [status, savedAt]);

  if (status === 'pending') return <MetaChip>Unsaved</MetaChip>;
  if (status === 'saving')  return <MetaChip tone="ink">Saving…</MetaChip>;
  if (status === 'saved')   return <MetaChip>Saved · {relativeTime(savedAt)}</MetaChip>;
  if (status === 'error') {
    return (
      <button type="button" onClick={onRetry} className="focus-visible:outline-none">
        <MetaChip tone="live">Error · retry</MetaChip>
      </button>
    );
  }
  return null;
};

export default SaveStatusChip;

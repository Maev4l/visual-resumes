// packages/editor/src/editor/useBroadcastPreview.js
// Publishes the current resume state + photoDataUri over a named BroadcastChannel
// whenever either changes, so the standalone /preview/:id window can re-render live
// without polling or refetching. Subscribers use the same channel name.
//
// Why BroadcastChannel: works same-origin across tabs/windows, zero setup, tiny API.
// We debounce to 60ms so a rapid typist doesn't flood the channel mid-keystroke.
import { useEffect, useRef } from 'react';

export const PREVIEW_CHANNEL = 'visual-resumes-preview';

export const useBroadcastPreview = ({ resumeId, resume, photoDataUri }) => {
  const channelRef = useRef(null);

  useEffect(() => {
    const ch = new BroadcastChannel(PREVIEW_CHANNEL);
    channelRef.current = ch;

    // If a preview window is already open when the edit page mounts, it may have
    // joined the channel before us — emit the initial state so it rehydrates.
    return () => { ch.close(); channelRef.current = null; };
  }, []);

  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const handle = setTimeout(() => {
      ch.postMessage({ type: 'state', resumeId, resume, photoDataUri });
    }, 60);
    return () => clearTimeout(handle);
  }, [resumeId, resume, photoDataUri]);

  // Expose a manual trigger for cases like "preview window just opened and asked
  // for state" — the preview page posts a `request` message and the editor replies.
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const onMessage = ({ data }) => {
      if (data?.type === 'request' && data.resumeId === resumeId) {
        ch.postMessage({ type: 'state', resumeId, resume, photoDataUri });
      }
    };
    ch.addEventListener('message', onMessage);
    return () => ch.removeEventListener('message', onMessage);
  }, [resumeId, resume, photoDataUri]);
};

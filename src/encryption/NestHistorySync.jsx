import { useEffect, useRef } from 'react';
import { shareNestHistory } from './client';
import { useEncryption } from './EncryptionGate';

export default function NestHistorySync({version}) {
  const {enabled} = useEncryption();
  const sync = useRef(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    sync.current = () => {
      if (document.visibilityState === 'visible') shareNestHistory(() => active).catch(() => {});
    };
    const timer = setInterval(sync.current, 15000);
    document.addEventListener('visibilitychange', sync.current);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', sync.current);
      sync.current = null;
    };
  }, [enabled]);
  useEffect(() => { sync.current?.(); }, [enabled, version]);
  return null;
}

import { focusManager, onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/** Manual-data screens follow the same reconnect/resume behavior as queries. */
export default function useBackgroundRefresh() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => {
      if (onlineManager.isOnline() && focusManager.isFocused()) setRevision(value => value + 1);
    };
    const online = onlineManager.subscribe(refresh);
    const focus = focusManager.subscribe(refresh);
    return () => { online(); focus(); };
  }, []);
  return revision;
}

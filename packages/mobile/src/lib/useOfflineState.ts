import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import { useAuth } from '@/context/AuthContext';

export default function useOfflineState<T>(key: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const { user } = useAuth();
  const client = useQueryClient();
  const queryKey = ['offline-state', user?.id, key];
  const { data } = useQuery<T>({ queryKey, enabled: false, initialData: fallback, initialDataUpdatedAt: 0 });
  const setValue: Dispatch<SetStateAction<T>> = update => {
    client.setQueryData<T>(queryKey, previous => typeof update === 'function'
      ? (update as (value: T) => T)(previous ?? fallback) : update);
  };
  return [data ?? fallback, setValue];
}

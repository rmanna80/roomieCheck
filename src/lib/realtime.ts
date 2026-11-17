import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { invalidateHousehold, keys } from './queries';
import { supabase } from './supabase';

const HOUSEHOLD_TABLES = [
  'signals', 'signal_responses', 'signal_comments', 'run_items', 'space_windows', 'space_window_approvals',
  'reset_tasks', 'member_statuses', 'chores', 'events',
] as const;

/**
 * One channel per household. Supabase Realtime checks RLS for each subscriber, so you only
 * receive changes you could have read anyway. Events just invalidate queries (debounced) —
 * the next fetch goes through the normal RLS-protected read path.
 */
export function useHouseholdRealtime(householdId: string | null, userId: string | null) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!householdId || !userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void invalidateHousehold(qc, householdId);
      }, 250);
    };

    let channel = supabase.channel(`household:${householdId}`);
    for (const table of HOUSEHOLD_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` }, refresh);
    }
    channel = channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      () => void qc.invalidateQueries({ queryKey: keys.inbox(userId) }),
    );
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [householdId, userId, qc]);
}

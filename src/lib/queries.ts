/**
 * TanStack Query hooks. Keys are scoped by household so a realtime event or a mutation can
 * refresh exactly one home's data.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { Signal, SignalDetail, UUID } from '../types/domain';
import * as api from './api';
import { addMinutes } from './time';

export const keys = {
  profile: (uid: UUID) => ['profile', uid] as const,
  households: (uid: UUID) => ['households', uid] as const,
  members: (hid: UUID) => ['members', hid] as const,
  spaces: (hid: UUID) => ['spaces', hid] as const,
  windows: (hid: UUID) => ['windows', hid] as const,
  feed: (hid: UUID) => ['feed', hid] as const,
  signal: (id: UUID) => ['signal', id] as const,
  statuses: (hid: UUID) => ['statuses', hid] as const,
  chores: (hid: UUID) => ['chores', hid] as const,
  choreHistory: (id: UUID) => ['chore-history', id] as const,
  swaps: (hid: UUID) => ['swaps', hid] as const,
  events: (hid: UUID) => ['events', hid] as const,
  inbox: (uid: UUID) => ['inbox', uid] as const,
  prefs: (uid: UUID) => ['prefs', uid] as const,
  statusSharing: (uid: UUID) => ['status-sharing', uid] as const,
  invite: (hid: UUID) => ['invite', hid] as const,
};

/** Refreshes everything belonging to one household, plus signal details and the inbox. */
export function invalidateHousehold(qc: QueryClient, hid: UUID | null | undefined) {
  return qc.invalidateQueries({
    predicate: (q) => {
      const [scope, id] = q.queryKey as [string, string];
      return (hid != null && id === hid) || scope === 'signal' || scope === 'inbox' || scope === 'chore-history';
    },
  });
}

const enabled = (...ids: (string | null | undefined)[]) => ids.every(Boolean);

export const useProfile = (uid: UUID | null) =>
  useQuery({ queryKey: keys.profile(uid ?? ''), queryFn: () => api.getProfile(uid!), enabled: enabled(uid) });

export const useMyHouseholds = (uid: UUID | null) =>
  useQuery({ queryKey: keys.households(uid ?? ''), queryFn: () => api.getMyHouseholds(uid!), enabled: enabled(uid) });

export const useMembers = (hid: UUID | null) =>
  useQuery({ queryKey: keys.members(hid ?? ''), queryFn: () => api.getMembers(hid!), enabled: enabled(hid), staleTime: 60_000 });

export const useSpaces = (hid: UUID | null) =>
  useQuery({ queryKey: keys.spaces(hid ?? ''), queryFn: () => api.getSpaces(hid!), enabled: enabled(hid), staleTime: 60_000 });

export const useAgreedWindows = (hid: UUID | null) =>
  useQuery({
    queryKey: keys.windows(hid ?? ''),
    queryFn: () => api.getAgreedWindows(hid!, new Date().toISOString(), addMinutes(new Date(), 7 * 24 * 60).toISOString()),
    enabled: enabled(hid),
  });

export const useFeed = (hid: UUID | null) =>
  useQuery({ queryKey: keys.feed(hid ?? ''), queryFn: () => api.getFeed(hid!), enabled: enabled(hid), refetchInterval: 60_000 });

export const useSignal = (id: UUID | null) =>
  useQuery({ queryKey: keys.signal(id ?? ''), queryFn: () => api.getSignal(id!), enabled: enabled(id) });

export const useStatuses = (hid: UUID | null) =>
  useQuery({ queryKey: keys.statuses(hid ?? ''), queryFn: () => api.getStatuses(hid!), enabled: enabled(hid), refetchInterval: 120_000 });

export const useChores = (hid: UUID | null) =>
  useQuery({ queryKey: keys.chores(hid ?? ''), queryFn: () => api.getChores(hid!), enabled: enabled(hid) });

export const useChoreHistory = (id: UUID | null) =>
  useQuery({ queryKey: keys.choreHistory(id ?? ''), queryFn: () => api.getChoreHistory(id!), enabled: enabled(id) });

export const useSwaps = (hid: UUID | null) =>
  useQuery({ queryKey: keys.swaps(hid ?? ''), queryFn: () => api.getMySwaps(hid!), enabled: enabled(hid) });

export const useEvents = (hid: UUID | null) =>
  useQuery({
    queryKey: keys.events(hid ?? ''),
    queryFn: () => api.getEvents(hid!, addMinutes(new Date(), -180).toISOString(), addMinutes(new Date(), 14 * 24 * 60).toISOString()),
    enabled: enabled(hid),
  });

export const useInbox = (uid: UUID | null) =>
  useQuery({ queryKey: keys.inbox(uid ?? ''), queryFn: () => api.getInbox(), enabled: enabled(uid) });

export const useNotificationPrefs = (uid: UUID | null) =>
  useQuery({ queryKey: keys.prefs(uid ?? ''), queryFn: () => api.getNotificationPrefs(uid!), enabled: enabled(uid) });

export const useStatusSharing = (uid: UUID | null) =>
  useQuery({ queryKey: keys.statusSharing(uid ?? ''), queryFn: () => api.getStatusSharing(uid!), enabled: enabled(uid) });

export const useInvite = (hid: UUID | null) =>
  useQuery({ queryKey: keys.invite(hid ?? ''), queryFn: () => api.getInvite(hid!), enabled: enabled(hid) });

/**
 * One-tap response with optimistic update. The card shows your choice instantly; on failure it
 * rolls back and the caller shows a toast.
 */
export function useRespond(hid: UUID, me: UUID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { signalId: UUID; response: string | null; portions?: number | null }): Promise<void> => {
      if (v.response) await api.respondToSignal(v.signalId, v.response, v.portions);
      else await api.clearResponse(v.signalId);
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: keys.feed(hid) });
      const prevFeed = qc.getQueryData<Signal[]>(keys.feed(hid));
      const prevDetail = qc.getQueryData<SignalDetail | null>(keys.signal(v.signalId));
      const apply = <T extends Signal>(s: T): T => {
        if (s.id !== v.signalId) return s;
        const others = s.signal_responses.filter((r) => r.user_id !== me);
        const mine = v.response
          ? [{ signal_id: s.id, user_id: me, response: v.response, portions: v.portions ?? null, note: null, updated_at: new Date().toISOString() }]
          : [];
        return { ...s, signal_responses: [...others, ...mine] };
      };
      if (prevFeed) qc.setQueryData(keys.feed(hid), prevFeed.map(apply));
      if (prevDetail) qc.setQueryData(keys.signal(v.signalId), apply(prevDetail));
      return { prevFeed, prevDetail };
    },
    onError: (_e, v, ctx) => {
      if (ctx?.prevFeed) qc.setQueryData(keys.feed(hid), ctx.prevFeed);
      if (ctx?.prevDetail) qc.setQueryData(keys.signal(v.signalId), ctx.prevDetail);
    },
    onSettled: () => invalidateHousehold(qc, hid),
  });
}

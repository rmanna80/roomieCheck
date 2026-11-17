import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import type { MyHousehold } from '@/lib/api';
import { useHouseholdRealtime } from '@/lib/realtime';
import { useMembers, useMyHouseholds, useProfile } from '@/lib/queries';
import { prefsStorage } from '@/lib/secureStorage';
import { deviceTimeZone } from '@/lib/time';
import type { Household, Member, Profile } from '@/types/domain';

const ACTIVE_KEY = 'hp.activeHousehold';

interface HouseholdState {
  /** null until loaded, or when the user belongs to no household yet. */
  household: Household | null;
  households: MyHousehold[];
  isOwner: boolean;
  members: Member[];
  memberById: (id: string | null | undefined) => Member | undefined;
  nameOf: (id: string | null | undefined) => string;
  me: Profile | null;
  /** Viewer's display time zone. */
  timeZone: string;
  ready: boolean;
  setActive: (id: string) => void;
}

const HouseholdContext = createContext<HouseholdState | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const profile = useProfile(userId);
  const households = useMyHouseholds(userId);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    prefsStorage.getItem(ACTIVE_KEY).then((v) => {
      setActiveId(v);
      setRestored(true);
    });
  }, []);

  const list = useMemo(() => households.data ?? [], [households.data]);
  const current = list.find((h) => h.household.id === activeId) ?? list[0] ?? null;
  const hid = current?.household.id ?? null;
  const members = useMembers(hid);

  useHouseholdRealtime(hid, userId);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    void prefsStorage.setItem(ACTIVE_KEY, id);
  }, []);

  const value = useMemo<HouseholdState>(() => {
    const memberList = members.data ?? [];
    const memberById = (id: string | null | undefined) => memberList.find((m) => m.user_id === id);
    return {
      household: current?.household ?? null,
      households: list,
      isOwner: current?.role === 'owner',
      members: memberList,
      memberById,
      nameOf: (id) => {
        if (id && id === userId) return 'You';
        return memberById(id)?.profile.display_name || 'Former housemate';
      },
      me: profile.data ?? null,
      timeZone: profile.data?.time_zone && profile.data.time_zone !== 'UTC' ? profile.data.time_zone : deviceTimeZone(),
      ready: restored && !households.isLoading && !profile.isLoading,
      setActive,
    };
  }, [current, list, members.data, profile.data, profile.isLoading, households.isLoading, restored, setActive, userId]);

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdState {
  const h = useContext(HouseholdContext);
  if (!h) throw new Error('useHousehold must be used inside HouseholdProvider');
  return h;
}

/** For screens inside the (app) group, where a household is guaranteed. */
export function useActiveHousehold(): HouseholdState & { household: Household } {
  const h = useHousehold();
  if (!h.household) throw new Error('No active household');
  return h as HouseholdState & { household: Household };
}

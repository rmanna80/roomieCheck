/**
 * The Opportunity Window (light version): only reads statuses people *explicitly* shared as
 * "Up to hang out". No location, no inference, no history.
 */
import type { MemberStatus, UUID } from '../types/domain';

export interface Opportunity {
  people: UUID[];
  includesMe: boolean;
}

export function findOpportunity(statuses: MemberStatus[], me: UUID, now: Date = new Date()): Opportunity | null {
  const free = statuses
    .filter((s) => s.status === 'available' && new Date(s.expires_at).getTime() > now.getTime())
    .map((s) => s.user_id);
  const unique = [...new Set(free)];
  const others = unique.filter((u) => u !== me);
  if (others.length === 0 || unique.length < 2) return null;
  return { people: unique, includesMe: unique.includes(me) };
}

/**
 * The Signal vocabulary: per-kind labels, glyphs, responses, and pure helpers for lifecycle,
 * fuse, and response summaries. Response keys must match private.allowed_responses() in SQL.
 */
import type { Signal, SignalKind, SignalStatus, StatusKind, UUID } from '../types/domain';

export interface ResponseOption {
  key: string;
  label: string;
  /** Positive responses notify the creator; others never do. */
  positive: boolean;
}

export interface KindMeta {
  kind: SignalKind;
  label: string;
  /** MaterialCommunityIcons glyph name. */
  icon: string;
  blurb: string;
  responses: ResponseOption[];
}

export const KINDS: Record<SignalKind, KindMeta> = {
  food: {
    kind: 'food',
    label: 'Cooking',
    icon: 'pot-steam-outline',
    blurb: 'Making food — who’s in?',
    responses: [
      { key: 'in', label: 'I’m in', positive: true },
      { key: 'save_me', label: 'Save me some', positive: true },
      { key: 'not_tonight', label: 'Not tonight', positive: false },
    ],
  },
  leftovers: {
    kind: 'leftovers',
    label: 'Leftovers',
    icon: 'food-takeout-box-outline',
    blurb: 'Extra portions to share',
    responses: [],
  },
  run: {
    kind: 'run',
    label: 'Run',
    icon: 'cart-outline',
    blurb: 'Heading out — need anything?',
    responses: [
      { key: 'grab_me', label: 'Grab me something', positive: true },
      { key: 'coming', label: 'I’ll come', positive: true },
      { key: 'all_good', label: 'I’m good', positive: false },
    ],
  },
  space: {
    kind: 'space',
    label: 'Space',
    icon: 'sofa-outline',
    blurb: 'Ask for a shared room',
    responses: [],
  },
  reset: {
    kind: 'reset',
    label: 'Reset',
    icon: 'broom',
    blurb: 'A quick clean, together',
    responses: [
      { key: 'together', label: 'Clean together', positive: true },
      { key: 'handle_it', label: 'I’ll handle it', positive: true },
      { key: 'later', label: 'Later', positive: false },
    ],
  },
  spark: {
    kind: 'spark',
    label: 'Spark',
    icon: 'creation',
    blurb: 'Start a spontaneous plan',
    responses: [
      { key: 'in', label: 'I’m down', positive: true },
      { key: 'maybe', label: 'Maybe', positive: false },
      { key: 'cant', label: 'Can’t tonight', positive: false },
    ],
  },
  return: {
    kind: 'return',
    label: 'Heads up',
    icon: 'home-import-outline',
    blurb: 'Let people know when you’re back',
    responses: [{ key: 'got_it', label: 'Got it', positive: false }],
  },
  quiet: {
    kind: 'quiet',
    label: 'Quiet',
    icon: 'volume-low',
    blurb: 'Ask for a calm house',
    responses: [
      { key: 'sounds_good', label: 'Sounds good', positive: false },
      { key: 'adjust', label: 'Adjust time?', positive: true },
      { key: 'discuss', label: 'Let’s talk', positive: true },
    ],
  },
};

export const KIND_ORDER: SignalKind[] = ['food', 'run', 'spark', 'space', 'reset', 'leftovers', 'quiet', 'return'];

export function responseLabel(kind: SignalKind, key: string): string {
  if (key === 'claimed') return 'Claimed';
  return KINDS[kind].responses.find((r) => r.key === key)?.label ?? key;
}

/** Lifecycle as the client should display it: past-expiry is expired even before the job runs. */
export function effectiveStatus(s: Pick<Signal, 'status' | 'expires_at'>, now: Date = new Date()): SignalStatus {
  if ((s.status === 'active' || s.status === 'proposed') && new Date(s.expires_at).getTime() <= now.getTime()) {
    return 'expired';
  }
  return s.status;
}

export function isOpen(s: Pick<Signal, 'status' | 'expires_at'>, now: Date = new Date()): boolean {
  const st = effectiveStatus(s, now);
  return st === 'active' || st === 'proposed';
}

/** Fraction of the fuse remaining, 0..1. */
export function fuseRemaining(s: Pick<Signal, 'created_at' | 'expires_at'>, now: Date = new Date()): number {
  const start = new Date(s.created_at).getTime();
  const end = new Date(s.expires_at).getTime();
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (end - now.getTime()) / (end - start)));
}

export function myResponse(s: Pick<Signal, 'signal_responses'>, me: UUID): string | null {
  return s.signal_responses.find((r) => r.user_id === me)?.response ?? null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One-line, blame-free summary of where a signal stands. */
export function summarize(s: Signal): string {
  const by = (key: string) => s.signal_responses.filter((r) => r.response === key);
  switch (s.kind) {
    case 'food': {
      const ins = [...by('in'), ...by('save_me')];
      const portions = ins.reduce((sum, r) => sum + (r.portions ?? 1), 0);
      if (ins.length === 0) return 'No one yet';
      return `${plural(portions, 'portion')} · ${plural(ins.length, 'person', 'people')}`;
    }
    case 'leftovers': {
      const total = s.food_details?.portions_total ?? 0;
      const claimed = by('claimed').reduce((sum, r) => sum + (r.portions ?? 0), 0);
      const left = Math.max(total - claimed, 0);
      return left === 0 ? 'All claimed' : `${left} of ${total} left`;
    }
    case 'run': {
      const want = by('grab_me').length;
      const coming = by('coming').length;
      const bits = [];
      if (want) bits.push(`${want} want something`);
      if (coming) bits.push(`${coming} coming`);
      return bits.join(' · ') || 'No requests yet';
    }
    case 'spark': {
      const ins = by('in').length + 1;
      const min = s.sparks?.min_people ?? 2;
      if (s.status === 'active') return `It’s on · ${ins} in`;
      return `${ins} of ${min} needed`;
    }
    case 'reset': {
      const people = by('together').length + by('handle_it').length;
      return people ? `${plural(people, 'helper')}` : 'Join in';
    }
    case 'space': {
      const st = s.space_windows?.state;
      return st === 'agreed' ? 'Agreed' : st === 'pending' ? 'Waiting for OKs' : st ?? '';
    }
    case 'quiet': {
      const ok = by('sounds_good').length;
      return ok ? `${ok} OK` : '';
    }
    case 'return':
      return '';
  }
}

/** Feed order: signals waiting on me first, then soonest first. */
export function sortFeed<T extends Signal>(signals: T[], needsMe: (s: T) => boolean): T[] {
  const when = (s: T) => new Date(s.starts_at ?? s.created_at).getTime();
  return [...signals].sort((a, b) => {
    const na = needsMe(a) ? 0 : 1;
    const nb = needsMe(b) ? 0 : 1;
    return na - nb || when(a) - when(b);
  });
}

export const STATUS_OPTIONS: { key: StatusKind; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: 'home-variant-outline' },
  { key: 'out', label: 'Out', icon: 'walk' },
  { key: 'on_my_way', label: 'On my way', icon: 'map-marker-path' },
  { key: 'home_later', label: 'Home later', icon: 'weather-night' },
  { key: 'available', label: 'Up to hang out', icon: 'hand-wave-outline' },
  { key: 'studying', label: 'Studying', icon: 'book-open-variant' },
  { key: 'focus', label: 'Focus mode', icon: 'target' },
  { key: 'busy', label: 'Busy', icon: 'briefcase-outline' },
  { key: 'quiet_night', label: 'Quiet night', icon: 'candle' },
  { key: 'dnd', label: 'Do not disturb', icon: 'bell-sleep-outline' },
  { key: 'custom', label: 'Custom', icon: 'pencil-outline' },
];

export function statusLabel(status: StatusKind, custom?: string | null): string {
  if (status === 'custom') return custom || 'Custom';
  return STATUS_OPTIONS.find((o) => o.key === status)?.label ?? status;
}

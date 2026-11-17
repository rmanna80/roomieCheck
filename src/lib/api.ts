/**
 * All server access in one place. Reads go through PostgREST (RLS-constrained); writes go
 * through RPCs that enforce authorization and state on the server.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type {
  AppNotification, CalendarEvent, Chore, ChoreCompletion, ChoreSwap, Household, Invite, Member, MemberColor,
  MemberRole, MemberStatus, NotificationPreferences, Profile, RunItemStatus, Signal, SignalDetail,
  SignalKind, Space, SpaceConflict, SpaceKind, SpaceReason, SpaceWindow, StatusKind, StatusVisibility, UUID,
  ApprovalDecision,
} from '../types/domain';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

function unwrap<T>(res: { data: unknown; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new ApiError(res.error.message, res.error.code);
  return res.data as T;
}

async function rpc<T = void>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return unwrap<T>(await supabase.rpc(fn, args));
}

const SIGNAL_BASE =
  '*, signal_responses(*), food_details(portions_total, location), ' +
  'runs(run_type, destination, leaves_at, started_at, completed_at), ' +
  'space_windows(space_id, requested_by, starts_at, ends_at, reason, state, agreed_at), ' +
  'sparks(plan_at, min_people, became_plan_at), resets(minutes)';

const SIGNAL_SELECT = `${SIGNAL_BASE}, space_window_approvals(approver_id, decision)`;

const SIGNAL_DETAIL_SELECT =
  `${SIGNAL_BASE}, run_items(*), space_window_approvals(*), reset_tasks(*), signal_comments(*), signal_recipients(user_id)`;

// ---------------------------------------------------------------------------------------------
// Profile & settings
// ---------------------------------------------------------------------------------------------
export async function getProfile(uid: UUID): Promise<Profile> {
  return unwrap(await supabase.from('profiles').select('id, display_name, color, time_zone, onboarded_at').eq('id', uid).single());
}

export async function updateProfile(uid: UUID, patch: Partial<Pick<Profile, 'display_name' | 'color' | 'time_zone' | 'onboarded_at'>>) {
  unwrap(await supabase.from('profiles').update(patch).eq('id', uid));
}

export async function getStatusSharing(uid: UUID): Promise<boolean> {
  const row = unwrap<{ status_sharing_enabled: boolean }>(
    await supabase.from('user_settings').select('status_sharing_enabled').eq('user_id', uid).single(),
  );
  return row.status_sharing_enabled;
}

export const setStatusSharing = (enabled: boolean) => rpc('set_status_sharing', { p_enabled: enabled });

export async function getNotificationPrefs(uid: UUID): Promise<NotificationPreferences> {
  return unwrap(await supabase.from('notification_preferences').select('*').eq('user_id', uid).single());
}

export async function updateNotificationPrefs(uid: UUID, patch: Partial<Omit<NotificationPreferences, 'user_id'>>) {
  unwrap(await supabase.from('notification_preferences').update(patch).eq('user_id', uid));
}

export const exportMyData = () => rpc<Record<string, unknown>>('export_my_data');

export async function deleteMyAccount() {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) throw new ApiError(error.message);
  await supabase.auth.signOut();
}

export async function sendFeedback(message: string, householdId: UUID | null) {
  unwrap(
    await supabase.from('feedback').insert({
      message,
      household_id: householdId,
      app_version: Constants.expoConfig?.version ?? null,
      platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Households
// ---------------------------------------------------------------------------------------------
export interface MyHousehold {
  role: MemberRole;
  household: Household;
}

export async function getMyHouseholds(uid: UUID): Promise<MyHousehold[]> {
  const rows = unwrap<{ role: MemberRole; household: Household }[]>(
    await supabase.from('household_members').select('role, joined_at, household:households(*)').eq('user_id', uid).order('joined_at'),
  );
  return rows.filter((r) => r.household);
}

export async function getMembers(hid: UUID): Promise<Member[]> {
  return unwrap(
    await supabase
      .from('household_members')
      .select('household_id, user_id, role, joined_at, profile:profiles(id, display_name, color)')
      .eq('household_id', hid)
      .order('joined_at'),
  );
}

export const createHousehold = (args: { name: string; icon: string; timeZone: string; spaces: { name: string; kind: SpaceKind }[] }) =>
  rpc<UUID>('create_household', { p_name: args.name, p_icon: args.icon, p_time_zone: args.timeZone, p_spaces: args.spaces });

export const joinHousehold = (code: string) =>
  rpc<{ ok: boolean; household_id?: UUID; error?: string; already_member?: boolean }>('join_household', { p_code: code });

export const getInvite = (hid: UUID) => rpc<Invite>('get_or_create_invite', { p_household: hid });
export const regenerateInvite = (hid: UUID) => rpc<Invite>('regenerate_invite', { p_household: hid });
export const leaveHousehold = (hid: UUID) => rpc('leave_household', { p_household: hid });
export const removeMember = (hid: UUID, uid: UUID) => rpc('remove_member', { p_household: hid, p_user: uid });
export const setMemberRole = (hid: UUID, uid: UUID, role: MemberRole) =>
  rpc('set_member_role', { p_household: hid, p_user: uid, p_role: role });
export const updateHousehold = (hid: UUID, patch: { name?: string; icon?: string; timeZone?: string }) =>
  rpc('update_household', { p_household: hid, p_name: patch.name ?? null, p_icon: patch.icon ?? null, p_time_zone: patch.timeZone ?? null });

export async function getSpaces(hid: UUID): Promise<Space[]> {
  return unwrap(await supabase.from('spaces').select('*').eq('household_id', hid).is('archived_at', null).order('created_at'));
}

export const saveSpace = (hid: UUID, space: { id?: UUID; name: string; kind: SpaceKind; isReservable: boolean; requiresAgreement: boolean }) =>
  rpc<UUID>('save_space', {
    p_household: hid, p_space: space.id ?? null, p_name: space.name, p_kind: space.kind,
    p_is_reservable: space.isReservable, p_requires_agreement: space.requiresAgreement,
  });
export const archiveSpace = (spaceId: UUID) => rpc('archive_space', { p_space: spaceId });

export interface AgreedWindow extends SpaceWindow {
  signal_id: UUID;
}

export async function getAgreedWindows(hid: UUID, from: string, to: string): Promise<AgreedWindow[]> {
  return unwrap(
    await supabase
      .from('space_windows')
      .select('signal_id, space_id, requested_by, starts_at, ends_at, reason, state, agreed_at')
      .eq('household_id', hid)
      .eq('state', 'agreed')
      .gte('ends_at', from)
      .lte('starts_at', to)
      .order('starts_at'),
  );
}

export const spaceConflicts = (spaceId: UUID, starts: string, ends: string, exclude?: UUID) =>
  rpc<SpaceConflict[]>('space_conflicts', { p_space: spaceId, p_starts: starts, p_ends: ends, p_exclude: exclude ?? null });

// ---------------------------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------------------------
export async function getFeed(hid: UUID): Promise<Signal[]> {
  return unwrap(
    await supabase
      .from('signals')
      .select(SIGNAL_SELECT)
      .eq('household_id', hid)
      .in('status', ['proposed', 'active'])
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(100),
  );
}

export async function getSignal(id: UUID): Promise<SignalDetail | null> {
  return unwrap(await supabase.from('signals').select(SIGNAL_DETAIL_SELECT).eq('id', id).maybeSingle());
}

export interface CreateSignalArgs {
  householdId: UUID;
  kind: Exclude<SignalKind, 'space'>;
  title: string;
  body?: string | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  recipients?: UUID[] | null;
  details?: Record<string, unknown>;
}

export const createSignal = (a: CreateSignalArgs) =>
  rpc<UUID>('create_signal', {
    p_household: a.householdId, p_kind: a.kind, p_title: a.title, p_body: a.body ?? null,
    p_starts_at: a.startsAt ?? null, p_expires_at: a.expiresAt ?? null,
    p_recipients: a.recipients && a.recipients.length ? a.recipients : null, p_details: a.details ?? {},
  });

export const respondToSignal = (signalId: UUID, response: string, portions?: number | null) =>
  rpc<{ status: string; became_plan: boolean }>('respond_to_signal', { p_signal: signalId, p_response: response, p_portions: portions ?? null });
export const clearResponse = (signalId: UUID) => rpc('clear_response', { p_signal: signalId });
export const claimPortions = (signalId: UUID, portions: number) =>
  rpc<{ claimed: number; remaining: number }>('claim_portions', { p_signal: signalId, p_portions: portions });
export const cancelSignal = (signalId: UUID) => rpc('cancel_signal', { p_signal: signalId });
export const resolveSignal = (signalId: UUID) => rpc('resolve_signal', { p_signal: signalId });
export const addComment = (signalId: UUID, body: string) => rpc<UUID>('add_signal_comment', { p_signal: signalId, p_body: body });

export const addRunItem = (signalId: UUID, name: string, quantity?: string, note?: string) =>
  rpc<UUID>('add_run_item', { p_signal: signalId, p_name: name, p_quantity: quantity ?? null, p_note: note ?? null });
export const withdrawRunItem = (itemId: UUID) => rpc('withdraw_run_item', { p_item: itemId });
export const decideRunItem = (itemId: UUID, decision: Exclude<RunItemStatus, 'requested' | 'withdrawn'>) =>
  rpc('decide_run_item', { p_item: itemId, p_decision: decision });
export const startRun = (signalId: UUID) => rpc('start_run', { p_signal: signalId });
export const completeRun = (signalId: UUID) => rpc<{ status: string }>('complete_run', { p_signal: signalId });

export const requestSpaceWindow = (a: {
  householdId: UUID; spaceId: UUID; startsAt: string; endsAt: string; reason: SpaceReason;
  title?: string | null; note?: string | null; approvers?: UUID[] | null;
}) =>
  rpc<{ signal_id: UUID; state: string }>('request_space_window', {
    p_household: a.householdId, p_space: a.spaceId, p_starts: a.startsAt, p_ends: a.endsAt, p_reason: a.reason,
    p_title: a.title ?? null, p_note: a.note ?? null, p_approvers: a.approvers ?? null,
  });

export const decideSpaceWindow = (signalId: UUID, decision: Exclude<ApprovalDecision, 'pending'>, counter?: { start: string; end: string }) =>
  rpc<{ state: string }>('decide_space_window', {
    p_signal: signalId, p_decision: decision,
    p_counter_starts: counter?.start ?? null, p_counter_ends: counter?.end ?? null,
  });

export const rescheduleSpaceWindow = (signalId: UUID, startsAt: string, endsAt: string) =>
  rpc<{ state: string }>('reschedule_space_window', { p_signal: signalId, p_starts: startsAt, p_ends: endsAt });

export const addResetTask = (signalId: UUID, label: string) => rpc<UUID>('add_reset_task', { p_signal: signalId, p_label: label });
export const claimResetTask = (taskId: UUID) => rpc('claim_reset_task', { p_task: taskId });
export const releaseResetTask = (taskId: UUID) => rpc('release_reset_task', { p_task: taskId });
export const setResetTaskDone = (taskId: UUID, done: boolean) => rpc('set_reset_task_done', { p_task: taskId, p_done: done });

// ---------------------------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------------------------
export async function getStatuses(hid: UUID): Promise<MemberStatus[]> {
  return unwrap(await supabase.from('member_statuses').select('*').eq('household_id', hid));
}

export const setStatus = (a: {
  householdId: UUID; status: StatusKind; label?: string | null; eta?: string | null; expiresAt?: string | null;
  visibility: StatusVisibility; viewers?: UUID[] | null;
}) =>
  rpc<{ expires_at: string }>('set_status', {
    p_household: a.householdId, p_status: a.status, p_label: a.label ?? null, p_eta: a.eta ?? null,
    p_expires_at: a.expiresAt ?? null, p_visibility: a.visibility, p_viewers: a.viewers?.length ? a.viewers : null,
  });
export const clearStatus = (hid: UUID) => rpc('clear_status', { p_household: hid });

// ---------------------------------------------------------------------------------------------
// Responsibilities
// ---------------------------------------------------------------------------------------------
export async function getChores(hid: UUID): Promise<Chore[]> {
  return unwrap(
    await supabase
      .from('chores')
      .select('*, chore_rotation(user_id, position)')
      .eq('household_id', hid)
      .is('archived_at', null)
      .order('next_due_on'),
  );
}

export async function getChoreHistory(choreId: UUID): Promise<ChoreCompletion[]> {
  return unwrap(
    await supabase.from('chore_completions').select('*').eq('chore_id', choreId).order('completed_at', { ascending: false }).limit(12),
  );
}

export async function getMySwaps(hid: UUID): Promise<ChoreSwap[]> {
  return unwrap(await supabase.from('chore_swaps').select('*').eq('household_id', hid).eq('status', 'pending'));
}

export const createChore = (a: { householdId: UUID; title: string; icon: string; cadenceDays: number; firstDue?: string | null; rotation: UUID[] }) =>
  rpc<UUID>('create_chore', {
    p_household: a.householdId, p_title: a.title, p_icon: a.icon, p_cadence_days: a.cadenceDays,
    p_first_due: a.firstDue ?? null, p_rotation: a.rotation,
  });
export const completeChore = (choreId: UUID, dueOn: string) =>
  rpc<{ completed: boolean; next_due_on: string; assignee_id: UUID | null; reason?: string }>('complete_chore', { p_chore: choreId, p_due_on: dueOn });
export const requestChoreSwap = (choreId: UUID, toUser: UUID) => rpc<UUID>('request_chore_swap', { p_chore: choreId, p_to_user: toUser });
export const respondChoreSwap = (swapId: UUID, accept: boolean) => rpc<{ status: string }>('respond_chore_swap', { p_swap: swapId, p_accept: accept });
export const archiveChore = (choreId: UUID) => rpc('archive_chore', { p_chore: choreId });

// ---------------------------------------------------------------------------------------------
// Calendar & inbox
// ---------------------------------------------------------------------------------------------
export async function getEvents(hid: UUID, from: string, to: string): Promise<CalendarEvent[]> {
  return unwrap(
    await supabase.from('events').select('*').eq('household_id', hid).is('canceled_at', null)
      .gte('starts_at', from).lte('starts_at', to).order('starts_at'),
  );
}

export async function getInbox(): Promise<AppNotification[]> {
  return unwrap(
    await supabase.from('notifications')
      .select('id, household_id, category, signal_id, chore_id, title, body, actionable, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(100),
  );
}

export const markNotificationsRead = (ids?: UUID[]) => rpc<number>('mark_notifications_read', { p_ids: ids ?? null });
export const registerPushToken = (token: string, platform: 'ios' | 'android') =>
  rpc('register_push_token', { p_token: token, p_platform: platform });
export const unregisterPushToken = (token: string) => rpc('unregister_push_token', { p_token: token });

export type { MemberColor };

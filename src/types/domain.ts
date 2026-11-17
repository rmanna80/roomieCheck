/**
 * Domain types mirroring the Supabase schema (supabase/migrations). Timestamps are ISO strings
 * in UTC; dates (chores) are 'YYYY-MM-DD' in the household's time zone.
 */

export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;

export type MemberRole = 'owner' | 'member';
export type MemberColor = 'ember' | 'saffron' | 'sage' | 'plum' | 'teal' | 'coral' | 'dusk' | 'slate';
export type SpaceKind = 'living' | 'kitchen' | 'dining' | 'laundry' | 'bathroom' | 'study' | 'outdoor' | 'other';

export type SignalKind = 'food' | 'leftovers' | 'run' | 'space' | 'reset' | 'spark' | 'return' | 'quiet';
export type SignalStatus = 'proposed' | 'active' | 'resolved' | 'expired' | 'canceled';
export type SignalAudience = 'household' | 'selected';
export type RunType = 'groceries' | 'takeout' | 'pharmacy' | 'convenience' | 'supplies' | 'other';
export type RunItemStatus = 'requested' | 'accepted' | 'declined' | 'purchased' | 'unavailable' | 'withdrawn';
export type SpaceReason = 'personal' | 'call' | 'guests' | 'study' | 'event' | 'cooking' | 'other';
export type WindowState = 'pending' | 'agreed' | 'declined' | 'withdrawn';
export type ApprovalDecision = 'pending' | 'approved' | 'needs_it_too' | 'counter';
export type StatusKind =
  | 'home' | 'out' | 'on_my_way' | 'home_later' | 'busy' | 'studying' | 'available' | 'dnd'
  | 'quiet_night' | 'focus' | 'custom';
export type StatusVisibility = 'household' | 'selected';
export type SwapStatus = 'pending' | 'accepted' | 'declined' | 'canceled';
export type NotificationCategory =
  | 'food' | 'runs' | 'spaces' | 'sparks' | 'resets' | 'updates' | 'chores' | 'responses' | 'requests' | 'household';
export type ChoreIcon =
  | 'trash' | 'recycle' | 'dishes' | 'bathroom' | 'vacuum' | 'kitchen' | 'supplies' | 'pet' | 'plants' | 'laundry' | 'other';

export interface Profile {
  id: UUID;
  display_name: string;
  color: MemberColor;
  time_zone: string;
  onboarded_at: ISODateTime | null;
}

export interface Household {
  id: UUID;
  name: string;
  icon: string;
  theme: string;
  time_zone: string;
  created_at: ISODateTime;
}

export interface Membership {
  household_id: UUID;
  user_id: UUID;
  role: MemberRole;
  joined_at: ISODateTime;
}

export interface Member extends Membership {
  profile: Pick<Profile, 'id' | 'display_name' | 'color'>;
}

export interface Space {
  id: UUID;
  household_id: UUID;
  name: string;
  kind: SpaceKind;
  is_reservable: boolean;
  requires_agreement: boolean;
  created_by: UUID | null;
  archived_at: ISODateTime | null;
}

export interface SignalResponse {
  signal_id: UUID;
  user_id: UUID;
  response: string;
  portions: number | null;
  note: string | null;
  updated_at: ISODateTime;
}

export interface FoodDetails {
  portions_total: number | null;
  location: string | null;
}

export interface Run {
  run_type: RunType;
  destination: string | null;
  leaves_at: ISODateTime;
  started_at: ISODateTime | null;
  completed_at: ISODateTime | null;
}

export interface RunItem {
  id: UUID;
  signal_id: UUID;
  requested_by: UUID;
  name: string;
  quantity: string | null;
  note: string | null;
  status: RunItemStatus;
  created_at: ISODateTime;
}

export interface SpaceWindow {
  space_id: UUID;
  requested_by: UUID;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  reason: SpaceReason;
  state: WindowState;
  agreed_at: ISODateTime | null;
}

export interface SpaceApproval {
  signal_id: UUID;
  approver_id: UUID;
  decision: ApprovalDecision;
  counter_starts_at: ISODateTime | null;
  counter_ends_at: ISODateTime | null;
  note: string | null;
}

export interface ResetTask {
  id: UUID;
  signal_id: UUID;
  label: string;
  position: number;
  claimed_by: UUID | null;
  done_at: ISODateTime | null;
}

export interface Spark {
  plan_at: ISODateTime | null;
  min_people: number;
  became_plan_at: ISODateTime | null;
}

export interface SignalComment {
  id: UUID;
  signal_id: UUID;
  user_id: UUID;
  body: string;
  created_at: ISODateTime;
}

/** A signal with its kind details embedded (PostgREST one-to-one embeds return objects). */
export interface Signal {
  id: UUID;
  household_id: UUID;
  created_by: UUID;
  kind: SignalKind;
  title: string;
  body: string | null;
  status: SignalStatus;
  audience: SignalAudience;
  starts_at: ISODateTime | null;
  expires_at: ISODateTime;
  resolved_at: ISODateTime | null;
  created_at: ISODateTime;
  signal_responses: SignalResponse[];
  food_details: FoodDetails | null;
  runs: Run | null;
  space_windows: SpaceWindow | null;
  sparks: Spark | null;
  resets: { minutes: number } | null;
  /** Feed includes who still needs to answer a space request. */
  space_window_approvals?: Pick<SpaceApproval, 'approver_id' | 'decision'>[];
}

export interface SignalDetail extends Signal {
  run_items: RunItem[];
  space_window_approvals: SpaceApproval[];
  reset_tasks: ResetTask[];
  signal_comments: SignalComment[];
  signal_recipients: { user_id: UUID }[];
}

export interface MemberStatus {
  household_id: UUID;
  user_id: UUID;
  status: StatusKind;
  label: string | null;
  eta_at: ISODateTime | null;
  expires_at: ISODateTime;
  visibility: StatusVisibility;
  updated_at: ISODateTime;
}

export interface Chore {
  id: UUID;
  household_id: UUID;
  title: string;
  icon: ChoreIcon;
  cadence_days: number;
  next_due_on: ISODate;
  assignee_id: UUID | null;
  rotation_anchor_id: UUID | null;
  created_by: UUID | null;
  archived_at: ISODateTime | null;
  chore_rotation: { user_id: UUID; position: number }[];
}

export interface ChoreCompletion {
  id: UUID;
  chore_id: UUID;
  completed_by: UUID | null;
  due_on: ISODate;
  completed_at: ISODateTime;
}

export interface ChoreSwap {
  id: UUID;
  chore_id: UUID;
  from_user: UUID;
  to_user: UUID;
  due_on: ISODate;
  status: SwapStatus;
  created_at: ISODateTime;
}

export interface CalendarEvent {
  id: UUID;
  household_id: UUID;
  signal_id: UUID | null;
  title: string;
  starts_at: ISODateTime;
  ends_at: ISODateTime | null;
  canceled_at: ISODateTime | null;
}

export interface AppNotification {
  id: UUID;
  household_id: UUID | null;
  category: NotificationCategory;
  signal_id: UUID | null;
  chore_id: UUID | null;
  title: string;
  body: string | null;
  actionable: boolean;
  created_at: ISODateTime;
  read_at: ISODateTime | null;
}

export interface NotificationPreferences {
  user_id: UUID;
  push_enabled: boolean;
  food: boolean;
  runs: boolean;
  spaces: boolean;
  sparks: boolean;
  resets: boolean;
  updates: boolean;
  chores: boolean;
  responses: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

export interface Invite {
  code: string;
  expires_at: ISODateTime;
  uses_left: number;
}

export interface SpaceConflict {
  signal_id: UUID;
  requested_by: UUID;
  starts_at: ISODateTime;
  ends_at: ISODateTime;
  state: WindowState;
}

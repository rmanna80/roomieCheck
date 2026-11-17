/**
 * Server errors are raised with stable machine codes (see migrations). This maps them to calm,
 * human copy. Unknown errors fall back to a generic retry message.
 */

const MESSAGES: Record<string, string> = {
  not_authenticated: 'Your session ended. Please sign in again.',
  not_member: 'You’re not part of that home anymore.',
  owner_only: 'Only a home owner can do that.',
  creator_only: 'Only the person who sent this can change it.',
  runner_only: 'Only the person doing the run can update items.',
  assignee_only: 'Only the person whose turn it is can ask for a swap.',
  not_an_approver: 'You weren’t asked to approve this one.',
  not_found: 'That’s no longer available.',
  signal_closed: 'This has already wrapped up.',
  own_signal: 'That’s your own signal.',
  invalid_response: 'That response doesn’t fit this signal.',
  not_enough_portions: 'Someone just claimed the last of it.',
  run_closed: 'This run already left — requests are closed.',
  too_many_items: 'That’s the most items you can add to one run.',
  space_taken: 'That time was just agreed for someone else. Try another slot.',
  space_not_reservable: 'That space isn’t set up for requests.',
  space_not_found: 'That space isn’t available.',
  invalid_time: 'That time doesn’t work — pick something a bit later.',
  invalid_recipient: 'One of those people isn’t in this home.',
  viewers_required: 'Choose at least one person to share with.',
  rate_limited: 'That’s a lot at once — try again in a bit.',
  already_claimed: 'Someone already took that one.',
  status_sharing_disabled: 'Status sharing is turned off in Privacy settings.',
  too_many_households: 'You can be in up to 5 homes.',
  household_full: 'That home is full (16 people).',
  invalid_code: 'That code doesn’t match a home. Check it and try again.',
  expired_code: 'That invite has expired. Ask for a fresh one.',
  too_many_attempts: 'Too many tries. Wait 15 minutes and try again.',
  last_owner: 'A home needs at least one owner.',
  eta_required: 'Add a rough time you’ll be back.',
  portions_required: 'Add how many portions are available.',
  too_many_spaces: 'That’s the maximum number of spaces.',
  too_many_chores: 'That’s the maximum number of responsibilities.',
  chore_archived: 'This responsibility was removed.',
  use_leave_household: 'Use “Leave home” to remove yourself.',
  network: 'Can’t reach HomePulse. Check your connection and try again.',
};

export function errorCode(err: unknown): string | null {
  if (!err) return null;
  const message =
    typeof err === 'string' ? err : typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : '';
  if (/network request failed|failed to fetch|fetch failed/i.test(message)) return 'network';
  const match = message.match(/^[a-z_]+$/) ? message : Object.keys(MESSAGES).find((k) => message.includes(k));
  return match ?? null;
}

export function messageFor(err: unknown): string {
  const code = errorCode(err);
  return (code && MESSAGES[code]) || 'Something went wrong. Please try again.';
}

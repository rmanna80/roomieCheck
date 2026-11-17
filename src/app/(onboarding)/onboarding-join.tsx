import { Screen } from '@/components/Screen';
import { JoinHouseholdForm } from '@/features/household/HouseholdForms';

export default function OnboardingJoin() {
  return (
    <Screen back="back" title="Join your home" subtitle="Enter the 8-character code from a housemate.">
      <JoinHouseholdForm onDone={() => undefined} />
    </Screen>
  );
}

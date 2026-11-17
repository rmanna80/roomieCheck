import { Screen } from '@/components/Screen';
import { CreateHouseholdForm } from '@/features/household/HouseholdForms';

// When creation succeeds, the households query refreshes and the root guard switches to the app.
export default function OnboardingCreate() {
  return (
    <Screen back="back" title="Set up your home">
      <CreateHouseholdForm onDone={() => undefined} />
    </Screen>
  );
}

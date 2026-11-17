import { router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { JoinHouseholdForm } from '@/features/household/HouseholdForms';

export default function JoinAnotherHome() {
  return (
    <Screen back="close" title="Join a home" subtitle="Enter the 8-character code from a housemate.">
      <JoinHouseholdForm onDone={() => router.replace('/')} />
    </Screen>
  );
}

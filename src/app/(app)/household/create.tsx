import { router } from 'expo-router';

import { Screen } from '@/components/Screen';
import { CreateHouseholdForm } from '@/features/household/HouseholdForms';

export default function CreateAnotherHome() {
  return (
    <Screen back="close" title="Set up a home">
      <CreateHouseholdForm onDone={() => router.replace('/')} />
    </Screen>
  );
}

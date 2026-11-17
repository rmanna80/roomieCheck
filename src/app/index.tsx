/**
 * The app's anchor route. It always exists (outside every guard) and sends people to the right
 * place: welcome → onboarding → home. Protected-route redirects land here too.
 */
import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';
import { useHousehold } from '@/features/household/HouseholdProvider';

export default function Index() {
  const { session } = useAuth();
  const { me, households } = useHousehold();
  if (!session) return <Redirect href="/welcome" />;
  if (!me?.display_name || households.length === 0) return <Redirect href="/setup-profile" />;
  return <Redirect href="/home" />;
}

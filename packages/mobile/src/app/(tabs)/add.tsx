import { Redirect } from 'expo-router';

// This tab never renders — its press is intercepted in (tabs)/_layout.tsx to
// open the Add-a-recipe bottom sheet. If reached directly, bounce home.
export default function AddTab() {
  return <Redirect href="/" />;
}

import { Redirect } from 'expo-router';

// This tab never renders — its press is intercepted in (tabs)/_layout.tsx to
// open the new-recipe modal. If reached directly, bounce home.
export default function AddTab() {
  return <Redirect href="/" />;
}

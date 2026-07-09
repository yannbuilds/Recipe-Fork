import * as Haptics from 'expo-haptics';

// Fire-and-forget haptic feedback. Every call swallows its own errors —
// haptics silently no-op on hardware/simulators that don't support them,
// so callers never need to await or try/catch.
//
// Semantic names keep the *feel* consistent across the app:
//   select  — ticking through a list / toggling a checkbox / stepper (the lightest tap)
//   light   — a discrete switch or a minor add/remove action
//   medium  — a deliberate primary action (e.g. opening the add flow)
//   success — a task landed (saved, marked cooked, imported)
//   warning — a reversible-but-notable moment
//   error   — something failed
export const haptics = {
  select: () => Haptics.selectionAsync().catch(() => {}),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};

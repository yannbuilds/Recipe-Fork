import { registerSW } from 'virtual:pwa-register';

// Register before React mounts. In auto-update mode, Workbox activates a new
// application shell and reloads once when an update is discovered. We do not
// poll while the app is open: that avoids interrupting a recipe being edited.
if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.info('Pie Keeper is ready to work offline.');
    },
    onRegisterError(error) {
      console.error('Pie Keeper could not register its offline worker:', error);
    },
  });
}

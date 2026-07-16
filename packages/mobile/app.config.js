const appIdentifier = 'au.com.pompon.piekeeper';

module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    bundleIdentifier: config.ios?.bundleIdentifier ?? appIdentifier,
  },
  android: {
    ...config.android,
    package: config.android?.package ?? appIdentifier,
  },
  plugins: [
    ...(config.plugins ?? []),
    [
      'expo-share-intent',
      {
        iosShareExtensionName: 'Save to Pie Keeper',
        iosAppGroupIdentifier: `group.${appIdentifier}`,
        iosShareExtensionBundleIdentifier: `${appIdentifier}.share-extension`,
        iosActivationRules: {
          NSExtensionActivationSupportsText: true,
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsWebPageWithMaxCount: 1,
        },
        androidIntentFilters: ['text/*'],
      },
    ],
  ],
});

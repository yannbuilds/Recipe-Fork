const { getDefaultConfig } = require('expo/metro-config');

// Expo detects npm workspaces and supplies the monorepo watch folders and
// app-first node resolution automatically. Keeping the SDK defaults also lets
// package-local transitive dependencies resolve during production bundling.
module.exports = getDefaultConfig(__dirname);

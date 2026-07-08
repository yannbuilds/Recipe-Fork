const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the whole monorepo so changes in packages/shared hot-reload.
config.watchFolders = [workspaceRoot];

// Resolve from the app's node_modules first, then the workspace root.
// disableHierarchicalLookup stops hoisted packages (e.g. react-query at the
// root) from pulling in the web app's React copy — the app must bundle
// exactly one react/react-native, the SDK 54-compatible ones nested here.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;

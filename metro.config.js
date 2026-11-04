// https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// server/ is the Node API, a separate project: keep Metro from crawling or bundling it.
config.resolver.blockList = [
  ...[config.resolver.blockList ?? []].flat(),
  new RegExp(`^${__dirname.replace(/[/\\]/g, '[/\\\\]')}[/\\\\]server[/\\\\].*`),
];

module.exports = config;

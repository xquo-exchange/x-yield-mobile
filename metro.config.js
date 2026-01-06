const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const joseDir = path.dirname(require.resolve('jose/package.json'));

// Force jose and other Node.js-dependent packages to use browser versions
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force jose to use browser version
  if (moduleName === 'jose') {
    return {
      filePath: path.join(joseDir, 'dist/browser/index.js'),
      type: 'sourceFile',
    };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

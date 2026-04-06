const { withAppBuildGradle } = require('@expo/config-plugins');
const generateCode = require('@expo/config-plugins/build/utils/generateCode');

const NDK_VERSION = '29.0.14206865';

module.exports = function withAppNdk29(config) {
  return withAppBuildGradle(config, (config) => {
    const ndkBlock = `ndkVersion "${NDK_VERSION}"`;
    
    const contents = generateCode.mergeContents({
      tag: '/* NDK29 app level */',
      src: config.modResults.contents,
      newSrc: ndkBlock,
      anchor: /compileSdkVersion/,
      offsetBy: 1,
    });

    config.modResults.contents = contents.contents;
    console.log(`[AppNDK29] ✅ app/build.gradle android { ndkVersion ${NDK_VERSION}`);
    return config;
  });
};
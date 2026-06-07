/**
 * Webpack Configuration
 *
 * Custom webpack config for the NestJS server.
 * Marks bcrypt as an external dependency — it's a native Node.js module
 * that cannot and should not be bundled by webpack.
 *
 * Without this, webpack tries to parse bcrypt's build tooling
 * (@mapbox/node-pre-gyp) which contains HTML files and non-JS modules.
 */

module.exports = function (options) {
  return {
    ...options,
    externals: {
      bcrypt: 'commonjs bcrypt',
    },
  };
};
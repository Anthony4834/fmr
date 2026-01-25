const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    'content/content-script': './content/content-script.ts',
    'content/auth-bridge': './content/auth-bridge.ts',
    'background/service-worker': './background/service-worker.ts',
    'popup/popup': './popup/popup.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
    module: false, // Disable ES modules for content scripts
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: {
              module: 'CommonJS', // Use CommonJS for compatibility
            },
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  target: 'web', // Target web environment
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'popup/popup.html', to: 'popup/popup.html' },
        { from: 'popup/popup.css', to: 'popup/popup.css' },
        // popup.js is now compiled from popup.ts via webpack entry
        { from: 'assets', to: 'assets', noErrorOnMissing: true },
      ],
    }),
  ],
  mode: 'production',
  optimization: {
    minimize: false, // Chrome extensions typically don't need minification
  },
  devtool: false,
};


const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    'content/content-script': './content/content-script.ts',
    'background/service-worker': './background/service-worker.ts',
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
        { from: 'popup/popup.js', to: 'popup/popup.js' }, // Use JS file directly (no TS compilation for popup)
        { from: 'assets', to: 'assets', noErrorOnMissing: true },
      ],
    }),
  ],
  mode: 'development', // Use development mode for easier debugging
  optimization: {
    minimize: false, // Chrome extensions don't need minification
  },
  devtool: 'inline-source-map', // Enable source maps for debugging
};

const path = require('node:path');
const webpack = require('webpack');

module.exports = {
  devtool: 'source-map',
  entry: path.resolve(__dirname, 'lib', 'index-browser.js'),
  mode: 'production',
  output: {
    filename: 'comunica-browser.js',
    path: __dirname,
    libraryTarget: 'var',
    library: 'Comunica',
  },
  plugins: [
    new webpack.ProgressPlugin(),
  ],
};

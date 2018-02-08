const webpack = require('webpack')
const nodeExternals = require('webpack-node-externals')
const path = require('path')

const env = process.env.NODE_ENV || 'development'
const DEV = env === 'development'
const RELEASE = !DEV

const config = {
  env,
  entry: ['babel-polyfill', './handlers.js'],
  node: {
    __filename: true,
    __dirname: true
  },
  target: 'node',
  externals: [
    nodeExternals()
  ],
  resolve: {
    extensions: ['', '.js'],
    root: [
      path.resolve('.'),
      path.resolve('..')
    ]
  },
  plugins: [],
  module: {
    loaders: [
      { test: /\.(js)$/, exclude: /node_modules/, loader: 'babel-loader' },
      { test: /\.json$/, loader: 'json-loader', exclude: /node_modules/ }
    ]
  }
}

if (DEV) {
  config.devtool = 'source-map'
}

// Add plugins for prod
if (RELEASE) {
  config.plugins.push(
    new webpack.optimize.DedupePlugin(),
    new webpack.optimize.OccurenceOrderPlugin())
}

module.exports = config

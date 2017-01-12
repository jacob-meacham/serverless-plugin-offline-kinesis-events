/**
 * Created by msills on 1/11/17.
 */
var webpack = require('webpack');
var nodeExternals = require('webpack-node-externals');

module.exports = {
    entry: ['./index.js'],
    output: {
        path: __dirname + "/build",
        filename: 'bundle.js',
        libraryTarget: 'umd'
    },
    node: {
        __filename: true,
        __dirname: true
    },
    target: 'node',
    externals: [
        nodeExternals()
    ],
    resolve: {
        extensions: ['', '.js']
    },
    devtool: 'source-map',
    plugins: [
        // new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
        // new webpack.optimize.DedupePlugin(),
        // new webpack.optimize.OccurenceOrderPlugin(),
        // new webpack.optimize.UglifyJsPlugin({
        //     compress: {
        //         unused: true,
        //         dead_code: true,
        //         warnings: false,
        //         drop_debugger: true
        //     }
        // })
    ],
    module: {
        loaders: [
            {
                test: /\.js$/,
                loader: 'babel-loader',
                exclude: /node_modules/,
                query: {
                    presets: ['es2015'],
                    plugins: [
                        "transform-es2015-template-literals",
                        "transform-object-rest-spread",
                        "transform-async-to-generator"
                    ]
                }
            },
            {
                test: /\.json$/,
                loader: 'json-loader',
                exclude: /node_modules/,
            }
        ]
    }
};

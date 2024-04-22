/* eslint-disable @typescript-eslint/no-var-requires */
const webpack = require('webpack')
const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')
const srcDir = path.join(__dirname, '..', 'src')
const TerserPlugin = require('terser-webpack-plugin')

module.exports = {
    entry: {
        popup: path.join(srcDir, 'popup.ts'),
        background: path.join(srcDir, 'background.ts'),
        searchreplace: path.join(srcDir, 'searchreplace.ts'),
        options: path.join(srcDir, 'options.ts'),
        util: path.join(srcDir, 'util.ts'),
        // help: path.join(srcDir, 'help.ts'),
        elements: path.join(srcDir, 'elements.ts'),
    },
    output: {
        path: path.join(__dirname, '../dist'),
        filename: '[name].js',
    },
    optimization: {
        splitChunks: {
            name: 'vendor',
            chunks(chunk) {
                return chunk.name !== 'background'
            },
        },
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules|cypress/,
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js'],
    },
    plugins: [
        new CopyPlugin({
            patterns: [{ from: 'manifest.json', to: '../dist/manifest.json' }],
            options: {},
        }),
        new CopyPlugin({
            patterns: [{ from: '.', to: '../dist/assets', context: 'assets' }],
            options: {},
        }),
        new CopyPlugin({
            patterns: [{ from: '.', to: '../dist/_locales', context: '_locales' }],
            options: {},
        }),
    ],
}

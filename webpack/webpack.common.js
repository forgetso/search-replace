const webpack = require('webpack')
const path = require('path')
const CopyPlugin = require('copy-webpack-plugin')
const srcDir = path.join(__dirname, '..', 'src')

module.exports = {
    entry: {
        popup: path.join(srcDir, 'popup.ts'),
        background: path.join(srcDir, 'background.ts'),
        searchreplace: path.join(srcDir, 'searchreplace.ts'),
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
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js'],
    },
    plugins: [
        new CopyPlugin({
            patterns: [{ from: 'assets/manifest.json', to: '../dist/manifest.json' }],
            options: {},
        }),
        new CopyPlugin({
            patterns: [{ from: '.', to: '../dist/assets', context: 'assets' }],
            options: {},
        }),
    ],
}

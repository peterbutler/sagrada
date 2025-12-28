const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const isDevelopment = process.env.NODE_ENV === 'development';

module.exports = {
    entry: './src/index.jsx',
    output: {
        path: path.resolve(__dirname, '../public/dist'),
        filename: '[name].[contenthash].js',
        clean: true,
        publicPath: '/dist/'
    },
    resolve: {
        extensions: ['.js', '.jsx']
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader'
                }
            },
            {
                test: /\.css$/,
                use: [
                    isDevelopment ? 'style-loader' : MiniCssExtractPlugin.loader,
                    'css-loader'
                ]
            }
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './src/index.html',
            inject: true,
            filename: '../index.html'
        }),
        !isDevelopment && new MiniCssExtractPlugin({
            filename: '[name].[contenthash].css'
        })
    ].filter(Boolean),
    devServer: {
        static: [
            {
                directory: path.join(__dirname, '../public'),
                publicPath: '/'
            }
        ],
        port: 3000,
        hot: true,
        historyApiFallback: true,
        proxy: [
            {
                context: ['/api', '/health'],
                target: 'http://localhost:3001',
                secure: false
            },
            {
                context: ['/ws'],
                target: 'ws://localhost:3001',
                ws: true
            }
        ],
        devMiddleware: {
            writeToDisk: true
        }
    },
    devtool: isDevelopment ? 'eval-source-map' : 'source-map',
    watchOptions: {
        poll: 1000,
        ignored: /node_modules/
    }
}; 
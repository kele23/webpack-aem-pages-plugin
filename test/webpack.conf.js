const path = require('path');
const WebpackAEMPagesPlugin = require('..');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const dist = path.resolve(__dirname, './dist');
const src = path.resolve(__dirname, '.');

module.exports = {
    mode: 'development',
    target: ['web'],
    entry: path.resolve(src, 'index.js'),

    devServer: {
        static: dist,
        transportMode: 'sockjs',
        host: '0.0.0.0',
        firewall: false,
        port: 3000,
        proxy: [
            {
                context: ['/content/dam', '/etc.clientlibs', '/etc', '/apps', '/libs'],
                target: 'http://localhost:4502',
                auth: 'admin:admin',
            },
        ],
    },

    output: {
        publicPath: '',
        path: dist,
        filename: 'bundle.js',
    },

    plugins: [
        new CleanWebpackPlugin(),
        new WebpackAEMPagesPlugin({
            repoDir: path.resolve(src, 'repository'),
            projectName: 'test',
            destDir: dist,
            bindings: {
                aktComponent: async () => {
                    return { ola: 'ola binding!' };
                },
            },
        }),
    ],
};

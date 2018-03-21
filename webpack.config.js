const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');

module.exports = {
  entry: ['./src/leaflet-measure.js'],
  output: {
    filename: `leaflet-measure${langPrefix}.js`,
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/dist/',
    libraryTarget: 'umd',
  },
  module: {
    rules: [
      // js loader
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader?optional=runtime',
          options: {
            presets: [
              'babel-preset-env',
            ],
          },
        },
      },
      // html loader
      {
        test: /\.html$/,
        use: {
          loader: 'html-loader?interpolate',
        },
      },
      // sass loader
      {
        test: /\.scss$/,
        use: extractSass.extract({
          use: [
            {
              loader: 'css-loader',
              options: {
                url: false,
              },
            },
            {
              loader: 'sass-loader',
            },
          ],
          fallback: 'style-loader',
        })
      }, // end sass loader
    ], // end rules
  }, // end module
  plugins: [
    // copy site
    new CopyPlugin([{ from: './example', to: './' }]),
    new CopyPlugin([{ from: './assets', to: 'assets', ignore: '*.svg' }]),
    new ExtractTextPlugin({ filename: 'leaflet-measure.css' }),
  ],
};

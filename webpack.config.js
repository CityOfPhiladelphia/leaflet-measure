const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');

const BUILD_DIR = path.resolve(__dirname, 'dist');

const commonConfig = {
  entry: './src/leaflet-measure.js',
  output: {
    filename: 'leaflet-measure.js',
    path: BUILD_DIR,
    libraryTarget: 'umd',
  },
  module: {
    rules: [
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
        use: new ExtractTextPlugin({ filename: 'leaflet-measure.css' })
                .extract({
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

const config = Object.assign({}, commonConfig);

// prod
if (process.env.NODE_ENV === 'production') {
  // put a javascript loader at the beginning of module rules
  config.module.rules.unshift({
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
  });

  config.output.publicPath = '/dist/';
// dev
} else {
  Object.assign(config, {
    devServer: {
      contentBase: BUILD_DIR,
    },
    devtool: 'eval-source-map',
  });
}

module.exports = config;

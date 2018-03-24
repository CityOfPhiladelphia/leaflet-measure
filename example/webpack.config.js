const path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    index: [path.join(__dirname, 'main.js')],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
        ],
      },
      {
        test: /\.png$/,
        use: ['file-loader'],
      },
    ],
  },
  output: {
    filename: 'bundle.js',
  },
  serve: {
    content: [__dirname],
  },
};

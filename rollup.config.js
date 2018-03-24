import html from 'rollup-plugin-html';
import buble from 'rollup-plugin-buble';
import uglify from 'rollup-plugin-uglify';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';
import copy from 'rollup-plugin-copy';

const dev = !!process.env.ROLLUP_WATCH;

const globals = {
  leaflet: 'L',
  '@turf/area': 'turf.area',
  '@turf/length': 'turf.length',
  'lodash/template': '_.template',
};
const external = Object.keys(globals);

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/leaflet-measure.js',
    format: 'umd',
    name: 'leafletMeasure',
    globals,
    sourcemap: true,
  },
  external,
  plugins: [
    html(),
    buble(),
    !dev && uglify(),
    dev && serve('.'),
    dev && livereload(),
    copy({
      'src/assets': 'dist/assets',
      'src/styles.css': 'dist/leaflet-measure.css',
      verbose: true,
    }),
  ],
};

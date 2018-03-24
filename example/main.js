import { Map, TileLayer } from 'leaflet';
import MeasureControl from '../dist/leaflet-measure';
import '../dist/leaflet-measure.css';

// init map
const map = new Map('map', {
  center: [39.953338, -75.163471],
  zoom: 16,
});

// add tile layer
new TileLayer('//server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  minZoom: 14,
  maxZoom: 18,
  attribution: '&copy; Esri &mdash; Sources: Esri, DigitalGlobe, Earthstar Geographics, CNES/Airbus DS, GeoEye, USDA FSA, USGS, Getmapping, Aerogrid, IGN, IGP, swisstopo, and the GIS User Community'
}).addTo(map);

// add measure control
const measureControl = new MeasureControl()
measureControl.addTo(map);

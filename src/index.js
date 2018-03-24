import * as L from 'leaflet';
import template from 'lodash/template';
import units from './util/units';
import * as dom from './util/dom';
import measure from './util/measure';
import Symbology from './symbology';

// templates
import controlTemplate from './templates/control-template.html';
import resultsTemplate from './templates/results-template.html';
import pointPopupTemplate from './templates/point-popup-template.html';
import linePopupTemplate from './templates/line-popup-template.html';
import areaPopupTemplate from './templates/area-popup-template.html';

// alias element selector
const $ = dom.selectOne;

const templateSettings = {
  imports: { numberFormat: num => num.toLocaleString(num) },
  interpolate: /{{([\s\S]+?)}}/g, // mustache
};
const controlTemplateCompiled = template(controlTemplate, templateSettings);
const resultsTemplateCompiled = template(resultsTemplate, templateSettings);
const pointPopupTemplateCompiled = template(pointPopupTemplate, templateSettings);
const linePopupTemplateCompiled = template(linePopupTemplate, templateSettings);
const areaPopupTemplateCompiled = template(areaPopupTemplate, templateSettings);

const MeasureControl = L.Control.extend({
  _className: 'leaflet-control-measure',
  options: {
    units: {},
    position: 'topright',
    primaryLengthUnit: 'feet',
    // secondaryLengthUnit: 'miles',
    primaryAreaUnit: 'sqfeet',
    activeColor: '#ABE67E', // base color for map features while actively measuring
    completedColor: '#74acbd', //'#C8F2BE',  // base color for permenant features generated from completed measure
    captureZIndex: 10000, // z-index of the marker used to capture measure events
    popupOptions: {
      // standard leaflet popup options http://leafletjs.com/reference.html#popup-options
      className: 'leaflet-measure-resultpopup',
      autoPanPadding: [10, 10]
    }
  },

  initialize: function (options) {
    L.setOptions(this, options);
    const { activeColor, completedColor } = this.options;
    this._symbols = new Symbology({ activeColor, completedColor });
    this.options.units = Object.assign({}, units, this.options.units);
  },

  onAdd: function (map) {
    this._map = map;

    // arrays used to hold simple values
    this._latlngs = [];
    this._lengths = [];

    // arrays used to hold leaflet objects
    // _lengthNotations holds leaflet markers that are made with leaflet divIcons
    this._lengthNotations = [];
    // _vertexCircleMarkers holds circleMarkers
    this._vertexCircleMarkers = [];
    // _measureFeatures holds the "measureFeature" layerGroups (which hold both circle markers and icon markers)
    this._measureFeatures = [];

    this._initLayout();

    map.on('click', this._collapse, this);

    this._layer = L.layerGroup().addTo(map);

    return this._container;
  },

  onRemove: function (map) {
    map.off('click', this._collapse, this);

    map.removeLayer(this._layer);
  },

  _initLayout: function () {
    const className = this._className,
      container = (this._container = L.DomUtil.create('div', `${className} leaflet-bar`));
    // var $toggle, $start, $cancel, $undo, $finish;

    container.innerHTML = controlTemplateCompiled({
      model: {
        className: className
      }
    });

    // makes this work on IE touch devices by stopping it from firing a mouseout event when the touch is released
    container.setAttribute('aria-haspopup', true);
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    const $toggle = (this.$toggle = $('.js-toggle', container)); // collapsed content
    this.$interaction = $('.js-interaction', container); // expanded content
    const $start = $('.js-start', container); // start button
    const $cancel = $('.js-cancel', container); // cancel button
    const $undo = $('.js-undo', container);
    const $finish = $('.js-finish', container); // finish button
    this.$startPrompt = $('.js-startprompt', container); // full area with button to start measurment
    this.$measuringPrompt = $('.js-measuringprompt', container); // full area with all stuff for active measurement
    this.$startHelp = $('.js-starthelp', container); // "Start creating a measurement by adding points"
    this.$results = $('.js-results', container); // div with coordinate, linear, area results
    this.$measureTasks = $('.js-measuretasks', container); // active measure buttons container

    this._collapse();
    this._updateMeasureNotStarted();

    if (!L.Browser.android) {
      L.DomEvent.on(container, 'mouseenter', this._expand, this);
      L.DomEvent.on(container, 'mouseleave', this._collapse, this);
    }
    L.DomEvent.on($toggle, 'click', L.DomEvent.stop);
    if (L.Browser.touch) {
      L.DomEvent.on($toggle, 'click', this._expand, this);
    } else {
      L.DomEvent.on($toggle, 'focus', this._expand, this);
    }
    L.DomEvent.on($start, 'click', L.DomEvent.stop);
    L.DomEvent.on($start, 'click', this._startMeasure, this);
    L.DomEvent.on($cancel, 'click', L.DomEvent.stop);
    L.DomEvent.on($cancel, 'click', this._finishMeasure, this);
    L.DomEvent.on($undo, 'click', L.DomEvent.stop);
    L.DomEvent.on($undo, 'click', this._undoMeasure, this);
    L.DomEvent.on($finish, 'click', L.DomEvent.stop);
    L.DomEvent.on($finish, 'click', this._handleMeasureDoubleClick, this);
  },

  _expand: function () {
    dom.hide(this.$toggle);
    dom.show(this.$interaction);
  },

  _collapse: function () {
    if (!this._locked) {
      dom.hide(this.$interaction);
      dom.show(this.$toggle);
    }
  },

  // move between basic states:
  // measure not started, started/in progress but no points added, in progress and with points
  _updateMeasureNotStarted: function () {
    dom.hide(this.$startHelp);
    dom.hide(this.$results);
    dom.hide(this.$measureTasks);
    dom.hide(this.$measuringPrompt);
    dom.show(this.$startPrompt);
  },

  _updateMeasureStartedNoPoints: function () {
    dom.hide(this.$results);
    dom.show(this.$startHelp);
    dom.show(this.$measureTasks);
    dom.hide(this.$startPrompt);
    dom.show(this.$measuringPrompt);
  },

  _updateMeasureStartedWithPoints: function () {
    dom.hide(this.$startHelp);
    dom.show(this.$results);
    dom.show(this.$measureTasks);
    dom.hide(this.$startPrompt);
    dom.show(this.$measuringPrompt);
  },

  // get state vars and interface ready for measure
  _startMeasure: function () {
    this._locked = true;
    // new leaflet feature groups are created on _startMeasure
    this._measureLengths = L.featureGroup().addTo(this._layer);
    this._measureVertexes = L.featureGroup().addTo(this._layer);
    this._captureMarker = L.marker(this._map.getCenter(), {
      clickable: true,
      zIndexOffset: this.options.captureZIndex,
      opacity: 0
    }).addTo(this._layer);
    this._setCaptureMarkerIcon();

    this._captureMarker
      .on('mouseout', this._handleMapMouseOut, this)
      .on('dblclick', this._handleMeasureDoubleClick, this)
      .on('click', this._handleMeasureClick, this);

    this._map
      .on('mousemove', this._handleMeasureMove, this)
      .on('mouseout', this._handleMapMouseOut, this)
      .on('move', this._centerCaptureMarker, this)
      .on('resize', this._setCaptureMarkerIcon, this);

    L.DomEvent.on(this._container, 'mouseenter', this._handleMapMouseOut, this);

    this._updateMeasureStartedNoPoints();

    this._map.fire('measurestart', null, false);
  },

  // remove the last clicked point and notation
  _undoMeasure: function () {
    // remove last simple coordinate from _latlngs
    this._latlngs = this._latlngs.slice(0, -1);
    // remove the last length notation
    this._removeLastLengthNotation();
    // remove the last point
    this._removeLastVertex();
    if (this._latlngs.length > 0) {
      this._addMeasureArea(this._latlngs);
      this._addMeasureBoundary(this._latlngs);
      this._updateResults();
    }
    // if you undo when there are no points put down, it changes the widget back to the original info
    if (this._latlngs.length === 0) {
      this._updateMeasureStartedNoPoints();
    }
  },

  // return to state with no measure in progress, undo `this._startMeasure`
  _finishMeasure: function (isComplete) {
    let shouldDeleteLengths;
    if (isComplete === true) {
      shouldDeleteLengths = false;
    } else {
      shouldDeleteLengths = true;
    }
    // var model = _.extend({}, this._resultsModel, {
    const model = Object.assign({}, this._resultsModel, {
      points: this._latlngs
    });

    this._locked = false;

    L.DomEvent.off(this._container, 'mouseover', this._handleMapMouseOut, this);

    this._clearMeasure(shouldDeleteLengths);

    this._captureMarker
      .off('mouseout', this._handleMapMouseOut, this)
      .off('dblclick', this._handleMeasureDoubleClick, this)
      .off('click', this._handleMeasureClick, this);

    this._map
      .off('mousemove', this._handleMeasureMove, this)
      .off('mouseout', this._handleMapMouseOut, this)
      .off('move', this._centerCaptureMarker, this)
      .off('resize', this._setCaptureMarkerIcon, this);

    this._layer.removeLayer(this._measureVertexes).removeLayer(this._captureMarker);
    this._measureVertexes = null;

    this._updateMeasureNotStarted();
    this._collapse();

    this._map.fire('measurefinish', model, false);
  },

  // clear all running measure data
  _clearMeasure: function (shouldDeleteLengths) {
    this._latlngs = [];
    this._resultsModel = null;
    if (shouldDeleteLengths) {
      this._measureLengths.clearLayers();
    }
    this._measureVertexes.clearLayers();
    if (this._measureDrag) {
      this._layer.removeLayer(this._measureDrag);
    }
    if (this._measureArea) {
      this._layer.removeLayer(this._measureArea);
    }
    if (this._measureBoundary) {
      this._layer.removeLayer(this._measureBoundary);
    }
    this._measureDrag = null;
    this._measureArea = null;
    this._measureBoundary = null;
  },

  // centers the event capture marker
  _centerCaptureMarker: function () {
    this._captureMarker.setLatLng(this._map.getCenter());
  },

  // set icon on the capture marker
  _setCaptureMarkerIcon: function () {
    this._captureMarker.setIcon(
      L.divIcon({
        iconSize: this._map.getSize().multiplyBy(2)
      })
    );
  },

  // format measurements to nice display string based on units in options
  // `{ lengthDisplay: '100 Feet (0.02 Miles)', areaDisplay: ... }`
  _getMeasurementDisplayStrings: function (measurement) {
    // console.log(
    //   '_getMeasurementDisplayStrings units:',
    //   this.options.units,
    //   'primaryLengthUnit:',
    //   this.options.primaryLengthUnit,
    //   'primaryAreaUnit:',
    //   this.options.primaryAreaUnit
    // );
    const unitDefinitions = this.options.units;

    return {
      lengthDisplay: buildDisplay(
        measurement.length,
        this.options.primaryLengthUnit,
        this.options.secondaryLengthUnit,
        this.options.decPoint,
        this.options.thousandsSep
      ),
      areaDisplay: buildDisplay(
        measurement.area,
        this.options.primaryAreaUnit,
        this.options.secondaryAreaUnit,
        this.options.decPoint,
        this.options.thousandsSep
      )
    };

    function buildDisplay(val, primaryUnit, secondaryUnit, decPoint, thousandsSep) {
      let display;
      if (primaryUnit && unitDefinitions[primaryUnit]) {
        display = formatMeasure(val, unitDefinitions[primaryUnit], decPoint, thousandsSep);
        if (secondaryUnit && unitDefinitions[secondaryUnit]) {
          const formatted = formatMeasure(
            val,
            unitDefinitions[secondaryUnit],
            decPoint,
            thousandsSep
          );
          display = `${display} (${formatted})`;
        } else {
          display = formatMeasure(val, null, decPoint, thousandsSep);
        }
        return display;
      }
      return formatMeasure(val, null, decPoint, thousandsSep);
    }

    function formatMeasure(val, unit, decPoint, thousandsSep) {
      const unitDisplays = {
        acres: 'Acres',
        feet: 'Feet',
        kilometers: 'Kilometers',
        hectares: 'Hectares',
        meters: 'Meters',
        miles: 'Miles',
        sqfeet: 'Sq Feet',
        sqmeters: 'Sq Meters',
        sqmiles: 'Sq Miles',
      };

      // const u = Object.assign({ factor: 1, decimals: 0 }, unit);
      // const formattedNumber = numberFormat(
      //   val * u.factor,
      //   u.decimals,
      //   '.',
      //   ','
      // );

      const { display } = unit;
      const label = unitDisplays[display] || display;

      return [formattedNumber, label].join(' ');
    }
  },

  // format measurements to nice SHORTER display string based on units in options
  // `{ lengthDisplay: '100 ft', areaDisplay: ... }`
  _getShorterMeasurementDisplayStrings: function (measurement) {
    // console.log(
    //   '_getShorterMeasurementDisplayStrings measurement.length:',
    //   measurement.length,
    //   'this.options.primaryLengthUnit:',
    //   this.options.primaryLengthUnit,
    //   'secondaryLengthUnit:',
    //   this.options.secondaryLengthUnit
    // );
    const unitDefinitions = this.options.units;
    return {
      lengthDisplay: buildDisplay(
        measurement.length,
        this.options.primaryLengthUnit,
        this.options.secondaryLengthUnit,
        '.',
        this.options.thousandsSep
      ),
      areaDisplay: buildDisplay(
        measurement.area,
        this.options.primaryAreaUnit,
        this.options.secondaryAreaUnit,
        this.options.decPoint,
        this.options.thousandsSep
      )
    };

    function buildDisplay(val, primaryUnit, secondaryUnit, decPoint, thousandsSep) {
      let display;
      if (primaryUnit) {
        display = formatMeasure(val, unitDefinitions[primaryUnit], decPoint, thousandsSep);
        if (secondaryUnit && unitDefinitions[secondaryUnit]) {
          display =
            display +
            ' (' +
            formatMeasure(val, unitDefinitions[secondaryUnit], decPoint, thousandsSep) +
            ')';
        }
      } else {
        display = formatMeasure(val, null, decPoint, thousandsSep);
      }
      return display;
    }

    function formatMeasure(val, unit, decPoint, thousandsSep) {
      const u = Object.assign({ factor: 1, decimals: 2 }, unit);
      const formattedNumber = numberFormat(
        val * u.factor,
        u.decimals,
        '.',
        ','
      );
      return formattedNumber;
    }
  },

  // update results area of dom with calced measure from `this._latlngs`
  _updateResults: function () {
    const calced = measure(this._latlngs);
    const model = (this._resultsModel = Object.assign(
      {},
      calced,
      this._getShorterMeasurementDisplayStrings(calced),
      {
        pointCount: this._latlngs.length,
        points: this._latlngs,
        lengths: this._lengths
      }
    ));
    // console.log('_updateResults is running, calced:', calced, 'model:', model);
    this.$results.innerHTML = resultsTemplateCompiled({ model });
  },

  // mouse move handler while measure in progress
  // adds floating measure marker under cursor
  _handleMeasureMove: function (evt) {
    if (!this._measureDrag) {
      this._measureDrag = L.circleMarker(evt.latlng, this._symbols.getSymbol('measureDrag')).addTo(
        this._layer
      );
    } else {
      this._measureDrag.setLatLng(evt.latlng);
    }
    this._measureDrag.bringToFront();
  },

  // handler for both double click and clicking finish button
  // do final calc and finish out current measure, clear dom and internal state, add permanent map features
  _handleMeasureDoubleClick: function () {
    const latlngs = this._latlngs;

    const measureFeature = L.layerGroup();
    measureFeature.addTo(this._layer);
    this._measureFeatures.push(measureFeature);
    this._measureLengths.removeFrom(this._layer);
    this._measureLengths.addTo(measureFeature);
    this._finishMeasure(true);

    const lengths = [];
    for (let i = 0; i < this._lengths.length; i++) {
      lengths[i] = this._lengths[i];
    }

    if (!latlngs.length) {
      return;
    }

    if (latlngs.length > 2) {
      latlngs.push((latlngs || [])[0]);
      const count = latlngs.length;
      const previousLatLng = latlngs[count - 2];
      const lastLatLng = latlngs[count - 1];
      const bounds = L.latLngBounds(previousLatLng, lastLatLng);
      const center = bounds.getCenter();
      const pair = [previousLatLng, lastLatLng];
      const calced2 = measure(pair);
      const newNotation = this._addNewLengthNotation(center, calced2);
      newNotation.addTo(this._measureLengths);
      const j = this._lengths.length;
      lengths[j - 1] = this._lengths[j - 1];
    }

    const calced = measure(latlngs);
    let resultFeature;
    let popupContent;
    let popupContainer;
    let zoomLink;
    let deleteLink;

    if (latlngs.length === 1) {
      resultFeature = L.circleMarker(latlngs[0], this._symbols.getSymbol('resultPoint'));
      popupContent = pointPopupTemplateCompiled({
        model: calced
      });
    } else if (latlngs.length === 2) {
      resultFeature = L.polyline(latlngs, this._symbols.getSymbol('resultLine'));
      popupContent = linePopupTemplateCompiled({
        model: Object.assign({}, calced, this._getShorterMeasurementDisplayStrings(calced))
      });
    } else {
      resultFeature = L.polygon(latlngs, this._symbols.getSymbol('resultArea'));
      const resultsModel = Object.assign(
        {},
        calced,
        this._getShorterMeasurementDisplayStrings(calced),
        {
          pointCount: latlngs.length,
          points: latlngs,
          lengths: this._lengths
        }
      );
      popupContent = areaPopupTemplateCompiled({
        model: resultsModel,
      });
    }

    // clear out arrays holding values
    this._lengths = [];
    this._vertexCircleMarkers = [];

    popupContainer = L.DomUtil.create('div', '');
    popupContainer.innerHTML = popupContent;

    zoomLink = $('.js-zoomto', popupContainer);
    if (zoomLink) {
      L.DomEvent.on(zoomLink, 'click', L.DomEvent.stop);
      L.DomEvent.on(
        zoomLink,
        'click',
        function () {
          if (resultFeature.getBounds) {
            this._map.fitBounds(resultFeature.getBounds(), {
              padding: [20, 20],
              maxZoom: 17
            });
          } else if (resultFeature.getLatLng) {
            this._map.panTo(resultFeature.getLatLng());
          }
        },
        this
      );
    }

    deleteLink = $('.js-deletemarkup', popupContainer);
    if (deleteLink) {
      L.DomEvent.on(deleteLink, 'click', L.DomEvent.stop);
      L.DomEvent.on(
        deleteLink,
        'click',
        function () {
          const i = this._measureFeatures.indexOf(measureFeature);
          const selectedMeasureFeature = this._measureFeatures[i];
          selectedMeasureFeature.removeFrom(this._layer);
        },
        this
      );
    }

    resultFeature.addTo(measureFeature);
    resultFeature.bindPopup(popupContainer, this.options.popupOptions);
    if (resultFeature.getBounds) {
      resultFeature.openPopup(resultFeature.getBounds().getCenter());
    } else if (resultFeature.getLatLng) {
      resultFeature.openPopup(resultFeature.getLatLng());
    }
  },
  // handle map click during ongoing measurement
  // add new clicked point, update measure layers and results ui
  _handleMeasureClick: function (evt) {
    let latlng = this._map.mouseEventToLatLng(evt.originalEvent), // get actual latlng instead of the marker's latlng from originalEvent
      lastClick = (this._latlngs || []).slice(-1)[0],
      firstClick = (this._latlngs || [])[0],
      vertexSymbol = this._symbols.getSymbol('measureVertex');

    if (!lastClick || !latlng.equals(lastClick)) {
      // skip if same point as last click, happens on `dblclick`
      this._latlngs.push(latlng);
      this._addMeasureArea(this._latlngs);
      this._addMeasureBoundary(this._latlngs);

      this._measureVertexes.eachLayer(function (layer) {
        layer.setStyle(vertexSymbol);
        // reset all vertexes to non-active class - only last vertex is active
        // `layer.setStyle({ className: 'layer-measurevertex'})` doesn't work. https://github.com/leaflet/leaflet/issues/2662
        // set attribute on path directly
        if (layer._path) {
          layer._path.setAttribute('class', vertexSymbol.className);
        }
      });

      this._addNewVertex(latlng);
      // if there is a first click
      if (firstClick) {
        // console.log('_handleMeasureClick is running, firstClick section');
        const count = this._latlngs.length;
        const previousLatLng = this._latlngs[count - 2];
        // console.log('previousLatLng:', previousLatLng);
        const bounds = L.latLngBounds(previousLatLng, latlng);
        const center = bounds.getCenter();
        const pair = [previousLatLng, latlng];
        // console.log('calc:', calc);
        const calced = measure(pair);
        this._addNewLengthNotation(center, calced).addTo(this._measureLengths);
        // this._addNewLengthNotation(center, calced).addTo(this._measureLengths2);
      }
      if (this._measureBoundary) {
        this._measureBoundary.bringToFront();
      }
      this._measureVertexes.bringToFront();
    }
    this._updateResults();
    this._updateMeasureStartedWithPoints();
  },

  _addNewLengthNotation: function (latlng, calced) {
    const answer = this._getShorterMeasurementDisplayStrings(calced);
    const myIcon = L.divIcon({
      className: 'my-div-icon',
      html: answer.lengthDisplay
    });
    // you can set .my-div-icon styles in CSS
    const marker = L.marker(latlng, {
      icon: myIcon
    });
    this._lengths.push(answer.lengthDisplay);
    this._lengthNotations.push(marker);
    return marker;
  },

  // remove last length notation (when undo is clicked)
  _removeLastLengthNotation: function () {
    const i = this._lengthNotations.length;
    // _lengthNotations is a simple array holding leaflet markers of leaflet divIcons
    // it is used here to remove a marker from the feature group that is on the map
    if (this._lengthNotations.length > 0) {
      // _measureLengths is the leaflet feature group holding the leaflet markers of leaflet divIcons
      this._lengthNotations[i - 1].removeFrom(this._measureLengths);
    }
    // remove the icon-marker from _lengthNotations, and the simple number from _lengths
    this._lengthNotations = this._lengthNotations.slice(0, -1);
    this._lengths = this._lengths.slice(0, -1);
  },

  // handle map mouse out during ongoing measure
  // remove floating cursor vertex from map
  _handleMapMouseOut: function () {
    if (this._measureDrag) {
      this._layer.removeLayer(this._measureDrag);
      this._measureDrag = null;
    }
  },

  // add various measure graphics to map - vertex, area, boundary
  _addNewVertex: function (latlng) {
    const marker = L.circleMarker(latlng, this._symbols.getSymbol('measureVertexActive'));
    this._vertexCircleMarkers.push(marker);
    marker.addTo(this._measureVertexes);
  },

  // remove last vertex (when undo is clicked)
  _removeLastVertex: function () {
    const i = this._vertexCircleMarkers.length;
    if (this._vertexCircleMarkers.length > 0) {
      this._vertexCircleMarkers[i - 1].removeFrom(this._measureVertexes);
    }
    this._vertexCircleMarkers = this._vertexCircleMarkers.slice(0, -1);
  },

  _addMeasureArea: function (latlngs) {
    if (latlngs.length < 3) {
      if (this._measureArea) {
        this._layer.removeLayer(this._measureArea);
        this._measureArea = null;
      }
      return;
    }
    if (!this._measureArea) {
      this._measureArea = L.polygon(latlngs, this._symbols.getSymbol('measureArea')).addTo(
        this._layer
      );
    } else {
      this._measureArea.setLatLngs(latlngs);
    }
  },

  _addMeasureBoundary: function (latlngs) {
    if (latlngs.length < 2) {
      if (this._measureBoundary) {
        this._layer.removeLayer(this._measureBoundary);
        this._measureBoundary = null;
      }
      return;
    }
    if (!this._measureBoundary) {
      this._measureBoundary = L.polyline(latlngs, this._symbols.getSymbol('measureBoundary')).addTo(
        this._layer
      );
    } else {
      this._measureBoundary.setLatLngs(latlngs);
    }
  },
});

export default MeasureControl;

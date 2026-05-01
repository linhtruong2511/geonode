(function () {
  var app = document.getElementById('carbon-tracker-app');
  if (!app || typeof L === 'undefined') {
    return;
  }

  var state = {
    page: 1,
    activeAoiLayer: null,
    activeFeatureId: null,
    markerLayersById: {},
    charts: {
      timeseries: null,
      uncertainty: null,
      histogram: null,
      quality: null,
      sources: null,
      completeness: null
    }
  };

  var urls = {
    points: app.dataset.pointsUrl,
    summary: app.dataset.summaryUrl,
    aoiSummary: app.dataset.aoiSummaryUrl,
    fileDetailTemplate: app.dataset.fileDetailTemplate
  };

  var el = {
    error: document.getElementById('ct-error'),
    dateFrom: document.getElementById('ct-date-from'),
    dateTo: document.getElementById('ct-date-to'),
    granularity: document.getElementById('ct-granularity'),
    pageSize: document.getElementById('ct-page-size'),
    refresh: document.getElementById('ct-refresh'),
    clearAoi: document.getElementById('ct-clear-aoi'),
    mapScope: document.getElementById('ct-map-scope'),
    tableBody: document.getElementById('ct-table-body'),
    tableTotal: document.getElementById('ct-table-total'),
    showingFrom: document.getElementById('ct-showing-from'),
    showingTo: document.getElementById('ct-showing-to'),
    currentPage: document.getElementById('ct-current-page'),
    totalPages: document.getElementById('ct-total-pages'),
    prevPage: document.getElementById('ct-prev-page'),
    nextPage: document.getElementById('ct-next-page'),
    summaryCount: document.getElementById('ct-summary-count'),
    summaryCountSub: document.getElementById('ct-summary-count-sub'),
    summaryAvg: document.getElementById('ct-summary-avg'),
    summaryRangeValue: document.getElementById('ct-summary-range-value'),
    summaryRangeSub: document.getElementById('ct-summary-range-sub'),
    summaryUncertainty: document.getElementById('ct-summary-uncertainty'),
    summaryUncertaintySub: document.getElementById('ct-summary-uncertainty-sub'),
    summaryQualityRatio: document.getElementById('ct-summary-quality-ratio'),
    summaryFiles: document.getElementById('ct-summary-files'),
    summaryFolders: document.getElementById('ct-summary-folders'),
    // summaryMetadata: document.getElementById('ct-summary-metadata'),
    // summaryMetadataSub: document.getElementById('ct-summary-metadata-sub'),
    summaryDays: document.getElementById('ct-summary-days'),
    summaryRange: document.getElementById('ct-summary-range'),
    timeFirst: document.getElementById('ct-time-first'),
    timeLatest: document.getElementById('ct-time-latest'),
    timeDays: document.getElementById('ct-time-days'),
    latRange: document.getElementById('ct-lat-range'),
    lngRange: document.getElementById('ct-lng-range'),
    topDays: document.getElementById('ct-top-days'),
    insightUncertainty: document.getElementById('ct-insight-uncertainty'),
    insightQualityReady: document.getElementById('ct-insight-quality-ready'),
    insightSource: document.getElementById('ct-insight-source'),
    insightFolder: document.getElementById('ct-insight-folder'),
    insightMetadata: document.getElementById('ct-insight-metadata'),
    topFolders: document.getElementById('ct-top-folders'),
    fileModal: document.getElementById('ct-file-modal'),
    fileModalClose: document.getElementById('ct-file-modal-close'),
    fileModalDismiss: document.getElementById('ct-file-modal-dismiss'),
    fileModalTitle: document.getElementById('ct-file-modal-title'),
    fileModalSubtitle: document.getElementById('ct-file-modal-subtitle'),
    fileModalBody: document.getElementById('ct-file-modal-body')
  };

  var vietnamBounds = parseBounds(app.dataset.vietnamBounds);
  var map = L.map('carbon-map', {
    center: [16.2, 106.2],
    zoom: 6,
    minZoom: 5,
    preferCanvas: true,
    maxBounds: vietnamBounds || null,
    maxBoundsViscosity: 0.8
  });

  if (vietnamBounds) {
    map.fitBounds(vietnamBounds, { padding: [8, 8] });
  }

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  var pointLayer = L.geoJSON(null, {
    pointToLayer: function (feature, latlng) {
      var props = feature.properties || {};
      return L.circleMarker(latlng, getMarkerStyle(props));
    },
    onEachFeature: function (feature, layer) {
      var props = feature.properties || {};
      var featureId = normalizeFeatureId(feature);
      layer.featureId = featureId;
      state.markerLayersById[featureId] = layer;
      layer.on('click', function () {
        focusFeature(featureId);
      });
      layer.bindPopup(buildPopupHtml(feature));
    }
  }).addTo(map);

  var drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  if (L.Control && L.Control.Draw) {
    map.addControl(new L.Control.Draw({
      draw: {
        marker: false,
        circlemarker: false,
        circle: false,
        polyline: false,
        rectangle: true,
        polygon: {
          allowIntersection: false,
          showArea: true
        }
      },
      edit: {
        featureGroup: drawnItems,
        remove: true
      }
    }));
    labelDrawToolbarButtons();
  }

  if (L.Draw && L.Draw.Event) {
    map.on(L.Draw.Event.CREATED, function (event) {
      drawnItems.clearLayers();
      drawnItems.addLayer(event.layer);
      state.activeAoiLayer = event.layer;
      state.page = 1;
      el.clearAoi.disabled = false;
      refreshAll();
    });

    map.on(L.Draw.Event.EDITED, function () {
      state.page = 1;
      refreshAll();
    });

    map.on(L.Draw.Event.DELETED, function () {
      state.activeAoiLayer = null;
      state.page = 1;
      el.clearAoi.disabled = true;
      refreshAll();
    });
  }

  var legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    var div = L.DomUtil.create('div', 'ct-legend');
    div.innerHTML = '<strong>XCO2 ppm</strong>' +
      legendRow('#1d4ed8', '< 405') +
      legendRow('#0f9d58', '405 - 415') +
      legendRow('#f59e0b', '415 - 425') +
      legendRow('#dc2626', '>= 425');
    return div;
  };
  legend.addTo(map);

  function parseBounds(text) {
    if (!text) {
      return null;
    }
    var numbers = String(text).split(',').map(function (value) {
      return Number(value);
    });
    if (numbers.length !== 4 || numbers.some(function (value) { return !Number.isFinite(value); })) {
      return null;
    }
    return L.latLngBounds([numbers[0], numbers[1]], [numbers[2], numbers[3]]);
  }

  function legendRow(color, label) {
    return '<div class="ct-legend-row"><span class="ct-swatch" style="background:' + color + '"></span>' + label + '</div>';
  }

  function normalizeFeatureId(feature) {
    var props = feature.properties || {};
    var rawId = feature.id || props.sounding_id || feature.sounding_id;
    return rawId === undefined || rawId === null ? '' : String(rawId);
  }

  function getXco2Color(value) {
    if (!Number.isFinite(value)) {
      return '#64748b';
    }
    if (value < 405) {
      return '#1d4ed8';
    }
    if (value < 415) {
      return '#0f9d58';
    }
    if (value < 425) {
      return '#f59e0b';
    }
    return '#dc2626';
  }

  function getMarkerStyle(props) {
    var color = getXco2Color(Number(props.xco2));
    var quality = Number(props.xco2_quality_flag);
    var isGood = Number.isFinite(quality) && quality === 0;
    return {
      radius: isGood ? 5 : 4,
      color: color,
      weight: isGood ? 1.2 : 1,
      fillColor: color,
      fillOpacity: isGood ? 0.78 : 0.42
    };
  }

  function getActiveMarkerStyle() {
    return {
      radius: 8,
      color: '#111827',
      weight: 2,
      fillColor: '#f97316',
      fillOpacity: 0.95
    };
  }

  function buildPopupHtml(feature) {
    var props = feature.properties || {};
    return '<div>' +
      '<strong>ID:</strong> ' + escapeHtml(normalizeFeatureId(feature)) + '<br>' +
      '<strong>XCO2:</strong> ' + escapeHtml(formatNumber(props.xco2, 2)) + ' ppm<br>' +
      '<strong>Uncertainty:</strong> ' + escapeHtml(formatNumber(props.xco2_uncertainty, 2)) + '<br>' +
      '<strong>Quality:</strong> ' + escapeHtml(formatQualityFlag(props.xco2_quality_flag)) + '<br>' +
      '<strong>Thoi gian:</strong> ' + escapeHtml(formatDateTime(props.acquisition_time)) + '<br>' +
      '<strong>File:</strong> ' + escapeHtml(shortFileName(props.source_file || '-')) + '<br>' +
      '<strong>Thu muc:</strong> ' + escapeHtml(shortLabel(props.source_folder || '-', 28)) +
    '</div>';
  }

  function getCsrfToken() {
    var match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function setLoading(isLoading) {
    el.refresh.disabled = isLoading;
    el.refresh.innerHTML = isLoading
      ? '<i class="fa fa-spinner fa-spin"></i> Dang tai'
      : '<i class="fa fa-refresh"></i> Cap nhat';
  }

  function showError(message) {
    el.error.textContent = message;
    el.error.style.display = 'block';
  }

  function clearError() {
    el.error.textContent = '';
    el.error.style.display = 'none';
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatNumber(value, digits) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return '-';
    }
    return number.toLocaleString('vi-VN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function formatInteger(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return '0';
    }
    return number.toLocaleString('vi-VN');
  }

  function formatPercent(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return '-';
    }
    return number.toLocaleString('vi-VN', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }) + '%';
  }

  function formatDate(value) {
    if (!value) {
      return '-';
    }
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString('vi-VN');
  }

  function formatDateTime(value) {
    if (!value) {
      return '-';
    }
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString('vi-VN');
  }

  function formatPlainValue(value) {
    return value === null || value === undefined || value === '' ? '-' : String(value);
  }

  function formatQualityFlag(value) {
    if (value === null || value === undefined || value === '') {
      return 'Khong gan co';
    }
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return String(value);
    }
    if (number === 0) {
      return '0 (tot)';
    }
    return String(number);
  }

  function shortFileName(value) {
    if (!value) {
      return '-';
    }
    var normalized = String(value).replaceAll('\\', '/');
    var parts = normalized.split('/');
    return parts[parts.length - 1] || normalized;
  }

  function shortLabel(value, maxLength) {
    if (value === null || value === undefined) {
      return '-';
    }
    var text = String(value);
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - 3) + '...';
  }

  function qualityBadgeClass(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return 'muted';
    }
    return number === 0 ? 'ok' : 'warn';
  }

  function buildQualityBadge(value) {
    return '<span class="ct-pill ' + qualityBadgeClass(value) + '">' +
      escapeHtml(formatQualityFlag(value)) +
      '</span>';
  }

  function clearActiveFeature() {
    if (!state.activeFeatureId) {
      return;
    }
    var previousLayer = state.markerLayersById[state.activeFeatureId];
    if (previousLayer && previousLayer.setStyle) {
      previousLayer.setStyle(getMarkerStyle((previousLayer.feature && previousLayer.feature.properties) || {}));
    }
    var previousRow = el.tableBody.querySelector('tr[data-id="' + state.activeFeatureId + '"]');
    if (previousRow) {
      previousRow.classList.remove('is-active');
    }
    state.activeFeatureId = null;
  }

  function scrollRowIntoView(row) {
    if (!row) {
      return;
    }
    var tableWrap = row.closest('.ct-table-wrap');
    if (!tableWrap) {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    var rowTop = row.offsetTop;
    var rowBottom = rowTop + row.offsetHeight;
    var visibleTop = tableWrap.scrollTop;
    var visibleBottom = visibleTop + tableWrap.clientHeight;
    if (rowTop < visibleTop || rowBottom > visibleBottom) {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function focusFeature(featureId, options) {
    if (!featureId) {
      return;
    }
    var layer = state.markerLayersById[String(featureId)];
    if (!layer) {
      return;
    }
    options = options || {};
    clearActiveFeature();
    state.activeFeatureId = String(featureId);
    if (layer.setStyle) {
      layer.setStyle(getActiveMarkerStyle());
    }
    var targetRow = el.tableBody.querySelector('tr[data-id="' + state.activeFeatureId + '"]');
    if (targetRow) {
      targetRow.classList.add('is-active');
      scrollRowIntoView(targetRow);
    }
    if (!options.skipFly && layer.getLatLng) {
      map.flyTo(layer.getLatLng(), Math.max(map.getZoom(), 11), {
        animate: true,
        duration: 0.5
      });
    }
    if (layer.openPopup) {
      layer.openPopup();
    }
  }

  function labelDrawToolbarButtons() {
    var buttons = [
      { selector: '.leaflet-draw-draw-polygon', label: 'P', title: 'Ve vung da giac' },
      { selector: '.leaflet-draw-draw-rectangle', label: 'R', title: 'Ve vung hinh chu nhat' },
      { selector: '.leaflet-draw-edit-edit', label: 'E', title: 'Chinh sua AOI' },
      { selector: '.leaflet-draw-edit-remove', label: 'X', title: 'Xoa AOI' }
    ];
    buttons.forEach(function (item) {
      var button = document.querySelector(item.selector);
      if (!button) {
        return;
      }
      button.classList.add('ct-draw-button');
      button.innerHTML = '<span class="ct-draw-label">' + item.label + '</span>';
      button.setAttribute('title', item.title);
      button.setAttribute('aria-label', item.title);
    });
  }

  function getDateParams() {
    var params = new URLSearchParams();
    if (el.dateFrom.value) {
      params.set('date_from', el.dateFrom.value);
    }
    if (el.dateTo.value) {
      params.set('date_to', el.dateTo.value);
    }
    params.set('granularity', el.granularity.value || 'day');
    return params;
  }

  function getBoundsForQuery() {
    var bounds = state.activeAoiLayer ? state.activeAoiLayer.getBounds() : map.getBounds();
    return {
      sw: bounds.getSouthWest(),
      ne: bounds.getNorthEast()
    };
  }

  function addBoundsParams(params) {
    var bounds = getBoundsForQuery();
    params.set('sw_lat', bounds.sw.lat);
    params.set('sw_lng', bounds.sw.lng);
    params.set('ne_lat', bounds.ne.lat);
    params.set('ne_lng', bounds.ne.lng);
  }

  function getCurrentAoiGeoJSON() {
    if (!state.activeAoiLayer) {
      return null;
    }
    return state.activeAoiLayer.toGeoJSON().geometry;
  }

  async function fetchJson(url, options) {
    var response = await fetch(url, options || {});
    var payload = await response.json().catch(function () {
      return {};
    });
    if (!response.ok) {
      var detail = payload.detail || payload.bbox || payload.date_to || payload.date_from || 'Khong the tai du lieu.';
      if (typeof detail === 'object') {
        detail = Object.values(detail).join(' ');
      }
      throw new Error(detail);
    }
    return payload;
  }

  async function loadPoints() {
    var params = getDateParams();
    addBoundsParams(params);
    params.set('page', state.page);
    params.set('page_size', el.pageSize.value || '500');
    var payload = await fetchJson(urls.points + '?' + params.toString(), {
      headers: { Accept: 'application/json' }
    });
    renderPoints(payload);
    renderTable(payload);
  }

  async function loadReport() {
    var params = getDateParams();
    var payload;
    if (state.activeAoiLayer) {
      payload = await fetchJson(urls.aoiSummary + '?' + params.toString(), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify(getCurrentAoiGeoJSON())
      });
      el.mapScope.textContent = 'AOI dang chon';
      el.mapScope.className = 'label label-success';
    } else {
      addBoundsParams(params);
      payload = await fetchJson(urls.summary + '?' + params.toString(), {
        headers: { Accept: 'application/json' }
      });
      el.mapScope.textContent = 'Khung nhin hien tai';
      el.mapScope.className = 'label label-info';
    }
    renderSummary(payload);
    renderCharts(payload);
    renderTimeUtility(payload);
    renderInsights(payload);
  }

  async function refreshAll() {
    clearError();
    setLoading(true);
    try {
      await Promise.all([loadPoints(), loadReport()]);
    } catch (error) {
      showError(error.message || 'Co loi khi tai du lieu.');
    } finally {
      setLoading(false);
    }
  }

  function renderPoints(geojson) {
    var selectedId = state.activeFeatureId;
    clearActiveFeature();
    state.markerLayersById = {};
    pointLayer.clearLayers();
    pointLayer.addData(geojson);
    if (selectedId && state.markerLayersById[selectedId]) {
      focusFeature(selectedId, { skipFly: true });
    }
  }

  function renderTable(payload) {
    var features = payload.features || [];
    var total = Number(payload.count || 0);
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.page_size || el.pageSize.value || 500);
    var totalPages = Number(payload.total_pages || 1);
    var showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
    var showingTo = Math.min(page * pageSize, total);

    el.tableTotal.textContent = formatInteger(total);
    el.showingFrom.textContent = formatInteger(showingFrom);
    el.showingTo.textContent = formatInteger(showingTo);
    el.currentPage.textContent = formatInteger(page);
    el.totalPages.textContent = formatInteger(totalPages);
    el.prevPage.disabled = page <= 1;
    el.nextPage.disabled = page >= totalPages || total === 0;

    if (!features.length) {
      el.tableBody.innerHTML = '<tr><td colspan="8" class="text-muted text-center">Khong co du lieu trong pham vi loc</td></tr>';
      return;
    }

    el.tableBody.innerHTML = features.map(function (feature) {
      var props = feature.properties || {};
      var featureId = normalizeFeatureId(feature);
      return '<tr class="ct-table-row" data-id="' + escapeHtml(featureId) + '">' +
        '<td>' + escapeHtml(featureId) + '</td>' +
        '<td>' + escapeHtml(formatDateTime(props.acquisition_time)) + '</td>' +
        '<td>' + escapeHtml(formatNumber(props.xco2, 2)) + '</td>' +
        '<td>' + escapeHtml(formatNumber(props.xco2_uncertainty, 2)) + '</td>' +
        '<td>' + buildQualityBadge(props.xco2_quality_flag) + '</td>' +
        '<td title="' + escapeHtml(props.source_file || '-') + '">' + escapeHtml(shortLabel(shortFileName(props.source_file), 30)) + '</td>' +
        '<td title="' + escapeHtml(props.source_folder || '-') + '">' + escapeHtml(shortLabel(props.source_folder || '-', 26)) + '</td>' +
        '<td><button type="button" class="ct-link-button" data-file-detail="' + escapeHtml(featureId) + '">Mo file</button></td>' +
      '</tr>';
    }).join('');

    Array.prototype.forEach.call(el.tableBody.querySelectorAll('.ct-table-row'), function (row) {
      row.addEventListener('click', function (event) {
        if (event.target && event.target.matches('[data-file-detail]')) {
          return;
        }
        focusFeature(row.getAttribute('data-id'));
      });
    });

    Array.prototype.forEach.call(el.tableBody.querySelectorAll('[data-file-detail]'), function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        openFileDetail(button.getAttribute('data-file-detail'));
      });
    });

    if (state.activeFeatureId) {
      var activeRow = el.tableBody.querySelector('tr[data-id="' + state.activeFeatureId + '"]');
      if (activeRow) {
        activeRow.classList.add('is-active');
      }
    }
  }

  function renderSummary(payload) {
    var summary = payload.summary || {};
    el.summaryCount.textContent = formatInteger(summary.total_records);
    el.summaryCountSub.textContent = state.activeAoiLayer ? 'Tong trong AOI' : 'Tong trong khung nhin';
    el.summaryAvg.textContent = formatNumber(summary.xco2_avg, 2);
    el.summaryRangeValue.textContent = formatNumber(summary.xco2_min, 2) + ' - ' + formatNumber(summary.xco2_max, 2);
    el.summaryRangeSub.textContent = 'Do lech chuan ' + formatNumber(summary.xco2_stddev, 2);
    el.summaryUncertainty.textContent = formatNumber(summary.uncertainty_avg, 2);
    el.summaryUncertaintySub.textContent = summary.uncertainty_max !== null && summary.uncertainty_max !== undefined
      ? 'San sang ' + formatPercent(summary.uncertainty_known_ratio) + ', lon nhat ' + formatNumber(summary.uncertainty_max, 2)
      : 'Khong co uncertainty';
    el.summaryQualityRatio.textContent = formatPercent(summary.quality_good_ratio);
    el.summaryFiles.textContent = formatInteger(summary.unique_source_files);
    el.summaryFolders.textContent = formatInteger(summary.unique_source_folders) + ' thu muc nguon';
    // el.summaryMetadata.textContent = formatPercent(((summary.operation_mode_known_ratio || 0) + (summary.orbit_known_ratio || 0)) / 2);
    // el.summaryMetadataSub.textContent = 'Mode ' + formatPercent(summary.operation_mode_known_ratio) + ' | Orbit ' + formatPercent(summary.orbit_known_ratio);
    el.summaryDays.textContent = formatInteger(summary.active_days);
    el.summaryRange.textContent = formatDate(summary.first_acquisition_time) + ' - ' + formatDate(summary.latest_acquisition_time);
  }

  function renderTimeUtility(payload) {
    var summary = payload.summary || {};
    el.timeFirst.textContent = formatDateTime(summary.first_acquisition_time);
    el.timeLatest.textContent = formatDateTime(summary.latest_acquisition_time);
    el.timeDays.textContent = formatInteger(summary.active_days);
    el.latRange.textContent = summary.latitude_min !== null && summary.latitude_max !== null
      ? formatNumber(summary.latitude_min, 4) + ' -> ' + formatNumber(summary.latitude_max, 4)
      : '-';
    el.lngRange.textContent = summary.longitude_min !== null && summary.longitude_max !== null
      ? formatNumber(summary.longitude_min, 4) + ' -> ' + formatNumber(summary.longitude_max, 4)
      : '-';

    var rows = payload.top_days || [];
    if (!rows.length) {
      el.topDays.innerHTML = '<li class="ct-empty">Chua co du lieu</li>';
    } else {
      el.topDays.innerHTML = rows.map(function (row) {
        return '<li><strong>' + escapeHtml(formatDate(row.date)) + '</strong>: ' +
          escapeHtml(formatInteger(row.count)) + ' diem, XCO2 TB ' +
          escapeHtml(formatNumber(row.xco2_avg, 2)) +
          ', uncertainty TB ' + escapeHtml(formatNumber(row.uncertainty_avg, 2)) +
          '</li>';
      }).join('');
    }
  }

  function renderInsights(payload) {
    var summary = payload.summary || {};
    var insights = payload.insights || {};
    var sourceFolders = payload.source_folders || [];
    el.insightUncertainty.textContent = formatInteger(summary.uncertainty_known_count) +
      ' / ' + formatInteger(summary.total_records) + ' (' + formatPercent(summary.uncertainty_known_ratio) + ')';
    el.insightQualityReady.textContent = formatInteger(summary.quality_known_count) +
      ' / ' + formatInteger(summary.total_records) + ' (' + formatPercent(summary.total_records ? ((summary.quality_known_count || 0) / summary.total_records) * 100 : null) + ')';
    el.insightSource.textContent = insights.dominant_source_file
      ? shortLabel(shortFileName(insights.dominant_source_file.source_file), 28) + ' (' + formatInteger(insights.dominant_source_file.count) + ')'
      : '-';
    el.insightFolder.textContent = insights.dominant_source_folder
      ? shortLabel(insights.dominant_source_folder.source_folder, 28) + ' (' + formatInteger(insights.dominant_source_folder.count) + ')'
      : '-';
    el.insightMetadata.textContent =
      'Mode ' + formatInteger(summary.operation_mode_known_count) +
      ', Orbit ' + formatInteger(summary.orbit_known_count);

    if (!sourceFolders.length) {
      el.topFolders.innerHTML = '<li class="ct-empty">Chua co du lieu</li>';
      return;
    }
    el.topFolders.innerHTML = sourceFolders.map(function (row) {
      return '<li><strong>' + escapeHtml(shortLabel(row.source_folder, 42)) + '</strong>: ' +
        escapeHtml(formatInteger(row.count)) + ' diem, XCO2 TB ' +
        escapeHtml(formatNumber(row.xco2_avg, 2)) +
        '</li>';
    }).join('');
  }

  function destroyChart(name) {
    if (state.charts[name]) {
      state.charts[name].destroy();
      state.charts[name] = null;
    }
  }

  function renderCharts(payload) {
    renderTimeseriesChart(payload.timeseries || []);
    renderUncertaintyChart(payload.timeseries || []);
    renderHistogramChart(payload.histogram || {});
    renderQualityChart(payload.quality_breakdown || []);
    renderSourceChart(payload.top_sources || []);
    renderCompletenessChart(payload.data_completeness || []);
  }

  function renderTimeseriesChart(rows) {
    destroyChart('timeseries');
    var ctx = document.getElementById('ct-timeseries-chart');
    if (!ctx || typeof Chart === 'undefined') {
      return;
    }
    state.charts.timeseries = new Chart(ctx, {
      data: {
        labels: rows.map(function (row) { return formatDate(row.period); }),
        datasets: [
          {
            type: 'bar',
            label: 'So diem do',
            data: rows.map(function (row) { return row.count; }),
            backgroundColor: 'rgba(2, 132, 199, .25)',
            borderColor: '#0284c7',
            yAxisID: 'yCount'
          },
          {
            type: 'line',
            label: 'XCO2 trung binh (ppm)',
            data: rows.map(function (row) { return row.xco2_avg; }),
            borderColor: '#1d4ed8',
            backgroundColor: 'rgba(29, 78, 216, .12)',
            borderWidth: 2,
            fill: true,
            tension: .24,
            yAxisID: 'yXco2'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' } },
        scales: {
          yXco2: {
            position: 'left',
            title: { display: true, text: 'Gia tri XCO2 / uncertainty' }
          },
          yCount: {
            position: 'right',
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            ticks: { precision: 0 }
          }
        }
      }
    });
  }

  function renderUncertaintyChart(rows) {
    destroyChart('uncertainty');
    var ctx = document.getElementById('ct-uncertainty-chart');
    if (!ctx || typeof Chart === 'undefined') {
      return;
    }
    state.charts.uncertainty = new Chart(ctx, {
      data: {
        labels: rows.map(function (row) { return formatDate(row.period); }),
        datasets: [
          {
            type: 'line',
            label: 'Uncertainty trung binh',
            data: rows.map(function (row) { return row.uncertainty_avg; }),
            borderColor: '#d97706',
            backgroundColor: 'rgba(217, 119, 6, .15)',
            borderWidth: 2,
            fill: true,
            tension: .24,
            yAxisID: 'y'
          },
          {
            type: 'bar',
            label: 'Ti le quality tot (%)',
            data: rows.map(function (row) { return row.quality_good_ratio; }),
            backgroundColor: 'rgba(22, 163, 74, .18)',
            borderColor: '#16a34a',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom' } },
        scales: {
          y: {
            position: 'left',
            beginAtZero: true,
            title: { display: true, text: 'Uncertainty' }
          },
          y1: {
            position: 'right',
            beginAtZero: true,
            suggestedMax: 100,
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Ti le quality tot (%)' }
          }
        }
      }
    });
  }

  function renderHistogramChart(histogram) {
    destroyChart('histogram');
    var ctx = document.getElementById('ct-histogram-chart');
    if (!ctx || typeof Chart === 'undefined') {
      return;
    }
    state.charts.histogram = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: histogram.labels || [],
        datasets: [{
          label: histogram.sampled ? 'So diem do (mau)' : 'So diem do',
          data: histogram.values || [],
          backgroundColor: '#f59e0b',
          borderColor: '#d97706',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderQualityChart(rows) {
    destroyChart('quality');
    var ctx = document.getElementById('ct-quality-chart');
    if (!ctx || typeof Chart === 'undefined') {
      return;
    }
    state.charts.quality = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: rows.map(function (row) { return row.label; }),
        datasets: [{
          data: rows.map(function (row) { return row.value; }),
          backgroundColor: ['#16a34a', '#f59e0b', '#64748b', '#dc2626', '#7c3aed', '#0f766e']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  function renderSourceChart(rows) {
    destroyChart('sources');
    var ctx = document.getElementById('ct-source-chart');
    if (!ctx || typeof Chart === 'undefined') {
      return;
    }
    state.charts.sources = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map(function (row) { return shortLabel(shortFileName(row.source_file), 24); }),
        datasets: [{
          label: 'So diem do',
          data: rows.map(function (row) { return row.count; }),
          backgroundColor: '#334155',
          borderColor: '#1e293b',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  function renderCompletenessChart(rows) {
    destroyChart('completeness');
    var ctx = document.getElementById('ct-completeness-chart');
    if (!ctx || typeof Chart === 'undefined') {
      return;
    }
    state.charts.completeness = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map(function (row) { return row.label; }),
        datasets: [{
          label: 'Ti le san sang (%)',
          data: rows.map(function (row) { return row.ratio; }),
          backgroundColor: ['#d97706', '#16a34a', '#94a3b8', '#94a3b8'],
          borderColor: ['#b45309', '#15803d', '#64748b', '#64748b'],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: 100,
            ticks: {
              callback: function (value) { return value + '%'; }
            }
          }
        }
      }
    });
  }

  function toInputDate(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function setQuickRange(days) {
    var anchor = app.dataset.latestDate ? new Date(app.dataset.latestDate + 'T00:00:00') : new Date();
    var from = new Date(anchor.getTime());
    from.setDate(anchor.getDate() - Number(days) + 1);
    el.dateFrom.value = toInputDate(from);
    el.dateTo.value = toInputDate(anchor);
    state.page = 1;
    refreshAll();
  }

  function initializeDefaultDateRange() {
    if (el.dateFrom.value || !el.dateTo.value) {
      return;
    }
    var anchor = new Date(el.dateTo.value + 'T00:00:00');
    if (Number.isNaN(anchor.getTime())) {
      return;
    }
    var from = new Date(anchor.getTime());
    from.setDate(anchor.getDate() - 29);
    el.dateFrom.value = toInputDate(from);
  }

  function openModal() {
    el.fileModal.classList.add('is-open');
    el.fileModal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    el.fileModal.classList.remove('is-open');
    el.fileModal.setAttribute('aria-hidden', 'true');
  }

  function buildTableFromRows(rows, headings) {
    if (!rows.length) {
      return '<div class="ct-empty">Khong co du lieu.</div>';
    }
    return '<table class="ct-meta-table"><thead><tr>' +
      headings.map(function (heading) { return '<th>' + escapeHtml(heading) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.join('') +
      '</tbody></table>';
  }

  function buildAttrTable(rows) {
    return buildTableFromRows(
      (rows || []).map(function (row) {
        return '<tr><td>' + escapeHtml(row.key) + '</td><td>' + escapeHtml(formatPlainValue(row.value)) + '</td></tr>';
      }),
      ['Thuoc tinh', 'Gia tri']
    );
  }

  function buildArrayTable(rows) {
    return buildTableFromRows(
      (rows || []).map(function (row) {
        return '<tr>' +
          '<td>' + escapeHtml(row.name) + '</td>' +
          '<td>' + escapeHtml(row.dtype) + '</td>' +
          '<td>' + escapeHtml((row.dims || []).join(', ') || '-') + '</td>' +
          '<td>' + escapeHtml((row.shape || []).join(' x ') || '-') + '</td>' +
          '<td>' + escapeHtml(formatInteger(row.size)) + '</td>' +
          '<td>' + escapeHtml((row.attrs || []).slice(0, 2).map(function (attr) {
            return attr.key + ': ' + formatPlainValue(attr.value);
          }).join(' | ') || '-') + '</td>' +
        '</tr>';
      }),
      ['Ten', 'Kieu', 'Dims', 'Shape', 'So phan tu', 'Attrs chinh']
    );
  }

  async function openFileDetail(soundingId) {
    if (!soundingId) {
      return;
    }
    openModal();
    el.fileModalSubtitle.textContent = 'Dang doc file nguon cho ban ghi ' + soundingId;
    el.fileModalBody.innerHTML = '<div class="ct-empty">Dang mo file .nc4 bang xarray...</div>';

    try {
      var url = urls.fileDetailTemplate.replace('/0/', '/' + encodeURIComponent(soundingId) + '/');
      var payload = await fetchJson(url, {
        headers: { Accept: 'application/json' }
      });
      renderFileModal(payload);
    } catch (error) {
      el.fileModalBody.innerHTML = '<div class="alert alert-danger">Khong the doc file: ' + escapeHtml(error.message || 'Unknown error') + '</div>';
    }
  }

  function renderFileModal(payload) {
    var record = payload.record || {};
    var fileInfo = payload.file || {};
    var dataset = payload.dataset || {};
    el.fileModalTitle.textContent = 'Chi tiet file nguon .nc4';
    el.fileModalSubtitle.textContent = shortFileName(fileInfo.name || record.source_file || '-') + ' | ID ' + formatPlainValue(record.sounding_id);

    var recordRows = [
      '<tr><td>ID</td><td>' + escapeHtml(formatPlainValue(record.sounding_id)) + '</td></tr>',
      '<tr><td>Thoi gian</td><td>' + escapeHtml(formatDateTime(record.acquisition_time)) + '</td></tr>',
      '<tr><td>XCO2</td><td>' + escapeHtml(formatNumber(record.xco2, 2)) + ' ppm</td></tr>',
      '<tr><td>Uncertainty</td><td>' + escapeHtml(formatNumber(record.xco2_uncertainty, 2)) + '</td></tr>',
      '<tr><td>Quality flag</td><td>' + escapeHtml(formatQualityFlag(record.xco2_quality_flag)) + '</td></tr>',
      '<tr><td>Operation mode</td><td>' + escapeHtml(formatPlainValue(record.operation_mode)) + '</td></tr>',
      '<tr><td>Orbit</td><td>' + escapeHtml(formatPlainValue(record.orbit)) + '</td></tr>',
      '<tr><td>Vi do / Kinh do</td><td>' + escapeHtml(formatNumber(record.latitude, 5)) + ' / ' + escapeHtml(formatNumber(record.longitude, 5)) + '</td></tr>'
    ];

    var fileRows = [
      '<tr><td>Duong dan file</td><td>' + escapeHtml(formatPlainValue(fileInfo.resolved_path)) + '</td></tr>',
      '<tr><td>Kich thuoc</td><td>' + escapeHtml(formatInteger(fileInfo.size_bytes)) + ' bytes</td></tr>',
      '<tr><td>Cap nhat file</td><td>' + escapeHtml(formatDateTime(fileInfo.modified_at)) + '</td></tr>',
      '<tr><td>Source folder</td><td>' + escapeHtml(formatPlainValue(record.source_folder)) + '</td></tr>',
      '<tr><td>Dimensions</td><td>' + escapeHtml((dataset.dims || []).map(function (row) {
        return row.name + ': ' + formatInteger(row.size);
      }).join(' | ') || '-') + '</td></tr>'
    ];

    var rawMetadataText = record.raw_metadata
      ? JSON.stringify(record.raw_metadata, null, 2)
      : 'Khong co raw_metadata';

    el.fileModalBody.innerHTML =
      '<div class="ct-modal-section">' +
        '<div class="ct-modal-grid">' +
          '<div><h6>Thong tin ban ghi</h6>' + buildTableFromRows(recordRows, ['Truong', 'Gia tri']) + '</div>' +
          '<div><h6>Thong tin tep</h6>' + buildTableFromRows(fileRows, ['Truong', 'Gia tri']) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ct-modal-section">' +
        '<div class="ct-modal-grid">' +
          '<div><h6>Global attributes</h6>' + buildAttrTable(dataset.attributes || []) + '</div>' +
          '<div><h6>Raw metadata</h6><pre class="ct-pre">' + escapeHtml(rawMetadataText) + '</pre></div>' +
        '</div>' +
      '</div>' +
      '<div class="ct-modal-section">' +
        '<h6>Coordinates</h6>' +
        buildArrayTable(dataset.coordinates || []) +
      '</div>' +
      '<div class="ct-modal-section">' +
        '<h6>Data variables</h6>' +
        buildArrayTable(dataset.data_variables || []) +
      '</div>';
  }

  el.refresh.addEventListener('click', function () {
    state.page = 1;
    refreshAll();
  });

  el.prevPage.addEventListener('click', function () {
    if (state.page > 1) {
      state.page -= 1;
      clearError();
      setLoading(true);
      loadPoints().catch(function (error) {
        showError(error.message || 'Co loi khi tai du lieu.');
      }).finally(function () {
        setLoading(false);
      });
    }
  });

  el.nextPage.addEventListener('click', function () {
    state.page += 1;
    clearError();
    setLoading(true);
    loadPoints().catch(function (error) {
      state.page -= 1;
      showError(error.message || 'Co loi khi tai du lieu.');
    }).finally(function () {
      setLoading(false);
    });
  });

  el.pageSize.addEventListener('change', function () {
    state.page = 1;
    refreshAll();
  });

  el.granularity.addEventListener('change', function () {
    state.page = 1;
    refreshAll();
  });

  el.clearAoi.addEventListener('click', function () {
    drawnItems.clearLayers();
    state.activeAoiLayer = null;
    clearActiveFeature();
    state.page = 1;
    el.clearAoi.disabled = true;
    refreshAll();
  });

  Array.prototype.forEach.call(document.querySelectorAll('.ct-quick-range'), function (button) {
    button.addEventListener('click', function () {
      setQuickRange(button.dataset.days);
    });
  });

  el.fileModalClose.addEventListener('click', closeModal);
  el.fileModalDismiss.addEventListener('click', closeModal);
  el.fileModal.addEventListener('click', function (event) {
    if (event.target === el.fileModal) {
      closeModal();
    }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && el.fileModal.classList.contains('is-open')) {
      closeModal();
    }
  });

  initializeDefaultDateRange();

  map.whenReady(function () {
    window.setTimeout(function () {
      map.invalidateSize();
      refreshAll();
    }, 0);
  });
})();

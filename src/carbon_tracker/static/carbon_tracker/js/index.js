(function () {
  var app = document.getElementById('carbon-tracker-app');
  if (!app || typeof L === 'undefined') {
    return;
  }

  var missionPayloadNode = document.getElementById('ct-mission-payload');
  var missionPayload = missionPayloadNode ? JSON.parse(missionPayloadNode.textContent) : {
    default_mission: 'oco2_vn',
    missions: [],
    overviews: {},
    vietnam_bounds: [8.18, 102.14, 23.39, 109.47]
  };

  var MISSION_DEFS = {
    oco2_vn: {
      key: 'oco2_vn',
      label: 'OCO-2 Vietnam',
      detailType: 'nc4',
      tableSubtitle: 'Nhấn vào một dòng để zoom bản đồ. Mở file để xem cấu trúc .nc4 và metadata nguồn.',
      tableColumns: [
        { label: 'ID', render: function (feature) { return escapeHtml(feature.properties.display_id); } },
        { label: 'Thời gian', render: function (feature) { return escapeHtml(formatDateTime(feature.properties.acquisition_time)); } },
        { label: 'XCO2', render: function (feature) { return escapeHtml(formatNumber(feature.properties.xco2, 2)); } },
        { label: 'Uncertainty', render: function (feature) { return escapeHtml(formatNumber(feature.properties.xco2_uncertainty, 2)); } },
        { label: 'Quality', render: function (feature) { return buildQualityBadge(feature.properties.xco2_quality_flag); } },
        { label: 'Mode', render: function (feature) { return escapeHtml(formatPlainValue(feature.properties.operation_mode)); } },
        { label: 'File nguồn', render: function (feature) { return escapeHtml(shortLabel(shortFileName(feature.properties.source_file), 24)); } }
      ],
      popupHtml: function (feature) {
        var props = feature.properties || {};
        return '<div>' +
          '<strong>ID:</strong> ' + escapeHtml(props.display_id) + '<br>' +
          '<strong>XCO2:</strong> ' + escapeHtml(formatNumber(props.xco2, 2)) + ' ppm<br>' +
          '<strong>Uncertainty:</strong> ' + escapeHtml(formatNumber(props.xco2_uncertainty, 2)) + '<br>' +
          '<strong>Quality:</strong> ' + escapeHtml(formatQualityFlag(props.xco2_quality_flag)) + '<br>' +
          '<strong>Thời gian:</strong> ' + escapeHtml(formatDateTime(props.acquisition_time)) + '<br>' +
          '<strong>File:</strong> ' + escapeHtml(shortFileName(props.source_file || '-')) +
          '</div>';
      }
    },
    gosat2_vn: {
      key: 'gosat2_vn',
      label: 'GOSAT-2 Vietnam',
      detailType: 'h5',
      tableSubtitle: 'Nhấn vào một sounding để zoom bản đồ. Mở file để xem product context, retrieval và catalog H5.',
      tableColumns: [
        { label: 'Sounding', render: function (feature) { return escapeHtml(feature.properties.display_id); } },
        { label: 'Thời gian', render: function (feature) { return escapeHtml(formatDateTime(feature.properties.acquisition_time)); } },
        { label: 'XCO2', render: function (feature) { return escapeHtml(formatNumber(feature.properties.xco2, 2)); } },
        { label: 'Uncertainty', render: function (feature) { return escapeHtml(formatNumber(feature.properties.xco2_uncertainty, 2)); } },
        { label: 'Quality', render: function (feature) { return buildQualityBadge(feature.properties.xco2_quality_flag); } },
        { label: 'Sensor', render: function (feature) { return escapeHtml(formatPlainValue(feature.properties.sensor_name)); } },
        { label: 'Version', render: function (feature) { return escapeHtml(formatPlainValue(feature.properties.product_version)); } },
        { label: 'File', render: function (feature) { return escapeHtml(shortLabel(feature.properties.file_name || feature.properties.file_id || '-', 24)); } }
      ],
      popupHtml: function (feature) {
        var props = feature.properties || {};
        return '<div>' +
          '<strong>Sounding:</strong> ' + escapeHtml(props.display_id) + '<br>' +
          '<strong>XCO2:</strong> ' + escapeHtml(formatNumber(props.xco2, 2)) + ' ppm<br>' +
          '<strong>Uncertainty:</strong> ' + escapeHtml(formatNumber(props.xco2_uncertainty, 2)) + '<br>' +
          '<strong>Quality:</strong> ' + escapeHtml(formatQualityFlag(props.xco2_quality_flag)) + '<br>' +
          '<strong>Sensor:</strong> ' + escapeHtml(formatPlainValue(props.sensor_name)) + '<br>' +
          '<strong>Version:</strong> ' + escapeHtml(formatPlainValue(props.product_version)) + '<br>' +
          '<strong>File:</strong> ' + escapeHtml(shortFileName(props.file_name || props.file_id || '-')) +
          '</div>';
      }
    }
  };

  var state = {
    mission: missionPayload.default_mission || 'oco2_vn',
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
    missionSwitcher: document.getElementById('ct-mission-switcher'),
    missionTitle: document.getElementById('ct-mission-title'),
    missionDescription: document.getElementById('ct-mission-description'),
    overviewTotal: document.getElementById('ct-overview-total'),
    error: document.getElementById('ct-error'),
    dateFrom: document.getElementById('ct-date-from'),
    dateTo: document.getElementById('ct-date-to'),
    granularity: document.getElementById('ct-granularity'),
    pageSize: document.getElementById('ct-page-size'),
    productVersion: document.getElementById('ct-product-version'),
    processingLevel: document.getElementById('ct-processing-level'),
    sensorName: document.getElementById('ct-sensor-name'),
    fileSearch: document.getElementById('ct-file-search'),
    refresh: document.getElementById('ct-refresh'),
    clearAoi: document.getElementById('ct-clear-aoi'),
    mapScope: document.getElementById('ct-map-scope'),
    tableHead: document.getElementById('ct-table-head'),
    tableBody: document.getElementById('ct-table-body'),
    tableSubtitle: document.getElementById('ct-table-subtitle'),
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
    summaryFilesSub: document.getElementById('ct-summary-files-sub'),
    summaryDays: document.getElementById('ct-summary-days'),
    summaryRange: document.getElementById('ct-summary-range'),
    sourceChartTitle: document.getElementById('ct-source-chart-title'),
    timeGrid: document.getElementById('ct-time-grid'),
    topDays: document.getElementById('ct-top-days'),
    insightGrid: document.getElementById('ct-insight-grid'),
    secondaryListTitle: document.getElementById('ct-secondary-list-title'),
    secondaryList: document.getElementById('ct-secondary-list'),
    fileModal: document.getElementById('ct-file-modal'),
    fileModalClose: document.getElementById('ct-file-modal-close'),
    fileModalDismiss: document.getElementById('ct-file-modal-dismiss'),
    fileModalTitle: document.getElementById('ct-file-modal-title'),
    fileModalSubtitle: document.getElementById('ct-file-modal-subtitle'),
    fileModalBody: document.getElementById('ct-file-modal-body'),
    scopedFields: document.querySelectorAll('.ct-field[data-scope]')
  };

  var vietnamBounds = parseBounds((missionPayload.vietnam_bounds || []).join(','));
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
      return L.circleMarker(latlng, getMarkerStyle(feature.properties || {}));
    },
    onEachFeature: function (feature, layer) {
      var featureId = normalizeFeatureId(feature);
      state.markerLayersById[featureId] = layer;
      layer.featureId = featureId;
      layer.on('click', function () {
        focusFeature(featureId);
      });
      layer.bindPopup(getMissionDefinition().popupHtml(feature));
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

  function getMissionDefinition() {
    return MISSION_DEFS[state.mission] || MISSION_DEFS.oco2_vn;
  }

  function parseBounds(text) {
    if (!text) {
      return null;
    }
    var numbers = String(text).split(',').map(function (value) { return Number(value); });
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
    var rawId = feature.id || props.record_id || props.sounding_id;
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

  function getCsrfToken() {
    var match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  function setLoading(isLoading) {
    el.refresh.disabled = isLoading;
    el.refresh.innerHTML = isLoading
      ? '<i class="fa fa-spinner fa-spin"></i> Đang tải'
      : '<i class="fa fa-refresh"></i> Cập nhật';
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
      return 'Không gắn cờ';
    }
    var number = Number(value);
    if (!Number.isFinite(number)) {
      return String(value);
    }
    if (number === 0) {
      return '0 (tốt)';
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
      { selector: '.leaflet-draw-draw-polygon', label: 'P', title: 'Vẽ vùng đa giác' },
      { selector: '.leaflet-draw-draw-rectangle', label: 'R', title: 'Vẽ vùng hình chữ nhật' },
      { selector: '.leaflet-draw-edit-edit', label: 'E', title: 'Chỉnh sửa AOI' },
      { selector: '.leaflet-draw-edit-remove', label: 'X', title: 'Xóa AOI' }
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
    params.set('mission', state.mission);
    if (el.dateFrom.value) {
      params.set('date_from', el.dateFrom.value);
    }
    if (el.dateTo.value) {
      params.set('date_to', el.dateTo.value);
    }
    params.set('granularity', el.granularity.value || 'day');
    if (state.mission === 'gosat2_vn') {
      if (el.productVersion.value) {
        params.set('product_version', el.productVersion.value);
      }
      if (el.processingLevel.value) {
        params.set('processing_level', el.processingLevel.value);
      }
      if (el.sensorName.value) {
        params.set('sensor_name', el.sensorName.value);
      }
      if (el.fileSearch.value) {
        params.set('file_name', el.fileSearch.value);
        params.set('file_id', el.fileSearch.value);
      }
    }
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
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var detail = payload.detail || payload.bbox || payload.date_to || payload.date_from || payload.mission || 'Không thể tải dữ liệu.';
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
      el.mapScope.textContent = 'AOI đang chọn';
      el.mapScope.className = 'label label-success';
    } else {
      addBoundsParams(params);
      payload = await fetchJson(urls.summary + '?' + params.toString(), {
        headers: { Accept: 'application/json' }
      });
      el.mapScope.textContent = 'Khung nhìn hiện tại';
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
      showError(error.message || 'Có lỗi khi tải dữ liệu.');
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
    var definition = getMissionDefinition();
    var columns = definition.tableColumns.slice();
    columns.push({
      label: '',
      render: function (feature) {
        return '<button type="button" class="ct-link-button" data-action="detail" data-id="' +
          escapeHtml(feature.properties.record_id) + '">Mở chi tiết</button>';
      }
    });
    el.tableHead.innerHTML = '<tr>' + columns.map(function (column) {
      return '<th>' + escapeHtml(column.label) + '</th>';
    }).join('') + '</tr>';
    el.tableSubtitle.textContent = definition.tableSubtitle;

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
      el.tableBody.innerHTML = '<tr><td colspan="' + columns.length + '" class="text-muted text-center">Không có dữ liệu trong phạm vi lọc</td></tr>';
      return;
    }

    el.tableBody.innerHTML = features.map(function (feature) {
      var featureId = normalizeFeatureId(feature);
      return '<tr class="ct-table-row" data-id="' + escapeHtml(featureId) + '">' +
        columns.map(function (column) {
          return '<td>' + column.render(feature) + '</td>';
        }).join('') +
      '</tr>';
    }).join('');

    Array.prototype.forEach.call(el.tableBody.querySelectorAll('.ct-table-row'), function (row) {
      row.addEventListener('click', function (event) {
        var actionButton = event.target.closest('[data-action="detail"]');
        if (actionButton) {
          event.stopPropagation();
          openFileDetail(actionButton.getAttribute('data-id'));
          return;
        }
        focusFeature(row.getAttribute('data-id'));
      });
    });
  }

  function renderSummary(payload) {
    var summary = payload.summary || {};
    el.summaryCount.textContent = formatInteger(summary.total_records);
    el.summaryCountSub.textContent = payload.mission === 'gosat2_vn'
      ? 'Sounding trong vùng phân tích'
      : 'Điểm đo trong vùng phân tích';
    el.summaryAvg.textContent = formatNumber(summary.xco2_avg, 2);
    el.summaryRangeValue.textContent =
      summary.xco2_min !== null && summary.xco2_max !== null
        ? formatNumber(summary.xco2_min, 2) + ' - ' + formatNumber(summary.xco2_max, 2)
        : '-';
    el.summaryRangeSub.textContent = 'StdDev ' + formatNumber(summary.xco2_stddev, 2);
    el.summaryUncertainty.textContent = formatNumber(summary.uncertainty_avg, 2);
    el.summaryUncertaintySub.textContent =
      summary.uncertainty_max !== null && summary.uncertainty_max !== undefined
        ? 'Lớn nhất ' + formatNumber(summary.uncertainty_max, 2)
        : 'Không có uncertainty';
    el.summaryQualityRatio.textContent = formatPercent(summary.quality_good_ratio);
    if (payload.mission === 'gosat2_vn') {
      el.summaryFiles.textContent = formatInteger(summary.unique_products || summary.unique_source_files);
      el.summaryFilesSub.textContent = formatInteger(summary.unique_source_files) + ' file, ' +
        formatInteger(summary.unique_product_versions) + ' version';
    } else {
      el.summaryFiles.textContent = formatInteger(summary.unique_source_files);
      el.summaryFilesSub.textContent = formatInteger(summary.unique_source_folders) + ' thư mục nguồn';
    }
    el.summaryDays.textContent = formatInteger(summary.active_days);
    el.summaryRange.textContent = formatDate(summary.first_acquisition_time) + ' - ' + formatDate(summary.latest_acquisition_time);
    el.sourceChartTitle.textContent = (payload.ui_context && payload.ui_context.source_chart_title) || 'Nguồn dữ liệu chi phối';
  }

  function renderTimeUtility(payload) {
    var summary = payload.summary || {};
    var rows = [
      kvRow('Thời điểm sớm nhất', formatDateTime(summary.first_acquisition_time)),
      kvRow('Thời điểm mới nhất', formatDateTime(summary.latest_acquisition_time)),
      kvRow('Số ngày có dữ liệu', formatInteger(summary.active_days)),
      kvRow(
        'Vĩ độ phủ',
        summary.latitude_min !== null && summary.latitude_max !== null
          ? formatNumber(summary.latitude_min, 4) + ' -> ' + formatNumber(summary.latitude_max, 4)
          : '-'
      ),
      kvRow(
        'Kinh độ phủ',
        summary.longitude_min !== null && summary.longitude_max !== null
          ? formatNumber(summary.longitude_min, 4) + ' -> ' + formatNumber(summary.longitude_max, 4)
          : '-'
      )
    ];
    if (payload.mission === 'gosat2_vn') {
      rows.push(kvRow('Sensor hiện diện', formatInteger(summary.unique_sensors)));
      rows.push(kvRow('Processing level', formatInteger(summary.unique_processing_levels)));
    } else {
      rows.push(kvRow('Orbit khác nhau', formatInteger(summary.unique_orbits)));
      rows.push(kvRow('Operation mode', formatInteger(summary.unique_operation_modes)));
    }
    el.timeGrid.innerHTML = rows.join('');

    var topDays = payload.top_days || [];
    if (!topDays.length) {
      el.topDays.innerHTML = '<li class="ct-empty">Chưa có dữ liệu</li>';
    } else {
      el.topDays.innerHTML = topDays.map(function (row) {
        return '<li><strong>' + escapeHtml(formatDate(row.date)) + '</strong>: ' +
          escapeHtml(formatInteger(row.count)) + ' quan sát, XCO2 TB ' +
          escapeHtml(formatNumber(row.xco2_avg, 2)) +
          ', uncertainty TB ' + escapeHtml(formatNumber(row.uncertainty_avg, 2)) +
          '</li>';
      }).join('');
    }
  }

  function kvRow(label, value) {
    return '<div class="ct-kv"><span>' + escapeHtml(label) + '</span><span>' + escapeHtml(value) + '</span></div>';
  }

  function renderInsights(payload) {
    var summary = payload.summary || {};
    var insights = payload.insights || {};
    var rows = [
      kvRow(
        'Tỷ lệ quality tốt',
        formatInteger(summary.quality_good_count) + ' / ' +
          formatInteger(summary.quality_known_count) + ' (' + formatPercent(summary.quality_good_ratio) + ')'
      ),
      kvRow(
        'Nguồn chi phối',
        insights.dominant_source
          ? shortLabel(insights.dominant_source.label, 32) + ' (' + formatInteger(insights.dominant_source.count) + ')'
          : '-'
      ),
      kvRow(
        payload.mission === 'gosat2_vn' ? 'Processing level nổi bật' : 'Thư mục nguồn nổi bật',
        insights.secondary_focus
          ? shortLabel(insights.secondary_focus.label, 32) + ' (' + formatInteger(insights.secondary_focus.count) + ')'
          : '-'
      )
    ];
    if (payload.mission === 'gosat2_vn') {
      rows.push(kvRow(
        'Retrieval sẵn sàng',
        formatInteger(summary.retrieval_known_count) + ' / ' + formatInteger(summary.total_records) +
          ' (' + formatPercent(summary.retrieval_known_ratio) + ')'
      ));
      rows.push(kvRow(
        'Cloud + L1 quality',
        'Cloud ' + formatPercent(summary.cloud_known_ratio) + ' | L1 ' + formatPercent(summary.l1_known_ratio)
      ));
      rows.push(kvRow(
        'Operation mode',
        (insights.operation_modes && insights.operation_modes[0])
          ? shortLabel(insights.operation_modes[0].label, 24) + ' (' + formatInteger(insights.operation_modes[0].count) + ')'
          : '-'
      ));
    } else {
      rows.push(kvRow(
        'Uncertainty sẵn sàng',
        formatInteger(summary.uncertainty_known_count) + ' / ' + formatInteger(summary.total_records) +
          ' (' + formatPercent(summary.uncertainty_known_ratio) + ')'
      ));
      rows.push(kvRow(
        'Mode / orbit',
        'Mode ' + formatInteger((insights.metadata_readiness || {}).mode_known_count || 0) +
          ' | Orbit ' + formatInteger((insights.metadata_readiness || {}).orbit_known_count || 0)
      ));
      rows.push(kvRow(
        'Operation mode nổi bật',
        (insights.operation_modes && insights.operation_modes[0])
          ? shortLabel(insights.operation_modes[0].label, 24) + ' (' + formatInteger(insights.operation_modes[0].count) + ')'
          : '-'
      ));
    }
    el.insightGrid.innerHTML = rows.join('');
    el.secondaryListTitle.textContent = (payload.ui_context && payload.ui_context.secondary_title) || 'Danh sách nguồn nổi bật';
    renderSecondaryList(payload.secondary_items || [], payload.ui_context || {});
  }

  function renderSecondaryList(rows, uiContext) {
    if (!rows.length) {
      el.secondaryList.innerHTML = '<li class="ct-empty">' + escapeHtml(uiContext.secondary_empty || 'Chưa có dữ liệu') + '</li>';
      return;
    }
    el.secondaryList.innerHTML = rows.map(function (row) {
      var parts = [
        '<strong>' + escapeHtml(shortLabel(row.label, 42)) + '</strong>: ' + escapeHtml(formatInteger(row.count)) + ' quan sát'
      ];
      if (row.xco2_avg !== null && row.xco2_avg !== undefined) {
        parts.push('XCO2 TB ' + escapeHtml(formatNumber(row.xco2_avg, 2)));
      }
      if (row.uncertainty_avg !== null && row.uncertainty_avg !== undefined) {
        parts.push('uncertainty TB ' + escapeHtml(formatNumber(row.uncertainty_avg, 2)));
      }
      return '<li>' + parts.join(', ') + '</li>';
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
            label: 'Số quan sát',
            data: rows.map(function (row) { return row.count; }),
            backgroundColor: 'rgba(2, 132, 199, .25)',
            borderColor: '#0284c7',
            yAxisID: 'yCount'
          },
          {
            type: 'line',
            label: 'XCO2 trung bình (ppm)',
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
            title: { display: true, text: 'XCO2 (ppm)' }
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
            label: 'Uncertainty trung bình',
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
            label: 'Tỷ lệ quality tốt (%)',
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
            title: { display: true, text: 'Quality tốt (%)' }
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
          label: histogram.sampled ? 'Số quan sát (mẫu)' : 'Số quan sát',
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
        labels: rows.map(function (row) { return shortLabel(shortFileName(row.label), 24); }),
        datasets: [{
          label: 'Số quan sát',
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
          label: 'Tỷ lệ sẵn sàng (%)',
          data: rows.map(function (row) { return row.ratio; }),
          backgroundColor: ['#d97706', '#16a34a', '#0f766e', '#1d4ed8', '#94a3b8', '#7c3aed'],
          borderColor: ['#b45309', '#15803d', '#115e59', '#1e40af', '#64748b', '#6d28d9'],
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

  function getMissionOverview() {
    return (missionPayload.overviews && missionPayload.overviews[state.mission]) || {};
  }

  function setQuickRange(days) {
    var overview = getMissionOverview();
    var anchor = overview.latest_date_value ? new Date(overview.latest_date_value + 'T00:00:00') : new Date();
    var from = new Date(anchor.getTime());
    from.setDate(anchor.getDate() - Number(days) + 1);
    el.dateFrom.value = toInputDate(from);
    el.dateTo.value = toInputDate(anchor);
    state.page = 1;
    refreshAll();
  }

  function initializeDefaultDateRange(force) {
    var overview = getMissionOverview();
    if (!force && (el.dateFrom.value || el.dateTo.value)) {
      return;
    }
    if (!overview.latest_date_value) {
      return;
    }
    var anchor = new Date(overview.latest_date_value + 'T00:00:00');
    if (Number.isNaN(anchor.getTime())) {
      return;
    }
    var from = new Date(anchor.getTime());
    from.setDate(anchor.getDate() - 29);
    el.dateFrom.value = toInputDate(from);
    el.dateTo.value = toInputDate(anchor);
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
      return '<div class="ct-empty">Không có dữ liệu.</div>';
    }
    return '<table class="ct-meta-table"><thead><tr>' +
      headings.map(function (heading) { return '<th>' + escapeHtml(heading) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.join('') +
      '</tbody></table>';
  }

  function buildKeyValueTable(items) {
    return buildTableFromRows(
      items.map(function (item) {
        return '<tr><td>' + escapeHtml(item.label) + '</td><td>' + escapeHtml(formatPlainValue(item.value)) + '</td></tr>';
      }),
      ['Trường', 'Giá trị']
    );
  }

  function buildAttrTable(rows) {
    return buildTableFromRows(
      (rows || []).map(function (row) {
        return '<tr><td>' + escapeHtml(row.key) + '</td><td>' + escapeHtml(formatPlainValue(row.value)) + '</td></tr>';
      }),
      ['Thuộc tính', 'Giá trị']
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
      ['Tên', 'Kiểu', 'Dims', 'Shape', 'Số phần tử', 'Attrs chính']
    );
  }

  function buildCatalogTable(rows) {
    return buildTableFromRows(
      (rows || []).map(function (row) {
        return '<tr>' +
          '<td>' + escapeHtml(row.dataset_name || '-') + '</td>' +
          '<td>' + escapeHtml(row.h5_group || '-') + '</td>' +
          '<td>' + escapeHtml(row.shape || '-') + '</td>' +
          '<td>' + escapeHtml(row.dtype || '-') + '</td>' +
          '<td>' + escapeHtml(row.unit || '-') + '</td>' +
        '</tr>';
      }),
      ['Dataset', 'Group', 'Shape', 'Dtype', 'Unit']
    );
  }

  async function openFileDetail(recordId) {
    if (!recordId) {
      return;
    }
    openModal();
    el.fileModalTitle.textContent = 'Chi tiết file nguồn';
    el.fileModalSubtitle.textContent = 'Đang tải chi tiết cho bản ghi ' + recordId;
    el.fileModalBody.innerHTML = '<div class="ct-empty">Đang mở file nguồn...</div>';

    try {
      var url = urls.fileDetailTemplate.replace('/0/', '/' + encodeURIComponent(recordId) + '/');
      var payload = await fetchJson(url + '?mission=' + encodeURIComponent(state.mission), {
        headers: { Accept: 'application/json' }
      });
      renderFileModal(payload);
    } catch (error) {
      el.fileModalBody.innerHTML = '<div class="alert alert-danger">Không thể đọc file: ' +
        escapeHtml(error.message || 'Unknown error') + '</div>';
    }
  }

  function renderFileModal(payload) {
    if (payload.mission === 'gosat2_vn') {
      renderGosatModal(payload);
      return;
    }
    renderOco2Modal(payload);
  }

  function renderOco2Modal(payload) {
    var record = payload.record || {};
    var fileInfo = payload.file || {};
    var dataset = payload.dataset || {};
    el.fileModalTitle.textContent = 'Chi tiết file nguồn .nc4';
    el.fileModalSubtitle.textContent = shortFileName(fileInfo.name || record.source_file || '-') + ' | ID ' + formatPlainValue(record.sounding_id);

    var recordItems = [
      { label: 'ID', value: record.sounding_id },
      { label: 'Thời gian', value: formatDateTime(record.acquisition_time) },
      { label: 'XCO2', value: formatNumber(record.xco2, 2) + ' ppm' },
      { label: 'Uncertainty', value: formatNumber(record.xco2_uncertainty, 2) },
      { label: 'Quality flag', value: formatQualityFlag(record.xco2_quality_flag) },
      { label: 'Operation mode', value: record.operation_mode },
      { label: 'Orbit', value: record.orbit },
      { label: 'Vĩ độ / Kinh độ', value: formatNumber(record.latitude, 5) + ' / ' + formatNumber(record.longitude, 5) }
    ];
    var fileItems = [
      { label: 'Đường dẫn file', value: fileInfo.resolved_path || 'Không tìm thấy trên máy chủ' },
      { label: 'Tồn tại trên máy chủ', value: fileInfo.exists ? 'Có' : 'Không' },
      { label: 'Kích thước', value: fileInfo.size_bytes ? formatInteger(fileInfo.size_bytes) + ' bytes' : '-' },
      { label: 'Cập nhật file', value: formatDateTime(fileInfo.modified_at) },
      { label: 'Engine xarray', value: fileInfo.xarray_engine || '-' }
    ];
    var rawMetadataText = record.raw_metadata ? JSON.stringify(record.raw_metadata, null, 2) : 'Không có raw_metadata';
    var errorBlock = payload.dataset_error
      ? '<div class="alert alert-warning">' + escapeHtml(payload.dataset_error) + '</div>'
      : '';

    el.fileModalBody.innerHTML =
      errorBlock +
      '<div class="ct-modal-section">' +
        '<div class="ct-modal-grid">' +
          '<div><h6>Thông tin bản ghi</h6>' + buildKeyValueTable(recordItems) + '</div>' +
          '<div><h6>Thông tin tệp</h6>' + buildKeyValueTable(fileItems) + '</div>' +
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

  function renderGosatModal(payload) {
    var record = payload.record || {};
    var product = payload.product || {};
    var retrieval = payload.retrieval || {};
    var quality = payload.quality || {};
    var fileInfo = payload.file || {};
    var catalog = payload.catalog || {};
    var h5Preview = payload.h5_preview || {};
    el.fileModalTitle.textContent = 'Chi tiết product / file H5';
    el.fileModalSubtitle.textContent = shortFileName(product.file_name || fileInfo.name || '-') + ' | ' + formatPlainValue(record.display_id);

    var recordItems = [
      { label: 'Sounding', value: record.display_id },
      { label: 'Observation request ID', value: record.observation_request_id },
      { label: 'Thời gian', value: formatDateTime(record.observation_time) },
      { label: 'Vĩ độ / Kinh độ', value: formatNumber(record.latitude, 5) + ' / ' + formatNumber(record.longitude, 5) },
      { label: 'Operation mode', value: record.operation_mode },
      { label: 'Sunglint flag', value: record.sunglint_flag },
      { label: 'Solar zenith', value: formatNumber(record.solar_zenith, 2) },
      { label: 'View zenith', value: formatNumber(record.view_zenith, 2) }
    ];
    var productItems = [
      { label: 'File name', value: product.file_name },
      { label: 'File ID', value: product.file_id },
      { label: 'Sensor', value: product.sensor_name },
      { label: 'Processing level', value: product.processing_level },
      { label: 'Product version', value: product.product_version },
      { label: 'Algorithm version', value: product.algorithm_version },
      { label: 'Time coverage', value: formatDateTime(product.start_date) + ' -> ' + formatDateTime(product.end_date) },
      { label: 'Num sounding', value: product.num_sounding }
    ];
    var retrievalItems = [
      { label: 'XCO2', value: formatNumber(retrieval.xco2, 2) + ' ppm' },
      { label: 'XCO2 uncertainty', value: formatNumber(retrieval.xco2_uncertainty, 2) },
      { label: 'XCO2 quality flag', value: formatQualityFlag(retrieval.xco2_quality_flag) },
      { label: 'XCH4', value: formatNumber(retrieval.xch4, 2) },
      { label: 'XCO', value: formatNumber(retrieval.xco, 2) },
      { label: 'XH2O', value: formatNumber(retrieval.xh2o, 2) },
      { label: 'Surface pressure', value: formatNumber(retrieval.surface_pressure, 2) },
      { label: 'Wind speed', value: formatNumber(retrieval.wind_speed, 2) }
    ];
    var qualityItems = [
      { label: 'Cloud info sẵn sàng', value: quality.related_counts && quality.related_counts.cloud_present ? 'Có' : 'Không' },
      { label: 'L1 quality sẵn sàng', value: quality.related_counts && quality.related_counts.l1_summary_present ? 'Có' : 'Không' },
      { label: 'CO2 ratio', value: formatNumber((quality.cloud_information || {}).co2_ratio, 3) },
      { label: 'H2O ratio', value: formatNumber((quality.cloud_information || {}).h2o_ratio, 3) },
      { label: 'Surface pressure delta', value: formatNumber((quality.cloud_information || {}).surface_pressure_delta, 3) },
      { label: 'Sounding quality flag', value: formatPlainValue((quality.l1_quality_summary || {}).sounding_quality_flag) },
      { label: 'Scan stability', value: formatPlainValue((quality.l1_quality_summary || {}).scan_stability_flag) },
      { label: 'IMC stability', value: formatPlainValue((quality.l1_quality_summary || {}).imc_stability_flag) }
    ];
    var fileItems = [
      { label: 'Đường dẫn file', value: fileInfo.resolved_path || product.file_path || 'Không tìm thấy trên máy chủ' },
      { label: 'Tồn tại trên máy chủ', value: fileInfo.exists ? 'Có' : 'Không' },
      { label: 'Kích thước', value: fileInfo.size_bytes ? formatInteger(fileInfo.size_bytes) + ' bytes' : '-' },
      { label: 'Cập nhật file', value: formatDateTime(fileInfo.modified_at) },
      { label: 'Catalog rows', value: formatInteger(catalog.count) }
    ];
    var metadataText = product.metadata_json ? JSON.stringify(product.metadata_json, null, 2) : 'Không có metadata_json';
    var h5PreviewHtml = h5Preview.top_level_items
      ? buildTableFromRows(
          h5Preview.top_level_items.map(function (row) {
            return '<tr><td>' + escapeHtml(row.name) + '</td><td>' + escapeHtml(row.type) + '</td><td>' + escapeHtml(row.shape || '-') + '</td></tr>';
          }),
          ['Tên', 'Loại', 'Shape']
        )
      : '<div class="ct-empty">Không có H5 preview.</div>';
    var errorBlock = payload.dataset_error
      ? '<div class="alert alert-warning">' + escapeHtml(payload.dataset_error) + '</div>'
      : '';

    el.fileModalBody.innerHTML =
      errorBlock +
      '<div class="ct-modal-section">' +
        '<div class="ct-modal-grid">' +
          '<div><h6>Sounding summary</h6>' + buildKeyValueTable(recordItems) + '</div>' +
          '<div><h6>Product metadata</h6>' + buildKeyValueTable(productItems) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ct-modal-section">' +
        '<div class="ct-modal-grid">' +
          '<div><h6>Retrieval summary</h6>' + buildKeyValueTable(retrievalItems) + '</div>' +
          '<div><h6>Cloud / L1 quality</h6>' + buildKeyValueTable(qualityItems) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ct-modal-section">' +
        '<div class="ct-modal-grid">' +
          '<div><h6>Thông tin file H5</h6>' + buildKeyValueTable(fileItems) + '</div>' +
          '<div><h6>Metadata JSON</h6><pre class="ct-pre">' + escapeHtml(metadataText) + '</pre></div>' +
        '</div>' +
      '</div>' +
      '<div class="ct-modal-section">' +
        '<h6>H5 dataset catalog</h6>' +
        buildCatalogTable(catalog.items || []) +
      '</div>' +
      '<div class="ct-modal-section">' +
        '<div class="ct-modal-grid">' +
          '<div><h6>Top-level H5 items</h6>' + h5PreviewHtml + '</div>' +
          '<div><h6>H5 attributes</h6>' + buildAttrTable(h5Preview.attributes || []) + '</div>' +
        '</div>' +
      '</div>';
  }

  function buildMissionSwitcher() {
    var missions = missionPayload.missions || [];
    el.missionSwitcher.innerHTML = missions.map(function (mission) {
      return '<button type="button" class="btn btn-default' + (mission.key === state.mission ? ' is-active' : '') +
        '" data-mission="' + escapeHtml(mission.key) + '">' + escapeHtml(mission.label) + '</button>';
    }).join('');
    Array.prototype.forEach.call(el.missionSwitcher.querySelectorAll('[data-mission]'), function (button) {
      button.addEventListener('click', function () {
        var missionKey = button.getAttribute('data-mission');
        if (missionKey === state.mission) {
          return;
        }
        switchMission(missionKey);
      });
    });
  }

  function updateScopedFields() {
    Array.prototype.forEach.call(el.scopedFields, function (field) {
      field.dataset.visible = field.getAttribute('data-scope') === state.mission ? 'true' : 'false';
    });
    if (state.mission !== 'gosat2_vn') {
      el.productVersion.value = '';
      el.processingLevel.value = '';
      el.sensorName.value = '';
      el.fileSearch.value = '';
    }
  }

  function updateMissionHeader() {
    var definition = getMissionDefinition();
    var overview = getMissionOverview();
    el.missionTitle.textContent = definition.label;
    el.overviewTotal.textContent = formatInteger(overview.total_records || 0);
    if (state.mission === 'gosat2_vn') {
      el.missionDescription.textContent =
        'Tập trung vào sounding GOSAT-2 trong phạm vi Việt Nam, ưu tiên XCO2, uncertainty, chất lượng retrieval và drill-down theo product/file.';
    } else {
      el.missionDescription.textContent =
        'Theo dõi XCO2 OCO-2 tại Việt Nam, kiểm tra chất lượng quan sát, gom thống kê theo AOI và xem nhanh cấu trúc file .nc4 nguồn.';
    }
  }

  function switchMission(missionKey) {
    state.mission = missionKey;
    state.page = 1;
    clearActiveFeature();
    buildMissionSwitcher();
    updateScopedFields();
    updateMissionHeader();
    initializeDefaultDateRange(true);
    refreshAll();
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
        showError(error.message || 'Có lỗi khi tải dữ liệu.');
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
      showError(error.message || 'Có lỗi khi tải dữ liệu.');
    }).finally(function () {
      setLoading(false);
    });
  });

  [el.pageSize, el.granularity, el.productVersion, el.processingLevel, el.sensorName, el.fileSearch].forEach(function (node) {
    if (!node) {
      return;
    }
    node.addEventListener('change', function () {
      state.page = 1;
      refreshAll();
    });
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

  buildMissionSwitcher();
  updateScopedFields();
  updateMissionHeader();
  initializeDefaultDateRange(true);

  map.whenReady(function () {
    window.setTimeout(function () {
      map.invalidateSize();
      refreshAll();
    }, 0);
  });
})();

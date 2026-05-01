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
      histogram: null,
      sources: null
    }
  };

  var urls = {
    points: app.dataset.pointsUrl,
    summary: app.dataset.summaryUrl,
    aoiSummary: app.dataset.aoiSummaryUrl
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
    summaryCount: document.getElementById('ct-summary-count'),
    summaryAvg: document.getElementById('ct-summary-avg'),
    summaryMin: document.getElementById('ct-summary-min'),
    summaryMax: document.getElementById('ct-summary-max'),
    summaryStddev: document.getElementById('ct-summary-stddev'),
    summaryDays: document.getElementById('ct-summary-days'),
    tableBody: document.getElementById('ct-table-body'),
    tableTotal: document.getElementById('ct-table-total'),
    showingFrom: document.getElementById('ct-showing-from'),
    showingTo: document.getElementById('ct-showing-to'),
    currentPage: document.getElementById('ct-current-page'),
    totalPages: document.getElementById('ct-total-pages'),
    prevPage: document.getElementById('ct-prev-page'),
    nextPage: document.getElementById('ct-next-page'),
    timeFirst: document.getElementById('ct-time-first'),
    timeLatest: document.getElementById('ct-time-latest'),
    timeDays: document.getElementById('ct-time-days'),
    topDays: document.getElementById('ct-top-days')
  };

  var map = L.map('carbon-map', {
    center: [16.573940250540232, 106.74242066284037],
    zoom: 10,
    preferCanvas: true
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  var pointLayer = L.geoJSON(null, {
    pointToLayer: function (feature, latlng) {
      var value = Number((feature.properties || {}).xco2);
      return L.circleMarker(latlng, {
        radius: 5,
        color: getXco2Color(value),
        weight: 1,
        fillColor: getXco2Color(value),
        fillOpacity: 0.72
      });
    },
    onEachFeature: function (feature, layer) {
      var props = feature.properties || {};
      layer.featureId = String(feature.id);
      state.markerLayersById[layer.featureId] = layer;
      layer.on('click', function () {
        focusFeature(layer.featureId);
      });
      layer.bindPopup(
        '<div>' +
          '<strong>sounding_id:</strong> ' + escapeHtml(feature.id) + '<br>' +
          '<strong>xco2:</strong> ' + formatNumber(props.xco2, 2) + ' ppm<br>' +
          '<strong>time:</strong> ' + escapeHtml(formatDateTime(props.acquisition_time)) + '<br>' +
          '<strong>file:</strong> ' + escapeHtml(props.file_path || '-') +
        '</div>'
      );
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
      legendRow('#2c7bb6', '< 400') +
      legendRow('#00a6ca', '400-420') +
      legendRow('#fdae61', '420-440') +
      legendRow('#d7191c', '>= 440');
    return div;
  };
  legend.addTo(map);

  function legendRow(color, label) {
    return '<div class="ct-legend-row"><span class="ct-swatch" style="background:' + color + '"></span>' + label + '</div>';
  }

  function getXco2Color(value) {
    if (!Number.isFinite(value)) {
      return '#667085';
    }
    if (value < 400) {
      return '#2c7bb6';
    }
    if (value < 420) {
      return '#00a6ca';
    }
    if (value < 440) {
      return '#fdae61';
    }
    return '#d7191c';
  }

  function getDefaultMarkerStyle(layer) {
    var props = (layer.feature && layer.feature.properties) || {};
    var color = getXco2Color(Number(props.xco2));
    return {
      radius: 5,
      color: color,
      weight: 1,
      fillColor: color,
      fillOpacity: 0.72
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

  function clearActiveFeature() {
    if (!state.activeFeatureId) {
      return;
    }

    var previousLayer = state.markerLayersById[state.activeFeatureId];
    if (previousLayer && previousLayer.setStyle) {
      previousLayer.setStyle(getDefaultMarkerStyle(previousLayer));
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

  function focusFeature(featureId) {
    if (!featureId) {
      return;
    }

    var normalizedId = String(featureId);
    var layer = state.markerLayersById[normalizedId];
    if (!layer) {
      return;
    }

    clearActiveFeature();
    state.activeFeatureId = normalizedId;
    if (layer.setStyle) {
      layer.setStyle(getActiveMarkerStyle());
    }

    var targetRow = el.tableBody.querySelector('tr[data-id="' + normalizedId + '"]');
    if (targetRow) {
      targetRow.classList.add('is-active');
      scrollRowIntoView(targetRow);
    }

    if (layer.getLatLng) {
      map.flyTo(layer.getLatLng(), Math.max(map.getZoom(), 13), {
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
      { selector: '.leaflet-draw-edit-edit', label: 'E', title: 'Chỉnh sửa vùng đã vẽ' },
      { selector: '.leaflet-draw-edit-remove', label: 'X', title: 'Xóa vùng đã vẽ' }
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

  function showError(message) {
    el.error.textContent = message;
    el.error.style.display = 'block';
  }

  function clearError() {
    el.error.textContent = '';
    el.error.style.display = 'none';
  }

  function setLoading(isLoading) {
    el.refresh.disabled = isLoading;
    el.refresh.innerHTML = isLoading
      ? '<i class="fa fa-spinner fa-spin"></i> Đang tải'
      : '<i class="fa fa-refresh"></i> Cập nhật';
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
    var sw = bounds.getSouthWest();
    var ne = bounds.getNorthEast();
    return { sw: sw, ne: ne };
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

  function getCsrfToken() {
    var match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  async function fetchJson(url, options) {
    var response = await fetch(url, options || {});
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      var detail = payload.detail || payload.bbox || payload.date_to || payload.date_from || 'Không thể tải dữ liệu.';
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
    state.markerLayersById = {};
    clearActiveFeature();
    pointLayer.clearLayers();
    pointLayer.addData(geojson);
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
      el.tableBody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Không có dữ liệu trong phạm vi lọc</td></tr>';
      return;
    }

    el.tableBody.innerHTML = features.map(function (feature) {
      var props = feature.properties || {};
      var rawId = feature.id || props.sounding_id || feature.sounding_id;
      var sId = (rawId !== undefined && rawId !== null) ? String(rawId) : '';
      return '<tr class="ct-table-row" data-id="' + sId + '">' +
        '<td>' + escapeHtml(sId) + '</td>' +
        '<td>' + escapeHtml(formatDateTime(props.acquisition_time)) + '</td>' +
        '<td>' + escapeHtml(formatNumber(props.xco2, 2)) + '</td>' +
        '<td>' + escapeHtml(props.file_path || '-') + '</td>' +
      '</tr>';
    }).join('');

    Array.prototype.forEach.call(el.tableBody.querySelectorAll('.ct-table-row'), function (row) {
      row.addEventListener('click', function () {
        focusFeature(row.getAttribute('data-id'));
      });
    });
  }

  function renderSummary(payload) {
    var summary = payload.summary || {};
    el.summaryCount.textContent = formatInteger(summary.total_records);
    el.summaryAvg.textContent = formatNumber(summary.xco2_avg, 2);
    el.summaryMin.textContent = formatNumber(summary.xco2_min, 2);
    el.summaryMax.textContent = formatNumber(summary.xco2_max, 2);
    el.summaryStddev.textContent = formatNumber(summary.xco2_stddev, 2);
    el.summaryDays.textContent = formatInteger(summary.active_days);
  }

  function renderTimeUtility(payload) {
    var summary = payload.summary || {};
    el.timeFirst.textContent = formatDateTime(summary.first_acquisition_time);
    el.timeLatest.textContent = formatDateTime(summary.latest_acquisition_time);
    el.timeDays.textContent = formatInteger(summary.active_days);

    var rows = payload.top_days || [];
    if (!rows.length) {
      el.topDays.innerHTML = '<li class="text-muted">Chưa có dữ liệu</li>';
      return;
    }
    el.topDays.innerHTML = rows.map(function (row) {
      return '<li><strong>' + escapeHtml(formatDate(row.date)) + '</strong>: ' +
        escapeHtml(formatInteger(row.count)) + ' điểm, TB ' +
        escapeHtml(formatNumber(row.xco2_avg, 2)) + ' ppm</li>';
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
    renderHistogramChart(payload.histogram || {});
    renderSourceChart(payload.top_sources || []);
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
            type: 'line',
            label: 'XCO2 trung bình (ppm)',
            data: rows.map(function (row) { return row.xco2_avg; }),
            borderColor: '#2c7bb6',
            backgroundColor: 'rgba(44, 123, 182, .14)',
            borderWidth: 2,
            fill: true,
            tension: .25,
            yAxisID: 'y'
          },
          {
            type: 'bar',
            label: 'Số điểm đo',
            data: rows.map(function (row) { return row.count; }),
            backgroundColor: 'rgba(0, 166, 202, .35)',
            borderColor: '#00a6ca',
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
          y: { position: 'left', title: { display: true, text: 'ppm' } },
          y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, ticks: { precision: 0 } }
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
          label: histogram.sampled ? 'Số điểm đo (mẫu)' : 'Số điểm đo',
          data: histogram.values || [],
          backgroundColor: '#fdae61',
          borderColor: '#d98b33',
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

  function renderSourceChart(rows) {
    destroyChart('sources');
    var ctx = document.getElementById('ct-source-chart');
    if (!ctx || typeof Chart === 'undefined') {
      return;
    }
    state.charts.sources = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map(function (row) { return row.file_path; }),
        datasets: [{
          label: 'Số điểm đo',
          data: rows.map(function (row) { return row.count; }),
          backgroundColor: '#3c8d7b',
          borderColor: '#2f6f61',
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

  function setQuickRange(days) {
    var anchor = app.dataset.latestDate ? new Date(app.dataset.latestDate + 'T00:00:00') : new Date();
    var from = new Date(anchor.getTime());
    from.setDate(anchor.getDate() - Number(days) + 1);
    el.dateFrom.value = toInputDate(from);
    el.dateTo.value = toInputDate(anchor);
    state.page = 1;
    refreshAll();
  }

  function toInputDate(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
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
  el.pageSize.addEventListener('change', function () {
    state.page = 1;
    refreshAll();
  });
  el.granularity.addEventListener('change', refreshAll);
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

  initializeDefaultDateRange();

  map.whenReady(function () {
    window.setTimeout(function () {
      map.invalidateSize();
      refreshAll();
    }, 0);
  });
})();

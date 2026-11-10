/**
 * WΛVΞSCAN — Mobile Wi-Fi Analyzer Frontend
 * Vanilla JavaScript (ES6+), Zero external frameworks, Android Chrome Optimized
 */

(function () {
  'use strict';

  // --- STATE ---
  const state = {
    networks: [],
    historyLog: {}, // bssid -> array of { rssi, timestamp }
    bestRSSI: {},   // bssid -> highest rssi number
    roomTags: {},   // bssid -> string label
    activeTab: 'tab-list',
    selectedBSSID: null,
    searchQuery: '',
    filterType: 'all',    // all, secured, open, strong, weak
    sortType: 'rssi',     // rssi, ssid, channel
    isScanning: false,
    espStatus: {},
    autoScanTimer: null
  };

  // --- LOCAL STORAGE KEYS ---
  const STORAGE_BEST_RSSI = 'wavescan_best_rssi';
  const STORAGE_ROOM_TAGS = 'wavescan_room_tags';

  // --- DOM ELEMENTS ---
  const el = {
    // Toolbar
    btnBack: document.getElementById('btn-back'),
    searchInput: document.getElementById('search-input'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    btnFilter: document.getElementById('btn-filter'),
    filterIndicator: document.getElementById('filter-indicator'),
    filterModal: document.getElementById('filter-modal'),
    btnCloseFilter: document.getElementById('btn-close-filter'),
    btnResetFilter: document.getElementById('btn-reset-filter'),
    btnApplyFilter: document.getElementById('btn-apply-filter'),

    // Sub Status Bar
    liveDot: document.getElementById('live-dot'),
    networkCountText: document.getElementById('network-count-text'),
    btnScanNow: document.getElementById('btn-scan-now'),
    scanBtnLabel: document.getElementById('scan-btn-label'),

    // Tabs
    tabViews: document.querySelectorAll('.tab-view'),
    navItems: document.querySelectorAll('.nav-item'),

    // Tab 1: List
    networkList: document.getElementById('network-list'),

    // Tab 2: Channels
    spectrumSvg: document.getElementById('spectrum-svg'),
    chActiveSummary: document.getElementById('ch-active-summary'),
    channelBreakdownList: document.getElementById('channel-breakdown-list'),

    // Tab 3: Discovery
    discoverySelect: document.getElementById('discovery-select'),
    discoveryDetails: document.getElementById('discovery-details'),

    // Tab 4: Diagnostics
    diagUptime: document.getElementById('diag-uptime'),
    diagMode: document.getElementById('diag-mode'),
    diagSsid: document.getElementById('diag-ssid'),
    diagIp: document.getElementById('diag-ip'),
    diagMac: document.getElementById('diag-mac'),
    diagHeap: document.getElementById('diag-heap'),
    diagDuration: document.getElementById('diag-duration'),
    diagTotalAp: document.getElementById('diag-total-ap'),
    pingResult: document.getElementById('ping-result'),
    btnRunPing: document.getElementById('btn-run-ping'),
    throughputResult: document.getElementById('throughput-result'),
    btnRunThroughput: document.getElementById('btn-run-throughput'),
    btnClearLocalStorage: document.getElementById('btn-clear-localstorage'),

    // Toast
    toast: document.getElementById('toast')
  };

  // --- UTILITIES ---

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // Exact prompt formula: percentage = clamp((RSSI + 100) * 2, 0, 100)
  function rssiToPercentage(rssi) {
    if (typeof rssi !== 'number' || isNaN(rssi)) return 0;
    return clamp(Math.round((rssi + 100) * 2), 0, 100);
  }

  // Signal assessment logic:
  // Green for Good: >= -65 dBm
  // Yellow for Medium: -66 to -75 dBm
  // Red for Bad: < -75 dBm
  function getSignalInfo(rssi) {
    if (typeof rssi !== 'number' || isNaN(rssi)) {
      return { color: '#E65345', class: 'bad', label: 'Bad' };
    }
    if (rssi >= -65) {
      return { color: '#00C99A', class: 'good', label: 'Good' };
    }
    if (rssi >= -75) {
      return { color: '#FFD600', class: 'medium', label: 'Medium' };
    }
    return { color: '#E65345', class: 'bad', label: 'Bad' };
  }

  function getSignalColor(rssi) {
    return getSignalInfo(rssi).color;
  }

  function getSignalQualityLabel(rssi) {
    return getSignalInfo(rssi).label;
  }

  // Channel center frequency in MHz (2.4 GHz band)
  function channelToFrequency(ch) {
    if (ch >= 1 && ch <= 13) return 2412 + (ch - 1) * 5;
    if (ch === 14) return 2484;
    return 2412;
  }

  // Approximate free space path loss distance estimate
  function estimateDistance(rssi, freqMHz) {
    if (!rssi) return 'N/A';
    const f = freqMHz || 2437;
    // Friis formula: distance = 10 ^ ((27.55 - (20 * log10(f)) + abs(rssi)) / 20)
    const exp = (27.55 - (20 * Math.log10(f)) + Math.abs(rssi)) / 20.0;
    const dist = Math.pow(10, exp);
    if (dist < 1) return '< 1 m';
    if (dist > 150) return '> 150 m';
    return `${dist.toFixed(1)} m`;
  }

  function showToast(message, duration = 2500) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add('show');
    clearTimeout(el.toast._timer);
    el.toast._timer = setTimeout(() => {
      el.toast.classList.remove('show');
    }, duration);
  }

  // --- LOCAL STORAGE MANAGEMENT ---

  function loadSavedStorage() {
    try {
      const best = localStorage.getItem(STORAGE_BEST_RSSI);
      if (best) state.bestRSSI = JSON.parse(best);
    } catch (e) {
      console.warn('Failed to parse saved best RSSI:', e);
      state.bestRSSI = {};
    }

    try {
      const tags = localStorage.getItem(STORAGE_ROOM_TAGS);
      if (tags) state.roomTags = JSON.parse(tags);
    } catch (e) {
      console.warn('Failed to parse saved room tags:', e);
      state.roomTags = {};
    }
  }

  function saveBestRSSI() {
    try {
      localStorage.setItem(STORAGE_BEST_RSSI, JSON.stringify(state.bestRSSI));
    } catch (e) {
      console.warn('Failed to save best RSSI:', e);
    }
  }

  function saveRoomTags() {
    try {
      localStorage.setItem(STORAGE_ROOM_TAGS, JSON.stringify(state.roomTags));
    } catch (e) {
      console.warn('Failed to save room tags:', e);
    }
  }

  // Update best RSSI records for all received networks
  function updateBestRSSIRecords(networks) {
    let hasChanges = false;
    const now = Date.now();

    networks.forEach(net => {
      if (!net.bssid) return;
      const bssid = net.bssid.toUpperCase();
      const current = net.rssi;

      // Initialize or update best RSSI (algebraically greater: -50 > -70)
      if (state.bestRSSI[bssid] === undefined || current > state.bestRSSI[bssid]) {
        state.bestRSSI[bssid] = current;
        hasChanges = true;
      }

      // Record in-session history sparkline log
      if (!state.historyLog[bssid]) {
        state.historyLog[bssid] = [];
      }
      state.historyLog[bssid].push({ rssi: current, time: now });
      if (state.historyLog[bssid].length > 30) {
        state.historyLog[bssid].shift();
      }
    });

    if (hasChanges) {
      saveBestRSSI();
    }
  }

  // --- SVG ICONS GENERATOR ---

  function getWifiSvgIcon(rssi) {
    const color = getSignalColor(rssi);
    // 4 curved bars: dot, inner, mid, outer
    const pct = rssiToPercentage(rssi);
    const op1 = pct > 15 ? 1 : 0.25;
    const op2 = pct > 40 ? 1 : 0.25;
    const op3 = pct > 70 ? 1 : 0.25;

    return `
      <svg class="wifi-icon" viewBox="0 0 24 24" style="color: ${color};">
        <path d="M12 18.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5z" fill="currentColor"/>
        <path d="M12 14c-2.3 0-4.38.93-5.9 2.44l1.42 1.42C8.67 16.71 10.24 16 12 16s3.33.71 4.48 1.86l1.42-1.42C16.38 14.93 14.3 14 12 14z" fill="currentColor" opacity="${op1}"/>
        <path d="M12 9.5c-3.53 0-6.73 1.43-9.05 3.75l1.42 1.42C6.31 12.73 9 11.5 12 11.5s5.69 1.23 7.63 3.17l1.42-1.42C18.73 10.93 15.53 9.5 12 9.5z" fill="currentColor" opacity="${op2}"/>
        <path d="M12 5C7.27 5 2.99 6.91-.01 10.02l1.42 1.42C3.84 8.79 7.69 7 12 7s8.16 1.79 10.59 4.44l1.42-1.42C21.01 6.91 16.73 5 12 5z" fill="currentColor" opacity="${op3}"/>
      </svg>
    `;
  }

  function getLockSvgIcon() {
    return `
      <svg viewBox="0 0 24 24">
        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
      </svg>
    `;
  }

  // --- RENDERING: TAB 1 (LIST VIEW) ---

  function renderNetworkList() {
    if (!el.networkList) return;

    let list = [...state.networks];

    // 1. Search Query Filter
    if (state.searchQuery.trim() !== '') {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(net => {
        const ssid = (net.ssid || '').toLowerCase();
        const bssid = (net.bssid || '').toLowerCase();
        const tag = (state.roomTags[net.bssid?.toUpperCase()] || '').toLowerCase();
        return ssid.includes(q) || bssid.includes(q) || tag.includes(q);
      });
    }

    // 2. Type Filter
    if (state.filterType === 'secured') {
      list = list.filter(net => net.isSecured || (net.encryption && net.encryption !== 'OPEN'));
    } else if (state.filterType === 'open') {
      list = list.filter(net => !net.isSecured && (!net.encryption || net.encryption === 'OPEN'));
    } else if (state.filterType === 'strong') {
      list = list.filter(net => net.rssi >= -65);
    } else if (state.filterType === 'weak') {
      list = list.filter(net => net.rssi < -75);
    }

    // 3. Sorting
    if (state.sortType === 'rssi') {
      list.sort((a, b) => b.rssi - a.rssi); // Strongest first (-45 before -75)
    } else if (state.sortType === 'ssid') {
      list.sort((a, b) => (a.ssid || '').localeCompare(b.ssid || ''));
    } else if (state.sortType === 'channel') {
      list.sort((a, b) => (a.channel || 0) - (b.channel || 0));
    }

    // Update Status Bar Count
    el.networkCountText.textContent = `${list.length} of ${state.networks.length} networks · 2.4 GHz`;

    if (list.length === 0) {
      if (state.networks.length === 0) {
        el.networkList.innerHTML = `
          <div class="empty-state">
            <div class="spinner"></div>
            <p>Scanning 2.4 GHz Wi-Fi spectrum...</p>
          </div>
        `;
      } else {
        el.networkList.innerHTML = `
          <div class="empty-state">
            <p>No networks match the current filter or search criteria.</p>
          </div>
        `;
      }
      return;
    }

    // Build Dense Network Rows HTML
    let html = '';
    for (const net of list) {
      const bssidUpper = (net.bssid || '').toUpperCase();
      const currentRSSI = net.rssi;
      const bestRSSI = state.bestRSSI[bssidUpper] !== undefined ? state.bestRSSI[bssidUpper] : currentRSSI;
      const currentPct = rssiToPercentage(currentRSSI);
      const bestPct = rssiToPercentage(bestRSSI);
      const sigInfo = getSignalInfo(currentRSSI);
      const isSecured = net.isSecured || (net.encryption && net.encryption !== 'OPEN');
      const securityLabel = net.encryption || (isSecured ? 'WPA2' : 'OPEN');
      const roomTag = state.roomTags[bssidUpper];
      const tagHtml = roomTag ? `<span class="location-tag-pill">${escapeHtml(roomTag)}</span>` : '';

      html += `
        <div class="network-item" data-bssid="${escapeHtml(bssidUpper)}">
          <div class="network-header">
            <div class="network-icon-col">
              <div class="wifi-icon-stack">
                ${getWifiSvgIcon(currentRSSI)}
                ${isSecured ? `<span class="lock-badge">${getLockSvgIcon()}</span>` : ''}
              </div>
            </div>

            <div class="network-info-col">
              <div class="network-ssid">${escapeHtml(net.ssid || '[Hidden SSID]')}${tagHtml}</div>
              <div class="network-meta">Channel ${net.channel || '?'} · ${escapeHtml(securityLabel)} <span class="sig-badge ${sigInfo.class}">${sigInfo.label}</span></div>
            </div>

            <div class="network-rssi-col">
              <div class="current-rssi ${sigInfo.class}">${currentRSSI} dBm</div>
              <div class="best-rssi">${bestRSSI} Best</div>
            </div>
          </div>

          <div class="signal-bar-wrap">
            <div class="signal-bar-track">
              <div class="signal-bar-fill ${sigInfo.class}" style="width: ${currentPct}%;"></div>
              <div class="signal-bar-best-tick" style="left: ${bestPct}%;" title="Best: ${bestRSSI} dBm"></div>
            </div>
          </div>
        </div>
      `;
    }

    el.networkList.innerHTML = html;

    // Attach click handlers to rows to open Discovery Tab
    const rows = el.networkList.querySelectorAll('.network-item');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        const bssid = row.getAttribute('data-bssid');
        if (bssid) {
          selectNetworkForDiscovery(bssid);
          switchTab('tab-discovery');
        }
      });
    });
  }

  // --- RENDERING: TAB 2 (CHANNELS SPECTRUM) ---

  function renderChannelsView() {
    if (!el.spectrumSvg || !el.channelBreakdownList) return;

    // Group networks by channel (1 to 14)
    const channelMap = {};
    for (let c = 1; c <= 14; c++) {
      channelMap[c] = [];
    }

    state.networks.forEach(net => {
      const ch = parseInt(net.channel, 10);
      if (ch >= 1 && ch <= 14) {
        channelMap[ch].push(net);
      }
    });

    let activeChannelsCount = 0;
    for (let c = 1; c <= 14; c++) {
      if (channelMap[c].length > 0) activeChannelsCount++;
    }
    el.chActiveSummary.textContent = `${activeChannelsCount} Active Channels detected`;

    // Render SVG Spectrum Parabolic Waves
    // SVG viewBox: 0 0 380 200
    // X channels: 1 to 14 mapped across X = 15 to 365
    // Y dBm: -100 (Y=185) to -40 (Y=20)
    const startX = 20;
    const endX = 360;
    const chStep = (endX - startX) / 13; // 14 channels = 13 intervals

    function chToX(ch) {
      return startX + (ch - 1) * chStep;
    }

    function rssiToY(rssi) {
      // -100 dBm -> Y=185, -40 dBm -> Y=25
      const clamped = clamp(rssi, -100, -40);
      const ratio = (clamped - (-100)) / 60.0; // 0.0 at -100, 1.0 at -40
      return 185 - (ratio * 160);
    }

    let svgHtml = `
      <defs>
        <linearGradient id="curveGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#20BCEB" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#20BCEB" stop-opacity="0.0"/>
        </linearGradient>
      </defs>

      <!-- Background Grid lines -->
      <line x1="15" y1="25" x2="365" y2="25" stroke="#333" stroke-dasharray="2,2" stroke-width="0.8"/>
      <line x1="15" y1="65" x2="365" y2="65" stroke="#333" stroke-dasharray="2,2" stroke-width="0.8"/>
      <line x1="15" y1="105" x2="365" y2="105" stroke="#333" stroke-dasharray="2,2" stroke-width="0.8"/>
      <line x1="15" y1="145" x2="365" y2="145" stroke="#333" stroke-dasharray="2,2" stroke-width="0.8"/>
      <line x1="15" y1="185" x2="365" y2="185" stroke="#444" stroke-width="1.2"/>

      <!-- Y Axis dBm labels -->
      <text x="2" y="28" fill="#666" font-size="8">-40</text>
      <text x="2" y="68" fill="#666" font-size="8">-55</text>
      <text x="2" y="108" fill="#666" font-size="8">-70</text>
      <text x="2" y="148" fill="#666" font-size="8">-85</text>
      <text x="0" y="188" fill="#666" font-size="8">-100</text>
    `;

    // Render channels vertical guide markers for standard channels 1, 6, 11
    [1, 6, 11].forEach(stdCh => {
      const cx = chToX(stdCh);
      svgHtml += `<line x1="${cx}" y1="15" x2="${cx}" y2="185" stroke="#3d4454" stroke-width="0.8" stroke-dasharray="3,3"/>`;
    });

    // Draw Parabolic curves for each detected network
    // A 2.4 GHz 20 MHz Wi-Fi signal spans approx +- 2 channels width
    const halfWidthX = chStep * 2;

    state.networks.forEach((net, index) => {
      const ch = parseInt(net.channel, 10);
      if (ch < 1 || ch > 14) return;

      const centerX = chToX(ch);
      const peakY = rssiToY(net.rssi);
      const baseY = 185;
      const leftX = Math.max(15, centerX - halfWidthX);
      const rightX = Math.min(365, centerX + halfWidthX);
      const strokeColor = getSignalColor(net.rssi);

      // SVG quadratic curve
      const pathD = `M ${leftX} ${baseY} Q ${centerX} ${peakY} ${rightX} ${baseY}`;
      svgHtml += `
        <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="1.8" opacity="0.85" />
      `;

      // Label at peak (truncate SSID)
      const cleanSSID = (net.ssid || 'AP').substring(0, 8);
      svgHtml += `
        <text x="${centerX}" y="${peakY - 4}" fill="${strokeColor}" font-size="8" font-weight="600" text-anchor="middle">
          ${escapeHtml(cleanSSID)}
        </text>
      `;
    });

    el.spectrumSvg.innerHTML = svgHtml;

    // Render Channel Breakdown Cards List
    let listHtml = '';
    for (let c = 1; c <= 14; c++) {
      const nets = channelMap[c];
      const count = nets.length;
      if (count === 0) continue;

      const isStd = (c === 1 || c === 6 || c === 11);
      let statusClass = 'low';
      let statusText = 'Clean';
      if (count >= 5) {
        statusClass = 'congested';
        statusText = 'Congested';
      } else if (count >= 3) {
        statusClass = 'moderate';
        statusText = 'Moderate';
      }

      const names = nets.map(n => `${escapeHtml(n.ssid || '[Hidden]')} (${n.rssi} dBm)`).join(', ');

      listHtml += `
        <div class="channel-row-card">
          <div class="ch-badge-col">
            <div class="ch-number-badge ${isStd ? 'recommended' : ''}">
              ${c}
            </div>
          </div>
          <div class="ch-info-col">
            <div class="ch-networks-names" title="${names}">${names}</div>
            <div class="ch-count-meta">${count} AP${count > 1 ? 's' : ''} · ${channelToFrequency(c)} MHz ${isStd ? '· Primary Non-Overlapping' : ''}</div>
          </div>
          <div class="ch-status-col ${statusClass}">
            ${statusText}
          </div>
        </div>
      `;
    }

    if (listHtml === '') {
      listHtml = '<div class="empty-state"><p>No active 2.4 GHz channels detected yet.</p></div>';
    }

    el.channelBreakdownList.innerHTML = listHtml;
  }

  // --- RENDERING: TAB 3 (DISCOVERY VIEW) ---

  function selectNetworkForDiscovery(bssid) {
    state.selectedBSSID = bssid ? bssid.toUpperCase() : null;
    renderDiscoveryView();
  }

  function renderDiscoveryView() {
    if (!el.discoverySelect || !el.discoveryDetails) return;

    // Populate Selector Dropdown
    let optionsHtml = '<option value="">-- Choose a network to inspect --</option>';
    state.networks.forEach(net => {
      const bUpper = (net.bssid || '').toUpperCase();
      const selected = bUpper === state.selectedBSSID ? 'selected' : '';
      const tag = state.roomTags[bUpper] ? ` [${state.roomTags[bUpper]}]` : '';
      optionsHtml += `<option value="${escapeHtml(bUpper)}" ${selected}>${escapeHtml(net.ssid || '[Hidden]')} (${net.rssi} dBm)${escapeHtml(tag)}</option>`;
    });
    el.discoverySelect.innerHTML = optionsHtml;

    if (!state.selectedBSSID) {
      el.discoveryDetails.innerHTML = `
        <div class="no-selection-msg">
          <p>Select a network from the List tab or choose from the dropdown above to view deep diagnostic details, signal telemetry, and assign location tags.</p>
        </div>
      `;
      return;
    }

    const net = state.networks.find(n => (n.bssid || '').toUpperCase() === state.selectedBSSID);
    if (!net) {
      el.discoveryDetails.innerHTML = `
        <div class="no-selection-msg">
          <p>The selected network (${state.selectedBSSID}) was not detected in the latest scan.</p>
        </div>
      `;
      return;
    }

    const bssidUpper = state.selectedBSSID;
    const currentRSSI = net.rssi;
    const bestRSSI = state.bestRSSI[bssidUpper] !== undefined ? state.bestRSSI[bssidUpper] : currentRSSI;
    const freq = channelToFrequency(net.channel);
    const dist = estimateDistance(currentRSSI, freq);
    const quality = getSignalQualityLabel(currentRSSI);
    const pct = rssiToPercentage(currentRSSI);
    const isSecured = net.isSecured || (net.encryption && net.encryption !== 'OPEN');
    const secType = net.encryption || (isSecured ? 'WPA2-PSK' : 'OPEN');
    const roomTag = state.roomTags[bssidUpper] || '';
    const sigInfo = getSignalInfo(currentRSSI);
    const colorClass = sigInfo.class === 'good' ? 'green' : (sigInfo.class === 'medium' ? 'yellow' : 'red');

    // Build Sparkline for recent readings
    const history = state.historyLog[bssidUpper] || [{ rssi: currentRSSI, time: Date.now() }];
    let sparklineSvg = '';
    if (history.length > 1) {
      const w = 340;
      const h = 75;
      const pts = history.map((item, idx) => {
        const x = (idx / (history.length - 1)) * (w - 20) + 10;
        const clamped = clamp(item.rssi, -100, -40);
        const y = h - 10 - ((clamped - (-100)) / 60.0) * (h - 20);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');

      sparklineSvg = `
        <svg viewBox="0 0 340 75" preserveAspectRatio="none">
          <polyline fill="none" stroke="${getSignalColor(currentRSSI)}" stroke-width="2" points="${pts}"/>
          ${history.map((item, idx) => {
            const x = (idx / (history.length - 1)) * (w - 20) + 10;
            const clamped = clamp(item.rssi, -100, -40);
            const y = h - 10 - ((clamped - (-100)) / 60.0) * (h - 20);
            return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="#EEEEEE"/>`;
          }).join('')}
        </svg>
      `;
    } else {
      sparklineSvg = '<div style="padding: 24px; text-align: center; color: #777; font-size: 11px;">Gathering historical telemetry points...</div>';
    }

    el.discoveryDetails.innerHTML = `
      <div class="discovery-card">
        <div class="disc-head">
          <div>
            <div class="disc-ssid">${escapeHtml(net.ssid || '[Hidden Network]')}</div>
            <div class="disc-bssid">${escapeHtml(bssidUpper)}</div>
          </div>
          <div class="disc-badge">${escapeHtml(secType)}</div>
        </div>

        <div class="disc-grid">
          <div class="disc-item">
            <span class="disc-label">Current Signal</span>
            <span class="disc-val ${colorClass}">${currentRSSI} dBm (${pct}%)</span>
          </div>
          <div class="disc-item">
            <span class="disc-label">Historical Best</span>
            <span class="disc-val">${bestRSSI} dBm</span>
          </div>
          <div class="disc-item">
            <span class="disc-label">Quality Rating</span>
            <span class="disc-val">${quality}</span>
          </div>
          <div class="disc-item">
            <span class="disc-label">Estimated Distance</span>
            <span class="disc-val">${dist}</span>
          </div>
          <div class="disc-item">
            <span class="disc-label">Channel & Freq</span>
            <span class="disc-val">CH ${net.channel || '?'} (${freq} MHz)</span>
          </div>
          <div class="disc-item">
            <span class="disc-label">Security Protocol</span>
            <span class="disc-val">${escapeHtml(secType)}</span>
          </div>
        </div>
      </div>

      <!-- Location Tagging -->
      <div class="discovery-card">
        <div class="disc-label">ROOM / SURVEY LOCATION LABEL</div>
        <p style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
          Assign a persistent custom location tag (e.g. Bedroom, Hallway, Office) stored locally in browser storage.
        </p>
        <div class="tag-input-row">
          <input type="text" id="input-room-tag" placeholder="e.g. Living Room, Desk" value="${escapeHtml(roomTag)}" maxlength="30">
          <button id="btn-save-tag">Save Tag</button>
        </div>
      </div>

      <!-- Historical Signal Sparkline -->
      <div class="discovery-card">
        <div class="disc-label">REAL-TIME SIGNAL TELEMETRY TREND (${history.length} SAMPLES)</div>
        <div class="history-sparkline-wrap">
          ${sparklineSvg}
        </div>
      </div>
    `;

    // Hook Room Tag Save
    const btnSaveTag = document.getElementById('btn-save-tag');
    const inputRoomTag = document.getElementById('input-room-tag');
    if (btnSaveTag && inputRoomTag) {
      btnSaveTag.addEventListener('click', () => {
        const tag = inputRoomTag.value.trim();
        if (tag) {
          state.roomTags[bssidUpper] = tag;
          showToast(`Location tagged as "${tag}"`);
        } else {
          delete state.roomTags[bssidUpper];
          showToast('Location tag cleared');
        }
        saveRoomTags();
        renderNetworkList();
        renderDiscoveryView();
      });
    }
  }

  // --- RENDERING: TAB 4 (SPEED TEST & DIAGNOSTICS) ---

  function renderDiagnosticsView() {
    const s = state.espStatus || {};
    if (el.diagUptime) el.diagUptime.textContent = `Uptime: ${formatUptime(s.uptimeSeconds || 0)}`;
    if (el.diagMode) el.diagMode.textContent = s.mode || 'ESP32 Station (STA)';
    if (el.diagSsid) el.diagSsid.textContent = s.connectedSSID || '--';
    if (el.diagIp) el.diagIp.textContent = s.ip || window.location.hostname || '--';
    if (el.diagMac) el.diagMac.textContent = s.mac || '--';
    if (el.diagHeap) el.diagHeap.textContent = s.freeHeap ? `${Math.round(s.freeHeap / 1024)} KB` : '-- KB';
    if (el.diagDuration) el.diagDuration.textContent = s.lastScanDuration ? `${s.lastScanDuration} ms` : '-- ms';
    if (el.diagTotalAp) el.diagTotalAp.textContent = s.detectedCount !== undefined ? s.detectedCount : state.networks.length;
  }

  function formatUptime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // --- BENCHMARKS (PING & THROUGHPUT) ---

  async function runPingTest() {
    if (el.btnRunPing) el.btnRunPing.disabled = true;
    el.pingResult.textContent = 'Testing...';

    const pings = [];
    try {
      for (let i = 0; i < 4; i++) {
        const start = performance.now();
        const res = await fetch(`/api/ping?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const latency = Math.round(performance.now() - start);
          pings.push(latency);
        }
        await new Promise(r => setTimeout(r, 100));
      }

      if (pings.length > 0) {
        const avg = Math.round(pings.reduce((a, b) => a + b, 0) / pings.length);
        const min = Math.min(...pings);
        const max = Math.max(...pings);
        el.pingResult.textContent = `${avg} ms (min ${min} / max ${max})`;
      } else {
        el.pingResult.textContent = 'Error';
      }
    } catch (err) {
      console.error('Ping test error:', err);
      el.pingResult.textContent = 'Failed';
    } finally {
      if (el.btnRunPing) el.btnRunPing.disabled = false;
    }
  }

  async function runThroughputTest() {
    if (el.btnRunThroughput) el.btnRunThroughput.disabled = true;
    el.throughputResult.textContent = 'Transferring...';

    try {
      const startTime = performance.now();
      const res = await fetch(`/api/speedtest?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const durationSec = (performance.now() - startTime) / 1000.0;
      const bytes = blob.size;

      // Calculate speed in Megabits per second
      const bits = bytes * 8;
      const mbps = (bits / (durationSec * 1000000.0)).toFixed(2);
      el.throughputResult.textContent = `${mbps} Mbps (${Math.round(bytes / 1024)} KB in ${durationSec.toFixed(2)}s)`;
    } catch (err) {
      console.error('Throughput test error:', err);
      el.throughputResult.textContent = 'Unavailable';
    } finally {
      if (el.btnRunThroughput) el.btnRunThroughput.disabled = false;
    }
  }

  // --- DATA FETCHING & ASYNC SCANNING ---

  async function fetchScanResults() {
    try {
      const res = await fetch('/api/results', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (Array.isArray(data)) {
        state.networks = data;
        updateBestRSSIRecords(state.networks);
        renderCurrentTab();
      }
    } catch (err) {
      console.warn('Could not fetch scan results:', err);
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.espStatus = data;

      // Update Live Indicator
      if (data.scanning) {
        state.isScanning = true;
        el.liveDot.classList.add('scanning');
        el.btnScanNow.classList.add('spinning');
        el.scanBtnLabel.textContent = 'Scanning';
      } else {
        const wasScanning = state.isScanning;
        state.isScanning = false;
        el.liveDot.classList.remove('scanning');
        el.btnScanNow.classList.remove('spinning');
        el.scanBtnLabel.textContent = 'Scan';

        // If a scan just finished, fetch fresh results
        if (wasScanning) {
          await fetchScanResults();
        }
      }

      if (state.activeTab === 'tab-diagnostics') {
        renderDiagnosticsView();
      }
    } catch (err) {
      console.warn('Status poll warning:', err);
    }
  }

  async function triggerScan() {
    if (state.isScanning) return;
    try {
      el.btnScanNow.classList.add('spinning');
      el.scanBtnLabel.textContent = 'Scanning';
      state.isScanning = true;
      el.liveDot.classList.add('scanning');

      const res = await fetch('/api/scan', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      showToast('Wi-Fi scan initiated');
      // Trigger status check shortly
      setTimeout(fetchStatus, 1000);
    } catch (err) {
      console.error('Failed to trigger scan:', err);
      showToast('Scan request error');
      state.isScanning = false;
      el.liveDot.classList.remove('scanning');
      el.btnScanNow.classList.remove('spinning');
      el.scanBtnLabel.textContent = 'Scan';
    }
  }

  // --- TAB SWITCHING ---

  function switchTab(tabId) {
    state.activeTab = tabId;

    el.tabViews.forEach(v => {
      if (v.id === tabId) {
        v.classList.add('active');
      } else {
        v.classList.remove('active');
      }
    });

    el.navItems.forEach(item => {
      if (item.getAttribute('data-tab') === tabId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    renderCurrentTab();
  }

  function renderCurrentTab() {
    if (state.activeTab === 'tab-list') {
      renderNetworkList();
    } else if (state.activeTab === 'tab-channels') {
      renderChannelsView();
    } else if (state.activeTab === 'tab-discovery') {
      renderDiscoveryView();
    } else if (state.activeTab === 'tab-diagnostics') {
      renderDiagnosticsView();
    }
  }

  // --- EVENT LISTENERS ---

  function initEventListeners() {
    // Bottom Nav Tabs
    el.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        if (tab) switchTab(tab);
      });
    });

    // Back Arrow Button
    el.btnBack.addEventListener('click', () => {
      if (state.activeTab !== 'tab-list') {
        switchTab('tab-list');
      } else if (state.searchQuery !== '') {
        state.searchQuery = '';
        el.searchInput.value = '';
        el.btnClearSearch.classList.remove('visible');
        renderNetworkList();
      } else {
        triggerScan();
      }
    });

    // Search Input
    el.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (state.searchQuery.length > 0) {
        el.btnClearSearch.classList.add('visible');
      } else {
        el.btnClearSearch.classList.remove('visible');
      }
      renderNetworkList();
    });

    // Clear Search Button
    el.btnClearSearch.addEventListener('click', () => {
      state.searchQuery = '';
      el.searchInput.value = '';
      el.btnClearSearch.classList.remove('visible');
      renderNetworkList();
      el.searchInput.focus();
    });

    // Filter Button & Modal
    el.btnFilter.addEventListener('click', () => {
      el.filterModal.classList.add('open');
    });

    el.btnCloseFilter.addEventListener('click', () => {
      el.filterModal.classList.remove('open');
    });

    el.filterModal.addEventListener('click', (e) => {
      if (e.target === el.filterModal) {
        el.filterModal.classList.remove('open');
      }
    });

    el.btnResetFilter.addEventListener('click', () => {
      state.filterType = 'all';
      state.sortType = 'rssi';
      document.querySelector('input[name="filter-type"][value="all"]').checked = true;
      document.querySelector('input[name="sort-type"][value="rssi"]').checked = true;
      el.filterIndicator.classList.remove('active');
      el.filterModal.classList.remove('open');
      renderNetworkList();
      showToast('Filters reset to default');
    });

    el.btnApplyFilter.addEventListener('click', () => {
      const selectedFilter = document.querySelector('input[name="filter-type"]:checked');
      const selectedSort = document.querySelector('input[name="sort-type"]:checked');
      if (selectedFilter) state.filterType = selectedFilter.value;
      if (selectedSort) state.sortType = selectedSort.value;

      if (state.filterType !== 'all' || state.sortType !== 'rssi') {
        el.filterIndicator.classList.add('active');
      } else {
        el.filterIndicator.classList.remove('active');
      }

      el.filterModal.classList.remove('open');
      renderNetworkList();
    });

    // Scan Button
    el.btnScanNow.addEventListener('click', triggerScan);

    // Discovery Selector
    el.discoverySelect.addEventListener('change', (e) => {
      selectNetworkForDiscovery(e.target.value);
    });

    // Benchmarks
    if (el.btnRunPing) el.btnRunPing.addEventListener('click', runPingTest);
    if (el.btnRunThroughput) el.btnRunThroughput.addEventListener('click', runThroughputTest);

    // Clear Local Storage
    if (el.btnClearLocalStorage) {
      el.btnClearLocalStorage.addEventListener('click', () => {
        if (confirm('Clear all saved best RSSI records and room labels?')) {
          state.bestRSSI = {};
          state.roomTags = {};
          localStorage.removeItem(STORAGE_BEST_RSSI);
          localStorage.removeItem(STORAGE_ROOM_TAGS);
          showToast('Records cleared');
          renderNetworkList();
          renderDiscoveryView();
        }
      });
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- PWA (PROGRESSIVE WEB APP) INSTALLATION & SERVICE WORKER ---
  let deferredInstallPrompt = null;

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then((reg) => {
            console.log('[PWA] Service Worker registered with scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err);
          });
      });
    }
  }

  function initPwaInstallPrompt() {
    const pwaBanner = document.getElementById('pwa-banner');
    const btnBannerInstall = document.getElementById('btn-banner-install');
    const btnBannerDismiss = document.getElementById('btn-banner-dismiss');
    const btnInstallPwa = document.getElementById('btn-install-pwa');

    // Android Chrome triggers beforeinstallprompt when PWA criteria are met
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;

      if (btnInstallPwa) {
        btnInstallPwa.style.display = 'inline-flex';
      }

      if (pwaBanner && !sessionStorage.getItem('wavescan_pwa_dismissed')) {
        setTimeout(() => {
          pwaBanner.classList.add('visible');
        }, 1500);
      }
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      if (pwaBanner) pwaBanner.classList.remove('visible');
      if (btnInstallPwa) btnInstallPwa.style.display = 'none';
      showToast('WΛVΞSCAN installed to home screen!');
    });

    async function triggerInstallFlow() {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('Installing WΛVΞSCAN...');
        }
        deferredInstallPrompt = null;
        if (pwaBanner) pwaBanner.classList.remove('visible');
      } else {
        // Helpful fallback instruction for browsers without direct prompt event
        showToast('To install: Tap Chrome menu (⋮) -> "Add to Home screen" or "Install App"', 4000);
      }
    }

    if (btnBannerInstall) {
      btnBannerInstall.addEventListener('click', triggerInstallFlow);
    }

    if (btnInstallPwa) {
      btnInstallPwa.addEventListener('click', triggerInstallFlow);
    }

    if (btnBannerDismiss) {
      btnBannerDismiss.addEventListener('click', () => {
        if (pwaBanner) pwaBanner.classList.remove('visible');
        sessionStorage.setItem('wavescan_pwa_dismissed', '1');
      });
    }
  }

  // --- INITIALIZATION ---

  async function init() {
    registerServiceWorker();
    initPwaInstallPrompt();
    loadSavedStorage();
    initEventListeners();

    // Initial data fetch
    await fetchStatus();
    await fetchScanResults();

    // Start background auto-poll (every 3.5 seconds)
    state.autoScanTimer = setInterval(async () => {
      await fetchStatus();
    }, 3500);
  }

  document.addEventListener('DOMContentLoaded', init);
})();

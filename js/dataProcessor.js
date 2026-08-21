// --- DATA PROCESSING, EXCEL UPLOADER, ROUTING & AI ---

function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('fileName').innerText = file.name;
    document.getElementById('fileInfo').classList.remove('hidden');
    document.getElementById('dropZone').classList.add('hidden');
    const reader = new FileReader();
    reader.onload = function(e) {
        const wb = XLSX.read(new Uint8Array(e.target.result), {type: 'array'});
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        processData(json);
    };
    reader.readAsArrayBuffer(file);
}

function processData(json) {
    let newData = [];
    if (json.length === 0) { showToast("File kosong atau tidak dapat dibaca.", 'error'); resetUpload(); return; }
    let latKey, lonKey, combinedKey;
    const keys = Object.keys(json[0] || {});

    combinedKey = keys.find(k => {
        const kl = k.toLowerCase().replace(/[\s_]/g, '');
        return kl === 'latlong' || kl === 'latlng' || (kl.includes('lat') && (kl.includes('lon') || kl.includes('lng')));
    });

    if (!combinedKey) {
        latKey = keys.find(k => k.toLowerCase() === 'lat' || k.toLowerCase() === 'latitude' || k.toLowerCase().startsWith('lat'));
        lonKey = keys.find(k => k.toLowerCase() === 'lon' || k.toLowerCase() === 'lng' || k.toLowerCase() === 'longitude' || k.toLowerCase().startsWith('lon') || k.toLowerCase().startsWith('lng'));
    }

    if (!latKey && !lonKey && !combinedKey) {
        combinedKey = keys.find(k => {
            const val = json[0][k];
            return typeof val === 'string' && val.trim().match(/^-?\d+(\.\d+)?\s*[,;]\s*-?\d+(\.\d+)?$/);
        });
    }

    if(!latKey && !lonKey && !combinedKey) return showToast("Kolom Latitude/Longitude tidak ditemukan.", 'error');

    json.forEach(row => {
        let lat, lng;
        if (combinedKey && row[combinedKey]) {
            const parts = row[combinedKey].toString().replace(/['"]/g, '').trim().split(/\s*[,;]\s*|\s+/);
            if(parts.length >= 2) { lat = parseFloat(parts[0]); lng = parseFloat(parts[1]); }
        } else if (latKey && lonKey) {
            lat = parseFloat(row[latKey]); lng = parseFloat(row[lonKey]);
        }
        if(!isNaN(lat) && !isNaN(lng)) { newData.push({ lat: lat, lng: lng, props: row }); }
    });

    if(newData.length > 0) {
        rawData = newData;
        displayData = [...rawData];
        map.fitBounds(L.latLngBounds(newData.map(d=>[d.lat,d.lng])), { padding: [20, 20] });

        document.getElementById('viewMode').value = 'line';
        updateUI();
        toggleModal('dataEntryModal', false);
        showToast("Data berhasil dimuat! Mode visualisasi otomatis diatur ke Garis (Jalur).", "success");
    }
    else showToast("Data tidak valid (tidak ada koordinat yang terdeteksi).", 'error');
}

function resetUpload() { document.getElementById('fileInput').value = ''; document.getElementById('fileInfo').classList.add('hidden'); document.getElementById('dropZone').classList.remove('hidden'); }

function generateDummyData() {
    rawData=[]; const clat=-6.200, clng=106.816;
    for(let i=0; i<1000; i++) {
        const u = 1 - Math.random(); const v = 1 - Math.random();
        const randStdNormal = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
        let lat = clat + (randStdNormal * 0.05); let lng = clng + ((Math.random() - 0.5) * 0.08);
        let spd = Math.random() > 0.2 ? Math.floor(Math.random()*100) : 0;
        let h = Math.floor(i/20); let m = (i%60);
        let time = `28/07/2026 ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
        let row = { 'Latitude': lat, 'Longitude': lng, 'Time': time, 'Speed (km/h)': spd, 'Vehicle Status': spd === 0 ? 'OFF' : 'ON', 'Plate': 'B 9267 SFW' };
        rawData.push({ lat: lat, lng: lng, props: row });
    }
    displayData=[...rawData]; map.fitBounds(L.latLngBounds(rawData.map(d=>[d.lat,d.lng])), { padding: [20, 20] }); updateUI(); toggleModal('dataEntryModal', false);
}

// --- DATA MANAGER & TABLE ---
let managerFilterText = "";
function filterManagerData(val) { managerFilterText = val; openDataManager(1); }

function openDataManager(page) {
    if (typeof page === 'number') currentPage = page;
    toggleModal('dataManagerModal', true);
    const table = document.getElementById('mainDataTable');
    table.innerHTML = '';

    let filteredWithIndex = rawData.map((d, index) => ({...d, originalIndex: index}));
    if (managerFilterText) {
        const lowerQuery = managerFilterText.toLowerCase();
        filteredWithIndex = filteredWithIndex.filter(d => {
            return Object.entries(d.props).some(([k, val]) => {
                const strVal = formatValueForDisplay(val, k);
                return strVal !== undefined && strVal !== null && strVal.toString().toLowerCase().includes(lowerQuery);
            });
        });
    }

    document.getElementById('managerCount').innerText = filteredWithIndex.length;
    const searchInput = document.getElementById('managerSearchInput');
    if (searchInput && searchInput.value !== managerFilterText) searchInput.value = managerFilterText;

    if(filteredWithIndex.length === 0) {
        document.getElementById('tableFooter').innerHTML = '<span class="text-slate-400 italic">Tidak ada data.</span>';
        return;
    }

    const headers = Object.keys(filteredWithIndex[0].props);
    let thead = '<thead><tr><th class="w-10">#</th>';
    headers.forEach(h => { if(h !== '_sec') thead += `<th>${h}</th>`; });
    thead += '<th class="w-10 text-center">Aksi</th></tr></thead>';
    table.innerHTML = thead;

    let tbody = '<tbody>';
    const totalPages = Math.ceil(filteredWithIndex.length / itemsPerPage);
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * itemsPerPage;
    const end = Math.min(start + itemsPerPage, filteredWithIndex.length);

    for(let i=start; i<end; i++) {
        const d = filteredWithIndex[i];
        const origIdx = d.originalIndex;
        tbody += `<tr class="hover:bg-blue-50 cursor-pointer transition-colors" onclick="zoomToData(${origIdx})" title="Klik untuk lihat di peta"><td class="text-gray-400 text-xs">${i+1}</td>`;
        headers.forEach(h => {
            if(h !== '_sec') {
                let val = formatValueForDisplay(d.props[h], h);
                tbody += `<td>${val !== undefined ? val : '-'}</td>`;
            }
        });
        tbody += `<td class="text-center" onclick="event.stopPropagation()"><i class="fa-solid fa-trash-can btn-delete-row cursor-pointer text-red-500" onclick="deleteRow(${origIdx})"></i></td></tr>`;
    }
    tbody += '</tbody>';
    table.innerHTML += tbody;

    const footer = document.getElementById('tableFooter');
    footer.innerHTML = `
        <div class="flex justify-center items-center gap-3 mt-3 pb-2">
            <button onclick="openDataManager(${currentPage - 1})" ${currentPage === 1 ? 'disabled class="text-slate-300 cursor-not-allowed"' : 'class="text-blue-600 hover:text-blue-800 font-bold"'}><i class="fa-solid fa-chevron-left"></i> Prev</button>
            <span class="text-xs font-bold text-slate-600 flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1 rounded-full shadow-sm">
                Halaman 
                <input type="number" min="1" max="${totalPages}" value="${currentPage}" onchange="openDataManager(parseInt(this.value))" class="w-14 text-center border border-slate-300 rounded py-0.5 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"> 
                dari ${totalPages}
            </span>
            <button onclick="openDataManager(${currentPage + 1})" ${currentPage === totalPages ? 'disabled class="text-slate-300 cursor-not-allowed"' : 'class="text-blue-600 hover:text-blue-800 font-bold"'} >Next <i class="fa-solid fa-chevron-right"></i></button>
        </div>
    `;
}

function zoomToData(index) {
    const d = rawData[index];
    if(!d) return;
    toggleModal('dataManagerModal', false);
    map.flyTo([d.lat, d.lng], 18, { duration: 1.5 });
    const content = createPopup(d);
    L.popup().setLatLng([d.lat, d.lng]).setContent(content).openOn(map);
}

function deleteRow(i) { if(confirm("Apakah Anda yakin ingin menghapus baris data ini?")) { rawData.splice(i,1); displayData=[...rawData]; openDataManager(currentPage); updateUI(); } }
function clearAllData() { if(confirm("Apakah Anda yakin ingin menghapus SEMUA data?")) { rawData=[]; displayData=[]; openDataManager(1); updateUI(); showToast("Semua data dihapus.", 'info'); } }
function updateUI() { document.getElementById('dataCount').innerText = `${displayData.length} Data`; renderLayer(); }

// --- PARKING DETECTOR & VISUAL LAYER RENDERER ---
function extractTimeSeconds(props) {
    if (!props) return 0;
    let tKey = Object.keys(props).find(k => /gps time/i.test(k)) || Object.keys(props).find(k => /jam|waktu|time/i.test(k));
    let dKey = Object.keys(props).find(k => /tanggal|date/i.test(k));
    let timeVal = tKey ? props[tKey] : null;
    let dateVal = dKey ? props[dKey] : null;

    if (timeVal === null || timeVal === undefined) return 0;
    if (typeof timeVal === 'number') {
        if (timeVal > 1000000000000) return timeVal / 1000;
        if (timeVal > 1000000000) return timeVal;
        if (timeVal > 25569) return Math.round((timeVal - 25569) * 86400);
        if (timeVal < 1) return Math.round(timeVal * 86400);
    }

    let str = String(timeVal).trim();
    let dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/);
    if (dmyMatch) return new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2])-1, parseInt(dmyMatch[1]), parseInt(dmyMatch[4]), parseInt(dmyMatch[5]), parseInt(dmyMatch[6])).getTime() / 1000;

    let timeOnlyMatch = str.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
    if (timeOnlyMatch) {
        let hrs = parseInt(timeOnlyMatch[1], 10), mins = parseInt(timeOnlyMatch[2], 10), secs = parseInt(timeOnlyMatch[3] || 0, 10);
        let totalSec = hrs * 3600 + mins * 60 + secs;
        if (typeof dateVal === 'number' && dateVal > 25569) totalSec += Math.round((dateVal - 25569) * 86400);
        return totalSec;
    }
    let parsed = Date.parse(str);
    return !isNaN(parsed) ? parsed / 1000 : 0;
}

function detectAndRenderStops(data, layer) {
    if (!data || data.length < 2) return;
    const SPEED_STOP_LIMIT = 3, MIN_STOP_DURATION = 60, STATIONARY_RADIUS_METERS = 60;
    let stops = [], i = 0;

    while (i < data.length) {
        let p = data[i];
        p._sec = extractTimeSeconds(p.props);
        let spdKey = Object.keys(p.props).find(k => /kecepatan|speed|spd/i.test(k));
        let speed = spdKey !== undefined ? parseFloat(p.props[spdKey]) : null;
        let statusKey = Object.keys(p.props).find(k => /vehicle status|status|acc|engine/i.test(k));
        let statusVal = statusKey ? String(p.props[statusKey]).trim().toUpperCase() : "";
        let isAccOff = (statusVal === "OFF" || statusVal === "0" || statusVal === "FALSE");
        let isStartStationary = isAccOff || (speed !== null && !isNaN(speed) && speed <= SPEED_STOP_LIMIT);

        if (isStartStationary && p._sec > 0) {
            let stopAnchor = p, stopPoints = [p], gapSecTotal = 0, gapCount = 0, j = i + 1;
            while (j < data.length) {
                let nextP = data[j];
                nextP._sec = extractTimeSeconds(nextP.props);
                let distFromAnchor = L.latLng(stopAnchor.lat, stopAnchor.lng).distanceTo(L.latLng(nextP.lat, nextP.lng));
                if (distFromAnchor <= STATIONARY_RADIUS_METERS) {
                    let prevInStop = stopPoints[stopPoints.length - 1];
                    let gap = nextP._sec - prevInStop._sec;
                    if (gap >= 120) { gapSecTotal += gap; gapCount++; }
                    stopPoints.push(nextP); j++;
                } else break;
            }
            let lastStopPoint = stopPoints[stopPoints.length - 1];
            let duration = lastStopPoint._sec - stopAnchor._sec;
            if (duration >= MIN_STOP_DURATION) {
                let tKeyStart = Object.keys(stopAnchor.props).find(k => /gps time|jam|waktu|time/i.test(k));
                let tKeyEnd = Object.keys(lastStopPoint.props).find(k => /gps time|jam|waktu|time/i.test(k));
                stops.push({
                    startTime: stopAnchor._sec, endTime: lastStopPoint._sec, duration: duration, hasGap: gapCount > 0, gapSec: gapSecTotal, gapCount: gapCount,
                    startStr: tKeyStart ? formatValueForDisplay(stopAnchor.props[tKeyStart], tKeyStart) : '-',
                    endStr: tKeyEnd ? formatValueForDisplay(lastStopPoint.props[tKeyEnd], tKeyEnd) : '-',
                    lat: stopAnchor.lat, lng: stopAnchor.lng, anchorProps: stopAnchor.props
                });
            }
            i = j;
        } else i++;
    }

    stops.forEach(s => {
        let totalMins = Math.round(s.duration / 60) || 1;
        let stopMarker = L.circleMarker([s.lat, s.lng], { radius: s.hasGap ? 10 : 8, fillColor: s.hasGap ? '#d97706' : '#ef4444', color: '#ffffff', weight: 2, fillOpacity: 1 });
        let gapBadge = s.hasGap ? `<div class="bg-amber-100 border border-amber-300 text-amber-900 text-[10px] font-bold px-2 py-1 rounded mb-1.5 text-left"><i class="fa-solid fa-satellite-dish text-amber-600 mr-1"></i> <b>${s.gapCount}x GAP Time</b> (${(s.gapSec / 60).toFixed(1)}m)</div>` : '';
        let popupContent = `<div class="text-center font-sans p-1 min-w-[210px]"><i class="fa-solid fa-circle-stop ${s.hasGap ? 'text-amber-600' : 'text-red-600'} text-3xl mb-1"></i><br><b class="text-slate-800 text-sm">Berhenti / Parkir</b><br>${gapBadge}<div class="bg-red-50 border border-red-100 p-2 rounded text-left text-xs"><span class="block border-b pb-1 mb-1">Mulai: ${s.startStr}</span><span class="block border-b pb-1 mb-1">Selesai: ${s.endStr}</span><span class="block">Total: ${totalMins} Menit</span></div></div>`;
        stopMarker.bindPopup(popupContent).addTo(layer);
    });
}

function renderLayer() {
    if(map.getSize().x === 0) { setTimeout(renderLayer, 200); return; }
    if(activeLayer) { map.removeLayer(activeLayer); activeLayer=null; }

    const mode = document.getElementById('viewMode').value;
    const cf = styleConfig[mode];
    if(displayData.length === 0) return;

    if(mode === 'heatmap') {
        activeLayer = L.heatLayer(displayData.map(d=>[d.lat,d.lng, 1]), {
            radius: cf.radius,
            blur: cf.blur,
            max: cf.max
        }).addTo(map);

    } else if(mode === 'point') {
        activeLayer = L.markerClusterGroup({ chunkedLoading: true });
        const markers = displayData.map(d => L.circleMarker([d.lat,d.lng], {
            radius: cf.radius,
            fillColor: cf.color,
            color:'#fff',
            weight:1,
            fillOpacity: cf.opacity
        }).bindPopup(createPopup(d)));

        activeLayer.addLayers(markers);
        detectAndRenderStops(displayData, activeLayer);
        map.addLayer(activeLayer);

    // --- MODE IKON SPBU (TIDAK DI-AKUMULASI / INDIVIDUAL MARKER) ---
    } else if(mode === 'spbu') {
        activeLayer = L.featureGroup();

        displayData.forEach(d => {
            const m = L.marker([d.lat, d.lng], {
                icon: createSPBUIcon(styleConfig.spbu.size)
            });
            m.bindPopup(createPopup(d));
            m.addTo(activeLayer);
        });

        detectAndRenderStops(displayData, activeLayer);
        activeLayer.addTo(map);

    } else if(mode === 'line') {
        activeLayer = L.featureGroup();
        L.polyline(displayData.map(d => [d.lat, d.lng]), {
            color: cf.color,
            weight: cf.weight,
            opacity: cf.opacity
        }).addTo(activeLayer);

        detectAndRenderStops(displayData, activeLayer);
        activeLayer.addTo(map);

    } else { // Circle Mode
        activeLayer = L.featureGroup();
        displayData.slice(0, 2000).forEach(d => {
            L.circle([d.lat,d.lng], {
                radius: cf.radiusScale,
                color: cf.color,
                weight:1,
                opacity: cf.opacity
            }).bindPopup(createPopup(d)).addTo(activeLayer);
        });
        activeLayer.addTo(map);
    }
}

function formatValueForDisplay(val, key) {
    if (val === undefined || val === null) return "-";
    let kLower = key.toLowerCase();
    if (typeof val === 'number') {
        if ((kLower.includes('date') || kLower.includes('tanggal')) && val > 25569) {
            const date = new Date(Math.round((val - 25569) * 86400 * 1000));
            return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
        }
        return val % 1 !== 0 ? val.toFixed(5) : val;
    }
    return val;
}

function createPopup(d) {
    let content = `<div class='font-sans text-left min-w-[150px]'><div class="bg-blue-50 p-2 -mx-3 -mt-3 mb-2 border-b border-blue-100 rounded-t text-center"><b class="text-blue-800">Info Data</b></div>`;
    for (const [key, value] of Object.entries(d.props)) {
        content += `<div class="flex justify-between text-xs mb-1"><span class="text-slate-500 font-medium mr-2">${key}:</span> <span class="text-slate-800">${formatValueForDisplay(value, key)}</span></div>`;
    }
    const dataStr = JSON.stringify(d.props).replace(/"/g, '&quot;');
    content += `<div class="mt-2 pt-2 border-t flex gap-1"><a href="https://www.google.com/maps?q=&layer=c&cbll=${d.lat},${d.lng}" target="_blank" class="flex-1 bg-green-500 text-white text-[10px] font-bold py-1 px-2 rounded text-center">SV</a><button onclick='analyzeDataPoint(${d.lat}, ${d.lng}, ${dataStr})' class="flex-1 bg-blue-600 text-white text-[10px] font-bold py-1 px-2 rounded">AI</button></div></div>`;
    return content;
}

// --- ROUTING CALCULATOR ---
function setRouteStart(coords) { document.getElementById('routeStart').value = coords; showToast("Titik A (Asal) ditetapkan!", 'success'); }
function setRouteEnd(coords) { document.getElementById('routeEnd').value = coords; showToast("Titik B (Tujuan) ditetapkan!", 'success'); toggleModal('routingModal', true); }
function swapRouteInputs() { const a = document.getElementById('routeStart'), b = document.getElementById('routeEnd'); const temp = a.value; a.value = b.value; b.value = temp; }

async function geocodeAddress(query) {
    const coordMatch = query.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
    if(coordMatch) return { lat: parseFloat(coordMatch[1]), lon: parseFloat(coordMatch[3]) };
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`);
    const data = await res.json();
    if(data && data.length > 0) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    throw new Error("Alamat tidak ditemukan");
}

async function calculateRoute() {
    const startIn = document.getElementById('routeStart').value, endIn = document.getElementById('routeEnd').value;
    const speedVal = parseFloat(document.getElementById('routeSpeed').value);
    if(!startIn || !endIn) return showToast("Isi kedua titik lokasi!", 'error');
    showToast("Mencari rute...", 'info');
    try {
        const start = await geocodeAddress(startIn), end = await geocodeAddress(endIn);
        const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url); const data = await res.json();
        if(data.code !== 'Ok') throw new Error("Gagal menghitung rute");
        const route = data.routes[0], distKm = (route.distance / 1000).toFixed(2);
        let durMin = (!isNaN(speedVal) && speedVal > 0) ? Math.round(((route.distance / 1000) / speedVal) * 60) : Math.round(route.duration / 60);

        document.getElementById('floatDist').innerText = `${distKm} km`;
        document.getElementById('floatDur').innerText = `${durMin} menit`;
        document.getElementById('floatSpeedInfo').innerText = speedVal > 0 ? `${speedVal} km/jam` : "standar";
        document.getElementById('routeInfoPanel').classList.remove('hidden');
        toggleModal('routingModal', false);

        if(routeLayer) map.removeLayer(routeLayer);
        const geoJson = { "type": "FeatureCollection", "features": [{ "type": "Feature", "geometry": route.geometry }] };
        routeLayer = L.layerGroup([
            L.geoJSON(geoJson, { style: { color: '#9333ea', weight: 5, opacity: 0.8 } }),
            L.marker([start.lat, start.lon]).bindPopup('<b>Mulai</b>'),
            L.marker([end.lat, end.lon]).bindPopup('<b>Tujuan</b>')
        ]).addTo(map);
        map.fitBounds(L.geoJSON(geoJson).getBounds(), { padding: [50, 50] });
        showToast("Rute ditemukan!", 'success');
    } catch(e) { showToast(e.message || "Gagal memproses rute", 'error'); }
}

function clearRoute() { if(routeLayer) { map.removeLayer(routeLayer); routeLayer = null; } document.getElementById('routeInfoPanel').classList.add('hidden'); }

// --- SETTINGS CONFIG & API KEY ---
function getApiKey() { return localStorage.getItem('gemini_api_key') || ""; }
function saveApiKey() { const key = document.getElementById('apiKeyInput').value.trim(); if(key) { localStorage.setItem('gemini_api_key', key); showToast("API Key tersimpan!", 'success'); } }
function toggleApiKeyVisibility() { const input = document.getElementById('apiKeyInput'); input.type = input.type === 'password' ? 'text' : 'password'; }
function openSettings() { toggleModal('settingsModal', true); switchStyleTab('point'); }

function switchStyleTab(mode) {
    document.querySelectorAll('.style-tab').forEach(b => b.classList.remove('setting-tab-active'));
    document.getElementById('tab-'+mode).classList.add('setting-tab-active');
    if(mode === 'api') { document.getElementById('styleContentWrapper').classList.add('hidden'); document.getElementById('apiContentWrapper').classList.remove('hidden'); }
    else { document.getElementById('styleContentWrapper').classList.remove('hidden'); document.getElementById('apiContentWrapper').classList.add('hidden'); renderStyleControls(mode); }
}

function renderStyleControls(mode) {
    const c = document.getElementById('styleControls');
    if(mode === 'spbu') {
        c.innerHTML = `<div class="bg-red-50 p-4 rounded-lg border border-red-100 space-y-3"><label class="text-xs font-bold text-red-800 block">Ukuran Ikon SPBU (<span id="label-spbu-size">${spbuIconSize}px</span>)</label><input type="range" class="w-full h-2 bg-red-200 rounded-lg cursor-pointer" min="16" max="60" value="${spbuIconSize}" oninput="updateSPBUSize(this.value)"></div>`;
        return;
    }
    const cf = styleConfig[mode];
    c.innerHTML = `<div class="bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-center justify-between"><label class="text-xs font-bold text-blue-800">Warna Utama</label><input type="color" value="${cf.color}" onchange="updateConfig('${mode}', 'color', this.value)"></div>`;
}

function updateConfig(mode, key, val) { styleConfig[mode][key] = key !== 'color' ? parseFloat(val) : val; renderLayer(); }
function resetStyles() { styleConfig = JSON.parse(JSON.stringify(defaultStyles)); renderLayer(); }

// --- FITUR PENCARIAN MANDIRI LOKASI / ALAMAT / LATLON / DATA ---
async function handleAICommand() {
    const q = document.getElementById('aiCommandInput').value.trim();
    if(!q) return;

    // Clear marker pencarian sebelumnya
    if (typeof searchMarkerLayer !== 'undefined') {
        searchMarkerLayer.clearLayers();
    }

    // 1. Deteksi Cerdas Format Koordinat Lat, Lon (seperti -8.467107, 117.375486)
    const coordRegex = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/;
    const match = q.match(coordRegex);
    
    if (match) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);

        if (!isNaN(lat) && !isNaN(lng)) {
            // Tancapkan Pin Lokasi Biru Khusus
            const searchPin = L.marker([lat, lng], {
                zIndexOffset: 2000,
                icon: L.divIcon({
                    className: 'custom-search-pin',
                    html: `<div style="background:#2563eb; color:white; width:32px; height:32px; border-radius:50%; border:2px solid white; box-shadow:0 0 10px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; font-size:14px;"><i class="fa-solid fa-location-dot"></i></div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                })
            });

            searchPin.bindPopup(`
                <div class="text-center font-sans p-1">
                    <b class="text-blue-900 text-sm">📍 Hasil Pencarian Koordinat</b><br>
                    <span class="text-xs font-mono text-slate-600 block my-1">${lat}, ${lng}</span>
                </div>
            `);

            if (typeof searchMarkerLayer !== 'undefined') {
                searchMarkerLayer.addLayer(searchPin);
            } else {
                searchPin.addTo(map);
            }

            map.flyTo([lat, lng], 16, { duration: 1.5 });
            searchPin.openPopup();
            updateMapClickActions(lat.toFixed(6), lng.toFixed(6));
            showToast(`Navigasi ke koordinat: ${lat}, ${lng}`, 'success');
            return;
        }
    }

    // 2. Filter Data Lokal jika cocok dengan kolom Excel
    if (rawData && rawData.length > 0) {
        const lowerQuery = q.toLowerCase();
        const filtered = rawData.filter(d => {
            return Object.values(d.props).some(val =>
                val !== null && val !== undefined && String(val).toLowerCase().includes(lowerQuery)
            );
        });

        if (filtered.length > 0 && filtered.length < rawData.length) {
            displayData = filtered;
            updateUI();
            map.fitBounds(L.latLngBounds(filtered.map(d => [d.lat, d.lng])), { padding: [30, 30] });
            showToast(`Ditemukan ${filtered.length} data cocok dalam tabel!`, 'success');
            return;
        }
    }

    // 3. Pencarian Alamat / Nama Tempat via OpenStreetMap Nominatim
    showToast(`Mencari alamat "${q}"...`, 'info');
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
        const data = await res.json();
        if(data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lon = parseFloat(data[0].lon);

            const addressPin = L.marker([lat, lon], {
                zIndexOffset: 2000,
                icon: L.divIcon({
                    className: 'custom-search-pin',
                    html: `<div style="background:#2563eb; color:white; width:32px; height:32px; border-radius:50%; border:2px solid white; box-shadow:0 0 10px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; font-size:14px;"><i class="fa-solid fa-location-dot"></i></div>`,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                })
            });

            addressPin.bindPopup(`
                <div class="text-center font-sans p-1 min-w-[180px]">
                    <b class="text-blue-900 text-sm">📍 Hasil Pencarian Alamat</b><br>
                    <span class="text-xs text-slate-600 block my-1">${data[0].display_name}</span>
                </div>
            `);

            if (typeof searchMarkerLayer !== 'undefined') {
                searchMarkerLayer.addLayer(addressPin);
            } else {
                addressPin.addTo(map);
            }

            map.flyTo([lat, lon], 14, { duration: 1.5 });
            addressPin.openPopup();
            updateMapClickActions(lat.toFixed(6), lon.toFixed(6));
            showToast(`Lokasi ditemukan: ${data[0].display_name.split(',')[0]}`, 'success');
            return;
        }
    } catch(e) {
        console.error("Geocoding error:", e);
    }

    // 4. Fallback AI jika Gemini API Key terpasang
    if (getApiKey()) {
        const dataKeys = Object.keys(rawData[0]?.props || {});
        const payload = { contents: [{ parts: [{ text: `User query: "${q}". Data props: ${dataKeys.join(', ')}. Return action (NAVIGATE/FILTER/RESET) in JSON.` }] }], generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { action: { type: "STRING", enum: ["NAVIGATE", "FILTER", "RESET"] }, column: { type: "STRING" }, operator: { type: "STRING" }, value: { type: "STRING" }, lat: { type: "NUMBER" }, lng: { type: "NUMBER" }, zoom: { type: "NUMBER" }, label: { type: "STRING" } }, required: ["action"] } }, tools: [{ "google_search": {} }] };
        try {
            const txt = await callAI(payload, true); if (!txt) return;
            const act = JSON.parse(txt.replace(/```json|```/g,'').trim());
            if(act.action === 'NAVIGATE') { map.setView([act.lat, act.lng], act.zoom || 13); L.popup().setLatLng([act.lat, act.lng]).setContent(`📍 ${act.label}`).openOn(map); }
            else if(act.action === 'FILTER' && rawData.length > 0) {
                const filtered = rawData.filter(d => String(d.props[act.column]).toLowerCase().includes(String(act.value).toLowerCase()));
                if(filtered.length > 0) { displayData = filtered; updateUI(); showToast(`${filtered.length} data disaring.`, 'success'); } else showToast("0 Data ditemukan.", 'error');
            } else if(act.action==='RESET') resetFilter();
            return;
        } catch(e) {}
    }

    showToast("Lokasi atau alamat tidak ditemukan.", 'error');
}

// --- AI INTEGRATION ---
async function callAI(promptOrPayload, isStructured = false) {
    const key = getApiKey(); if (!key) { showToast("Masukkan Gemini API Key di Pengaturan terlebih dahulu.", "error"); return null; }
    document.getElementById('aiProcessing').style.display = 'flex';
    let payload = isStructured ? promptOrPayload : { contents: [{parts:[{text: promptOrPayload}]}] };
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${key}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const d = await res.json();
        document.getElementById('aiProcessing').style.display = 'none';
        if (d.candidates && d.candidates[0].content.parts[0]) return d.candidates[0].content.parts[0].text; 
        throw new Error("Respon AI tidak valid.");
    } catch(e) { document.getElementById('aiProcessing').style.display = 'none'; showToast("AI Error / Koneksi gagal.", 'error'); return null; }
}

async function analyzeLocation(lat, lng) { const txt = await callAI(`Analisis lokasi di koordinat ${lat}, ${lng}. Lakukan analisis Klasifikasi Jalan UU 22/2009.`); if (txt) showAIResult(txt); }
async function analyzeDataPoint(lat, lng, props) { const txt = await callAI(`Analisis titik ${lat}, ${lng} dengan data: ${JSON.stringify(props)}.`); if (txt) showAIResult(txt); }
async function askAIGeneral() { const txt = await callAI(`Analisis data GPS sebanyak ${displayData.length} titik.`); if (txt) showAIResult(txt); }
async function askAIArea() { if(!currentDrawnLayer) return showToast("Gambar area terlebih dahulu.", 'error'); const txt = await callAI(`Analisis area terpilih.`); if (txt) showAIResult(txt); }
function showAIResult(txt) { document.getElementById('aiOutput').innerHTML = marked.parse(txt); toggleModal('aiModal', true); }
function closeAIModal() { toggleModal('aiModal', false); }

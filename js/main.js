// --- GLOBAL STATE ---
let rawData = [], displayData = [], activeLayer = null, currentDrawnLayer = null;
let isUpdatingMap = false;
let pegmanMode = false;
let routeLayer = null; 
let isRouteMinimized = false;
let currentPage = 1;
const itemsPerPage = 50; 

// --- STATE UNTUK SPBU ICON ---
let spbuIconSize = 28;

// --- STATE UNTUK TIME BUFFER RADIUS & SEARCH MARKER ---
let timeBufferLayerGroup = L.layerGroup();
let searchMarkerLayer = L.layerGroup();
let lastClickedLatLng = null;

const defaultStyles = {
    point: { color: '#f97316', radius: 5, opacity: 0.9 },
    circle: { color: '#ef4444', radiusScale: 20, opacity: 0.5 },
    line: { color: '#2563eb', weight: 3, opacity: 0.8 },
    heatmap: { radius: 20, blur: 15, opacity: 0.7, max: 1.0 },
    spbu: { size: 28 }
};
let styleConfig = JSON.parse(JSON.stringify(defaultStyles));

// --- INITIALIZATION MAP ---
const map = L.map('map', {center: [-6.200, 106.816], zoom: 11, zoomControl: false, preferCanvas: true});
L.control.zoom({position: 'bottomright'}).addTo(map);

const baseLayers = {
    'google_road': L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'] }),
    'google_sat': L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'] }), 
    'google_terrain': L.tileLayer('https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'] })
};
baseLayers['google_sat'].addTo(map);
const drawnItems = new L.FeatureGroup().addTo(map);

timeBufferLayerGroup.addTo(map);
searchMarkerLayer.addTo(map);

// --- TOAST NOTIFICATION SYSTEM ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : type === 'success' ? 'toast-success' : ''}`;
    let icon = '<i class="fa-solid fa-circle-info text-blue-400"></i>';
    if(type === 'error') icon = '<i class="fa-solid fa-triangle-exclamation text-red-200"></i>';
    if(type === 'success') icon = '<i class="fa-solid fa-circle-check text-green-200"></i>';
    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- MAP CLICK ACTIONS & POPUP ---
function createMapClickPopup(lat, lng) {
    return `<div class="text-center font-sans p-1 min-w-[150px]"><b class="text-blue-900">Lokasi Dipilih</b><br><span class="text-xs text-slate-500">${lat}, ${lng}</span></div>`;
}

function updateMapClickActions(lat, lng) {
    const coords = `${lat}, ${lng}`;
    lastClickedLatLng = { lat: parseFloat(lat), lng: parseFloat(lng) };
    const mapClickActionsDiv = document.getElementById('mapClickActions');
    mapClickActionsDiv.classList.remove('hidden');
    document.getElementById('clickedCoords').innerText = coords;
    document.getElementById('analyzeAiBtn').setAttribute('onclick', `analyzeLocation(${lat}, ${lng})`);
    document.getElementById('streetViewBtn').setAttribute('href', `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lng}`);
    document.getElementById('setRouteAbtn').setAttribute('onclick', `setRouteStart('${coords}')`);
    document.getElementById('setRouteBbtn').setAttribute('onclick', `setRouteEnd('${coords}')`);
}

function resetMapClickActions() {
    document.getElementById('mapClickActions').classList.add('hidden');
    document.getElementById('clickedCoords').innerText = '';
    lastClickedLatLng = null;
    searchMarkerLayer.clearLayers();
    map.closePopup();
}

// --- DOM INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    const savedKey = localStorage.getItem('gemini_api_key') || "";
    const keyInput = document.getElementById('apiKeyInput');
    if(keyInput) keyInput.value = savedKey;

    map.on('click', function(e) {
        if(document.querySelector('.leaflet-draw-tooltip')) return;
        const lat = e.latlng.lat.toFixed(6);
        const lng = e.latlng.lng.toFixed(6);
        if (pegmanMode) {
            const svUrl = `https://www.google.com/maps?q=&layer=c&cbll=${e.latlng.lat},${e.latlng.lng}`;
            window.open(svUrl, '_blank');
        } else {
            const content = createMapClickPopup(lat, lng);
            L.popup().setLatLng(e.latlng).setContent(content).openOn(map);
            updateMapClickActions(lat, lng);
        }
    });
});

// --- UI UTILS & MODAL CONTROLS ---
function toggleModal(id, show) {
    const m = document.getElementById(id);
    if(show) { m.classList.remove('hidden'); setTimeout(()=>m.classList.remove('opacity-0'),10); }
    else { m.classList.add('opacity-0'); setTimeout(()=>m.classList.add('hidden'),300); }
}

function toggleMinMax(id, min) { 
    if(min) { document.getElementById('mainFullContent').classList.add('hidden'); document.getElementById('mainMiniContent').classList.remove('hidden'); } 
    else { document.getElementById('mainMiniContent').classList.add('hidden'); document.getElementById('mainFullContent').classList.remove('hidden'); } 
}

function changeBaseMap() {
    const selected = document.getElementById('baseMapMode').value;
    for (let key in baseLayers) {
        map.removeLayer(baseLayers[key]);
    }
    baseLayers[selected].addTo(map);
}

// --- PEGMAN STREET VIEW CONTROL ---
const PegmanControl = L.Control.extend({
    options: { position: 'bottomright' },
    onAdd: function(map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control custom-pegman-control');
        const btn = L.DomUtil.create('a', 'pegman-btn', container);
        btn.href = "#"; btn.title = "Mode Street View";
        btn.innerHTML = '<i class="fa-solid fa-street-view fa-lg"></i>';
        btn.style.display = 'flex'; btn.style.alignItems = 'center'; btn.style.justifyContent = 'center';
        btn.style.width = '100%'; btn.style.height = '100%'; btn.style.textDecoration = 'none';
        btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); toggleStreetViewMode(container); };
        return container;
    }
});
map.addControl(new PegmanControl());

function toggleStreetViewMode(container) {
    pegmanMode = !pegmanMode;
    if (pegmanMode) {
        container.classList.add('pegman-active');
        document.getElementById('map').classList.add('cursor-streetview');
        document.getElementById('map').style.cursor = ''; 
    } else {
        container.classList.remove('pegman-active');
        document.getElementById('map').classList.remove('cursor-streetview');
        document.getElementById('map').style.cursor = 'crosshair';
    }
}

// --- DRAWING & MEASUREMENTS ---
const drawControl = new L.Control.Draw({ draw: { polyline:true, polygon:true, rectangle:true, circle:false, marker:false }, edit: { featureGroup: drawnItems } }); map.addControl(drawControl);
map.on(L.Draw.Event.CREATED, e => { drawnItems.clearLayers(); drawnItems.addLayer(e.layer); currentDrawnLayer=e.layer; document.getElementById('measurePanel').classList.remove('hidden'); updateMeasure(e.layer); });

function updateMeasure(l) { 
    let val=0, unit='km'; 
    if (l instanceof L.Polyline) { l.getLatLngs().flat(2).forEach((ll, i, arr) => { if(i < arr.length-1) val += ll.distanceTo(arr[i+1]); }); val = (val/1000).toFixed(2); } 
    else if (l instanceof L.Polygon) { val = (L.GeometryUtil.geodesicArea(l.getLatLngs().flat(2)) / 1000000).toFixed(2); unit = 'km²'; }
    document.getElementById('measureResult').innerText = val; document.querySelector('#measurePanel .bg-green-50 span:last-child').innerText = unit.toUpperCase();
}

function clearDrawings() { drawnItems.clearLayers(); currentDrawnLayer=null; document.getElementById('measurePanel').classList.add('hidden'); }

// --- DRAGGABLE PANELS LOGIC ---
let activeDragEl=null, initialX, initialY; const dragOffsets = {'controlContainer':{x:0,y:0}, 'measurePanel':{x:0,y:0}, 'routeInfoPanel':{x:0,y:0}};
document.addEventListener("mousedown", e => { let h = e.target.closest('.draggable-header'); if(!h) return; const id = h.getAttribute('data-target'); if(id) { activeDragEl = document.getElementById(id); initialX = e.clientX - dragOffsets[id].x; initialY = e.clientY - dragOffsets[id].y; } });
document.addEventListener("mouseup", () => activeDragEl=null);
document.addEventListener("mousemove", e => { if(activeDragEl) { const x = e.clientX - initialX; const y = e.clientY - initialY; dragOffsets[activeDragEl.id] = {x,y}; activeDragEl.style.transform = `translate3d(${x}px, ${y}px, 0)`; } });

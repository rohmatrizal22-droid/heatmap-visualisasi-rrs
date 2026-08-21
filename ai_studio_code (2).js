// --- FITUR RADIUS RENTANG WAKTU (J = K x W) ---

function setAnchorFromClick() {
    if(!lastClickedLatLng) return;
    const str = `${lastClickedLatLng.lat.toFixed(6)}, ${lastClickedLatLng.lng.toFixed(6)}`;
    document.getElementById('tbAnchorInput').value = str;
    toggleModal('timeBufferModal', true);
    showToast("Titik Anchor Rentang Waktu ditetapkan!", 'success');
}

function useLastClickedForAnchor() {
    if(lastClickedLatLng) {
        document.getElementById('tbAnchorInput').value = `${lastClickedLatLng.lat.toFixed(6)}, ${lastClickedLatLng.lng.toFixed(6)}`;
    } else {
        showToast("Klik sebuah lokasi di peta terlebih dahulu!", "error");
    }
}

function calculateTimeBuffers() {
    const anchorStr = document.getElementById('tbAnchorInput').value.trim();
    const speedVal = parseFloat(document.getElementById('tbSpeedInput').value);
    const hoursStr = document.getElementById('tbHoursInput').value.trim();

    if(!anchorStr) return showToast("Isi titik Anchor terlebih dahulu!", "error");
    if(isNaN(speedVal) || speedVal <= 0) return showToast("Isi kecepatan yang valid!", "error");
    if(!hoursStr) return showToast("Isi rentang jam!", "error");

    const coordMatch = anchorStr.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
    if(!coordMatch) return showToast("Format koordinat tidak valid! Gunakan: Lat, Lon", "error");

    const anchorLat = parseFloat(coordMatch[1]);
    const anchorLng = parseFloat(coordMatch[3]);

    const hoursList = hoursStr.split(/[,;\s]+/).map(h => parseFloat(h)).filter(h => !isNaN(h) && h > 0).sort((a,b) => a - b);

    if(hoursList.length === 0) return showToast("Masukkan minimal satu nilai jam yang valid!", "error");

    timeBufferLayerGroup.clearLayers();

    // Anchor Center Marker
    const anchorMarker = L.marker([anchorLat, anchorLng], {
        icon: L.divIcon({
            className: 'anchor-center-icon',
            html: `<div style="background:#4f46e5; color:white; width:28px; height:28px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow:0 0 8px rgba(0,0,0,0.5);"><i class="fa-solid fa-bullseye text-sm"></i></div>`,
            iconSize: [28,28],
            iconAnchor: [14,14]
        })
    }).bindPopup(`<b>Pusat Anchor Radius</b><br>Kecepatan: ${speedVal} km/jam<br>Koor: ${anchorLat.toFixed(5)}, ${anchorLng.toFixed(5)}`);
    anchorMarker.addTo(timeBufferLayerGroup);

    const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
    let maxRadiusMeters = 0;

    hoursList.forEach((hr, index) => {
        const distanceKm = speedVal * hr; // Rumus: J = K x W
        const radiusMeters = distanceKm * 1000;
        if(radiusMeters > maxRadiusMeters) maxRadiusMeters = radiusMeters;

        const color = colors[index % colors.length];

        // Ring Lingkaran Radius
        const circle = L.circle([anchorLat, anchorLng], {
            radius: radiusMeters,
            color: color,
            weight: 2,
            dashArray: '6, 6',
            fillColor: color,
            fillOpacity: 0.12 - (index * 0.02)
        });

        circle.bindPopup(`
            <div class="text-center p-1">
                <b class="text-indigo-900 text-sm">Zona Tempuh ${hr} Jam</b><br>
                <div class="bg-indigo-50 border border-indigo-100 p-2 rounded mt-1 text-left text-xs">
                    <b>Kecepatan MT:</b> ${speedVal} km/jam<br>
                    <b>Waktu Tempuh:</b> ${hr} Jam Berkendara<br>
                    <b class="text-indigo-700">Radius Jarak: ${distanceKm.toFixed(1)} KM</b>
                </div>
            </div>
        `);
        circle.addTo(timeBufferLayerGroup);

        // Label Teks Lingkaran (Utara)
        const labelLat = anchorLat + (radiusMeters / 111320);
        const labelMarker = L.marker([labelLat, anchorLng], {
            icon: L.divIcon({
                className: 'time-radius-label-wrapper',
                html: `<div class="time-radius-label" style="border-color:${color};"><i class="fa-regular fa-clock mr-1"></i> ${hr} Jam Berkendara (${distanceKm.toFixed(0)} km)</div>`,
                iconSize: [120, 24],
                iconAnchor: [60, 12]
            })
        });
        labelMarker.addTo(timeBufferLayerGroup);
    });

    map.fitBounds(L.circle([anchorLat, anchorLng], {radius: maxRadiusMeters}).getBounds(), {padding: [40, 40]});
    toggleModal('timeBufferModal', false);
    showToast(`Radius Zona ${hoursList.length} Rentang Waktu Berhasil Dibuat!`, "success");
}

function clearTimeBuffers() {
    timeBufferLayerGroup.clearLayers();
    showToast("Zona Radius Rentang Waktu Dihapus.", "info");
}
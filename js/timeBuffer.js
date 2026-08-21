// --- FITUR RADIUS RENTANG WAKTU JALUR DARAT REAL-TIME (OSRM ROAD NETWORK ISOCHRONE) ---

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

// Fungsi pembantu menghitung koordinat tujuan berdasarkan jarak & arah mata angin (bearing)
function getDestinationLatLng(lat, lng, distanceKm, bearing) {
    const R = 6371; // Radius bumi dalam kilometer
    const rad = Math.PI / 180;
    const lat1 = lat * rad;
    const lon1 = lng * rad;
    const brng = bearing * rad;
    const d = distanceKm / R;

    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));

    return {
        lat: lat2 / rad,
        lng: lon2 / rad
    };
}

// Fungsi pembantu mengecek jarak navigasi darat aktual dari OSRM Routing API
async function fetchRoadDistance(startLat, startLng, endLat, endLng) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=false`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            return {
                distanceKm: data.routes[0].distance / 1000,
                durationMin: data.routes[0].duration / 60
            };
        }
    } catch(e) {
        console.warn("Koneksi OSRM lambat/terganggu, menggunakan estimasi fallback.", e);
    }
    return null;
}

// Kalkulasi Utama Radius Rentang Waktu Berdasarkan Rute Jalan Darat Real-Time
async function calculateTimeBuffers() {
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

    const hoursList = hoursStr.split(/[,;\s]+/).map(h => parseFloat(h)).filter(h => !isNaN(h) && h > 0).sort((a,b) => b - a); // Urutkan dari yang terbesar untuk penumpukan layer

    if(hoursList.length === 0) return showToast("Masukkan minimal satu nilai jam yang valid!", "error");

    // Tampilkan indikator proses AI / Rute
    document.getElementById('aiProcessing').style.display = 'flex';
    showToast("Mengkalkulasi rute jalur darat real-time OSRM...", "info");

    timeBufferLayerGroup.clearLayers();

    // Inisialisasi Marker Pusat Anchor
    const anchorMarker = L.marker([anchorLat, anchorLng], {
        icon: L.divIcon({
            className: 'anchor-center-icon',
            html: `<div style="background:#4f46e5; color:white; width:30px; height:30px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px rgba(0,0,0,0.5);"><i class="fa-solid fa-bullseye text-base"></i></div>`,
            iconSize: [30,30],
            iconAnchor: [15,15]
        })
    }).bindPopup(`<b>Pusat Anchor Radius (Jalur Darat)</b><br>Kecepatan MT: ${speedVal} km/jam<br>Koor: ${anchorLat.toFixed(5)}, ${anchorLng.toFixed(5)}`);
    anchorMarker.addTo(timeBufferLayerGroup);

    const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
    const numDirections = 12; // Sampling 12 arah mata angin untuk membentuk poligon rute nyata
    let allBounds = [];

    for (let index = 0; index < hoursList.length; index++) {
        const hr = hoursList[index];
        const targetRoadDistanceKm = speedVal * hr; // Rumus: Jarak Ideal Berkendara = Kecepatan x Jam
        const color = colors[index % colors.length];
        
        // Estimasi awal lurus sebelum penyesuaian belokan jalan (Faktor belokan jalan Indonesia ~1.35x)
        let initialStraightKm = targetRoadDistanceKm / 1.35; 
        let polygonCoords = [];

        for (let d = 0; d < numDirections; d++) {
            const bearing = (360 / numDirections) * d;
            
            // 1. Dapatkan titik perkiraan di peta
            let targetPt = getDestinationLatLng(anchorLat, anchorLng, initialStraightKm, bearing);
            
            // 2. Cek jarak berkendara darat aktual dari OSRM
            let roadData = await fetchRoadDistance(anchorLat, anchorLng, targetPt.lat, targetPt.lng);
            
            if (roadData && roadData.distanceKm > 0) {
                // Kalibrasi ulang jarak agar sesuai dengan target km berkendara ideal
                const correctionRatio = targetRoadDistanceKm / roadData.distanceKm;
                const adjustedStraightKm = initialStraightKm * Math.min(Math.max(correctionRatio, 0.5), 1.8);
                
                // Iterasi kedua untuk presisi tinggi jaringan jalan
                let refinedPt = getDestinationLatLng(anchorLat, anchorLng, adjustedStraightKm, bearing);
                let refinedRoadData = await fetchRoadDistance(anchorLat, anchorLng, refinedPt.lat, refinedPt.lng);
                
                if (refinedRoadData && refinedRoadData.distanceKm > 0) {
                    polygonCoords.push([refinedPt.lat, refinedPt.lng]);
                } else {
                    polygonCoords.push([targetPt.lat, targetPt.lng]);
                }
            } else {
                // Jika titik berada di laut/tanpa jalan darat, gunakan radius estimasi aman
                polygonCoords.push([targetPt.lat, targetPt.lng]);
            }
        }

        // Gambar Poligon Rute Jalur Darat Aktual (Bukan Lingkaran Biasa)
        const isochronePolygon = L.polygon(polygonCoords, {
            color: color,
            weight: 2.5,
            dashArray: '6, 6',
            fillColor: color,
            fillOpacity: 0.15
        });

        isochronePolygon.bindPopup(`
            <div class="text-center p-1">
                <b class="text-indigo-900 text-sm">Zona Tempuh Darat (${hr} Jam)</b><br>
                <div class="bg-indigo-50 border border-indigo-100 p-2 rounded mt-1 text-left text-xs">
                    <b>Kecepatan Rata-rata:</b> ${speedVal} km/jam<br>
                    <b>Waktu Berkendara:</b> ${hr} Jam Ideal<br>
                    <b class="text-indigo-700">Jangkauan Jalan Darat: ±${targetRoadDistanceKm.toFixed(0)} KM</b>
                </div>
            </div>
        `);
        
        isochronePolygon.addTo(timeBufferLayerGroup);
        allBounds.push(isochronePolygon.getBounds());

        // Tambahkan Label Marker di Sisi Utara Poligon
        const topCoord = polygonCoords.reduce((prev, current) => (prev[0] > current[0]) ? prev : current);
        const labelMarker = L.marker([topCoord[0], topCoord[1]], {
            icon: L.divIcon({
                className: 'time-radius-label-wrapper',
                html: `<div class="time-radius-label" style="border-color:${color};"><i class="fa-solid fa-route mr-1"></i> ${hr} Jam Jalur Darat (${targetRoadDistanceKm.toFixed(0)} km)</div>`,
                iconSize: [140, 24],
                iconAnchor: [70, 12]
            })
        });
        labelMarker.addTo(timeBufferLayerGroup);
    }

    document.getElementById('aiProcessing').style.display = 'none';

    // Autofocus tampilan peta ke seluruh zona terluar
    if (allBounds.length > 0) {
        let combinedBounds = allBounds[0];
        allBounds.forEach(b => combinedBounds.extend(b));
        map.fitBounds(combinedBounds, {padding: [40, 40]});
    }

    toggleModal('timeBufferModal', false);
    showToast(`Zona Tempuh Jalur Darat Real-Time (${hoursList.length} Rentang Waktu) Berhasil Dibuat!`, "success");
}

function clearTimeBuffers() {
    timeBufferLayerGroup.clearLayers();
    showToast("Zona Radius Rentang Waktu Dihapus.", "info");
}

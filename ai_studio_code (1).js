// --- MODUL IKON SPBU (MEMAKAI DATA LAT/LON UTAMA) ---

function createSPBUIcon(size) {
    const iconInnerSize = Math.round(size * 0.55);
    return L.divIcon({
        className: 'custom-spbu-marker-icon',
        html: `<div style="
            background: #dc2626;
            color: #ffffff;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            border: 2px solid #ffffff;
            box-shadow: 0 0 10px rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${iconInnerSize}px;
            transition: all 0.2s ease;
        "><i class="fa-solid fa-gas-pump"></i></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2]
    });
}

function updateSPBUSize(val) {
    spbuIconSize = parseInt(val);
    styleConfig.spbu.size = spbuIconSize;
    
    const labelMain = document.getElementById('spbuSizeValLabel');
    if(labelMain) labelMain.innerText = `${spbuIconSize}px`;
    
    const labelModal = document.getElementById('label-spbu-size');
    if(labelModal) labelModal.innerText = `${spbuIconSize}px`;

    // Re-render layer jika mode visualisasi saat ini adalah SPBU
    if (document.getElementById('viewMode').value === 'spbu') {
        renderLayer();
    }
}
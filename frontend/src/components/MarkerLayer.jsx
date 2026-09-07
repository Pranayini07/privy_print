import React, { useEffect, useRef } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

const MarkerLayer = ({ shops, userLocation, selectedShopId, onSelectShop }) => {
    const map = useMap();
    const lastShopsRef = useRef(null);

    // Filter valid shops
    const validShops = (shops || []).filter(s => s && typeof s.lat === 'number' && typeof s.lng === 'number');

    useEffect(() => {
        if (validShops.length === 0) {
            if (userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number') {
                map.setView([userLocation.lat, userLocation.lng], 14, { animate: true });
            }
            return;
        }

        const currentShopsKey = `${validShops.map(s => s.id || `${s.lat}-${s.lng}`).join('|')}-${userLocation?.lat}-${userLocation?.lng}`;
        if (lastShopsRef.current === currentShopsKey) return;

        lastShopsRef.current = currentShopsKey;

        const bounds = L.latLngBounds();

        if (userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number') {
            bounds.extend([userLocation.lat, userLocation.lng]);
        }

        validShops.forEach(shop => {
            bounds.extend([shop.lat, shop.lng]);
        });

        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
    }, [map, validShops, userLocation]);

    useEffect(() => {
        if (selectedShopId) {
            const selectedShop = validShops.find(s => s.id === selectedShopId || `${s.lat}-${s.lng}` === selectedShopId);
            if (selectedShop) {
                map.setView([selectedShop.lat, selectedShop.lng], 16, { animate: true });
            }
        }
    }, [map, selectedShopId, validShops]);

    return (
        <>
            {/* User Location Marker */}
            {userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number' && (
                <Marker
                    position={[userLocation.lat, userLocation.lng]}
                    icon={L.divIcon({
                        className: 'user-location-marker',
                        html: `<div style="background-color: #2563eb; width: 18px; height: 18px; border-radius: 50%; border: 3px solid #ffffff; box-shadow: 0 0 12px rgba(37, 99, 235, 0.8);"></div>`,
                        iconSize: [18, 18],
                        iconAnchor: [9, 9]
                    })}
                >
                    <Popup>
                        <div style={{ textAlign: 'center', padding: '4px' }}>
                            <strong style={{ color: '#2563eb', fontSize: '0.95rem' }}>📍 Your Current Location</strong>
                        </div>
                    </Popup>
                </Marker>
            )}

            {/* Shop Markers */}
            {validShops.map((shop, i) => {
                const shopId = shop.id || `${shop.lat}-${shop.lng}`;
                const isSelected = selectedShopId === shopId || selectedShopId === `${shop.lat}-${shop.lng}`;
                const mapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}`;

                return (
                    <Marker
                        key={`${shopId}-${i}`}
                        position={[shop.lat, shop.lng]}
                        eventHandlers={{
                            click: () => {
                                if (onSelectShop) onSelectShop(shop);
                            }
                        }}
                        icon={L.divIcon({
                            className: 'shop-marker',
                            html: `<div style="background-color: ${isSelected ? '#10b981' : '#3b82f6'}; width: 22px; height: 22px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2.5px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.35);"></div>`,
                            iconSize: [22, 22],
                            iconAnchor: [11, 22]
                        })}
                    >
                        <Popup>
                            <div style={{ color: '#0f172a', minWidth: '180px', padding: '2px' }}>
                                <b style={{ fontSize: '1rem', color: '#0f172a', display: 'block', marginBottom: '4px' }}>
                                    {shop.name || 'Print Shop'}
                                </b>
                                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 6px' }}>
                                    {shop.address}
                                </p>
                                <span style={{
                                    display: 'inline-block',
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: '#059669',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    marginBottom: '8px'
                                }}>
                                    {shop.distance_km != null ? `⚡ ${shop.distance_km} km away` : 'Nearby'}
                                </span>
                                <div>
                                    <a
                                        href={mapsDirectionsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            display: 'inline-block',
                                            width: '100%',
                                            textAlign: 'center',
                                            padding: '6px 12px',
                                            background: '#3b82f6',
                                            color: '#ffffff',
                                            textDecoration: 'none',
                                            fontWeight: '600',
                                            fontSize: '0.8rem',
                                            borderRadius: '6px'
                                        }}
                                    >
                                        Get Directions ↗
                                    </a>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                );
            })}
        </>
    );
};

export default MarkerLayer;

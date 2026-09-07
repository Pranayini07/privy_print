/**
 * ShopCard - Displays a single print shop with Open in Maps action
 */

import React from 'react';
import { MapPin, Navigation, Clock, CheckCircle2 } from 'lucide-react';

const ShopCard = ({ shop, onSelect, isSelected, distanceType }) => {
    const mapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}`;

    return (
        <div
            onClick={() => onSelect && onSelect(shop)}
            style={{
                background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.65)',
                border: isSelected ? '2px solid var(--primary)' : '1px solid var(--glass-border)',
                borderRadius: '14px',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.25s ease',
                boxShadow: isSelected ? '0 8px 24px rgba(59, 130, 246, 0.2)' : '0 2px 10px rgba(0, 0, 0, 0.03)',
                transform: isSelected ? 'translateY(-2px)' : 'none',
                backdropFilter: 'blur(8px)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{
                        padding: '0.5rem',
                        borderRadius: '10px',
                        background: isSelected ? 'var(--primary)' : 'rgba(59, 130, 246, 0.1)',
                        color: isSelected ? '#fff' : 'var(--primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <MapPin size={20} />
                    </div>
                    <div>
                        <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.05rem', fontWeight: '700' }}>
                            {shop.name}
                        </h4>
                        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                            {shop.address}
                        </p>
                    </div>
                </div>

                {shop.distance_km != null && (
                    <span style={{
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#059669',
                        padding: '0.3rem 0.65rem',
                        borderRadius: '20px',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        whiteSpace: 'nowrap',
                        border: '1px solid rgba(16, 185, 129, 0.3)'
                    }}>
                        {shop.distance_km < 0.1 ? '⚡ Nearby' : `⚡ ${Number(shop.distance_km).toFixed(2)} km`}
                    </span>
                )}
            </div>

            {/* Badges & Tags */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontSize: '0.75rem',
                    color: '#059669',
                    fontWeight: '600'
                }}>
                    <CheckCircle2 size={13} />
                    {shop.status || 'Open Now'}
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>•</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {distanceType === 'user' ? 'from your location' : 'from searched location'}
                </span>
            </div>

            {/* Footer Action */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '0.75rem' }}>
                <a
                    href={mapsDirectionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.45rem 0.9rem',
                        background: 'var(--primary)',
                        color: '#ffffff',
                        textDecoration: 'none',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        transition: 'background 0.2s ease',
                        boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
                    }}
                >
                    <Navigation size={14} />
                    Get Directions
                </a>
            </div>
        </div>
    );
};

export default ShopCard;

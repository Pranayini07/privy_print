import React, { useState, useEffect, useCallback } from 'react';
import {
    MapPin,
    Navigation,
    Search,
    RefreshCw,
    AlertCircle,
    SlidersHorizontal,
    Compass,
    Building2,
    CheckCircle2
} from 'lucide-react';
import axios from 'axios';
import { API_BASE } from '../config';
import MapView from '../components/MapView';
import ShopCard from '../components/ShopCard';
import LocationToggle from '../components/LocationToggle';

const RADIUS_OPTIONS = [
    { label: '1 km', value: 1000 },
    { label: '3 km', value: 3000 },
    { label: '5 km', value: 5000 },
    { label: '10 km', value: 10000 },
];

const NearbyShops = () => {
    const [mode, setMode] = useState('location'); // 'location' | 'city'
    const [userLocation, setUserLocation] = useState(null);
    const [shops, setShops] = useState([]);
    const [loading, setLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [error, setError] = useState(null);
    const [radius, setRadius] = useState(5000);
    const [selectedShopId, setSelectedShopId] = useState(null);
    const [cityInput, setCityInput] = useState('');
    const [activeCitySearched, setActiveCitySearched] = useState('');
    const [locationDenied, setLocationDenied] = useState(false);

    // Fetch shops by coordinates (Live Nearby mode)
    const fetchNearbyShops = useCallback(async (lat, lng, radiusM) => {
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get(`${API_BASE}/api/nearby-shops`, {
                params: {
                    lat,
                    lng,
                    radius: radiusM
                }
            });
            const data = Array.isArray(res.data) ? res.data : [];
            setShops(data);
            if (data.length > 0) {
                setSelectedShopId(data[0].id || `${data[0].lat}-${data[0].lng}`);
            }
        } catch (err) {
            console.error('Error fetching nearby shops:', err);
            setError(err.response?.data?.error || 'Unable to load nearby print shops. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch shops by city name (City Search mode)
    const fetchCityShops = useCallback(async (cityName, radiusM) => {
        if (!cityName || cityName.trim().length < 2) return;
        setLoading(true);
        setError(null);
        try {
            const res = await axios.get(`${API_BASE}/api/shops-by-city`, {
                params: {
                    city: cityName.trim(),
                    radius: radiusM
                }
            });
            const data = Array.isArray(res.data) ? res.data : [];
            setShops(data);
            setActiveCitySearched(cityName.trim());
            if (data.length > 0) {
                setSelectedShopId(data[0].id || `${data[0].lat}-${data[0].lng}`);
                // Update map center to first shop or average
                setUserLocation({ lat: data[0].lat, lng: data[0].lng });
            }
        } catch (err) {
            console.error('Error fetching shops by city:', err);
            setError(err.response?.data?.error || `Could not find print shops in "${cityName}". Please check the spelling or try searching another city.`);
        } finally {
            setLoading(false);
        }
    }, []);

    // Get user GPS location
    const requestUserLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser. Please search by city instead.');
            setMode('city');
            return;
        }

        setLocationLoading(true);
        setError(null);
        setLocationDenied(false);

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const loc = { lat: latitude, lng: longitude };
                setUserLocation(loc);
                setLocationLoading(false);
                fetchNearbyShops(latitude, longitude, radius);
            },
            (err) => {
                console.warn('Geolocation error:', err);
                setLocationLoading(false);
                setLocationDenied(true);
                // Fallback default coordinates if user denies location: Indian metro default
                setError('Location access was denied or is unavailable. You can search by your city name below.');
                setMode('city');
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    }, [radius, fetchNearbyShops]);

    // Initial load: Attempt GPS location
    useEffect(() => {
        requestUserLocation();
    }, []);

    // Re-fetch when radius changes in location mode
    const handleRadiusChange = (newRadius) => {
        setRadius(newRadius);
        if (mode === 'location' && userLocation) {
            fetchNearbyShops(userLocation.lat, userLocation.lng, newRadius);
        } else if (mode === 'city' && activeCitySearched) {
            fetchCityShops(activeCitySearched, newRadius);
        }
    };

    // Mode switch handler
    const handleModeChange = (newMode) => {
        setMode(newMode);
        setError(null);
        if (newMode === 'location') {
            if (userLocation) {
                fetchNearbyShops(userLocation.lat, userLocation.lng, radius);
            } else {
                requestUserLocation();
            }
        }
    };

    // City form submit
    const handleCitySubmit = (e) => {
        e.preventDefault();
        if (cityInput.trim().length >= 2) {
            fetchCityShops(cityInput.trim(), radius);
        }
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '2rem auto', padding: '0 1.5rem' }}>
            {/* Header section */}
            <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem', textAlign: 'center' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{
                        background: 'linear-gradient(135deg, var(--primary), var(--neon-purple))',
                        padding: '0.6rem',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        boxShadow: '0 4px 15px rgba(59, 130, 246, 0.3)'
                    }}>
                        <Navigation size={28} />
                    </div>
                    <h2 className="glow-text" style={{ margin: 0, fontSize: '2.2rem', fontWeight: '800' }}>
                        Nearby Print Centers
                    </h2>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '650px', margin: '0 auto 1.5rem', lineHeight: '1.5' }}>
                    Discover verified local print & Xerox centers near your exact location with live distance, directions, and secure print capabilities.
                </p>

                {/* Mode Toggle Controls */}
                <div style={{ maxWidth: '500px', margin: '0 auto' }}>
                    <LocationToggle
                        mode={mode}
                        onModeChange={handleModeChange}
                        disabled={loading || locationLoading}
                    />
                </div>

                {/* Sub-controls depending on active mode */}
                {mode === 'location' ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                        <button
                            type="button"
                            onClick={requestUserLocation}
                            disabled={locationLoading || loading}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.65rem 1.25rem',
                                fontSize: '0.9rem',
                                background: 'rgba(59, 130, 246, 0.1)',
                                color: 'var(--primary)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: '8px',
                                textTransform: 'none',
                                letterSpacing: 'normal',
                                fontWeight: '600'
                            }}
                        >
                            <RefreshCw size={16} className={locationLoading ? 'spinner' : ''} />
                            {locationLoading ? 'Acquiring GPS...' : 'Refresh My Location'}
                        </button>

                        {userLocation && (
                            <span style={{ fontSize: '0.85rem', color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: '600' }}>
                                <CheckCircle2 size={16} />
                                Live GPS Active ({userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)})
                            </span>
                        )}
                    </div>
                ) : (
                    /* Search by City Form */
                    <form onSubmit={handleCitySubmit} style={{ maxWidth: '550px', margin: '1rem auto 0', display: 'flex', gap: '0.5rem' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search
                                size={18}
                                style={{
                                    position: 'absolute',
                                    left: '1rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--text-secondary)'
                                }}
                            />
                            <input
                                type="text"
                                placeholder="Enter city name (e.g., Vijayawada, Hyderabad, Mumbai...)"
                                value={cityInput}
                                onChange={(e) => setCityInput(e.target.value)}
                                style={{
                                    paddingLeft: '2.75rem',
                                    paddingRight: '1rem',
                                    fontSize: '0.95rem'
                                }}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || cityInput.trim().length < 2}
                            style={{
                                padding: '0.75rem 1.5rem',
                                fontSize: '0.9rem',
                                flexShrink: 0
                            }}
                        >
                            {loading ? 'Searching...' : 'Search'}
                        </button>
                    </form>
                )}

                {/* Radius Filter Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: '600' }}>
                        <SlidersHorizontal size={14} /> Search Radius:
                    </span>
                    {RADIUS_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleRadiusChange(opt.value)}
                            disabled={loading}
                            style={{
                                padding: '0.35rem 0.85rem',
                                fontSize: '0.8rem',
                                borderRadius: '20px',
                                background: radius === opt.value ? 'var(--primary)' : 'rgba(255, 255, 255, 0.8)',
                                color: radius === opt.value ? '#ffffff' : 'var(--text-secondary)',
                                border: radius === opt.value ? '1px solid var(--primary)' : '1px solid rgba(0, 0, 0, 0.1)',
                                textTransform: 'none',
                                letterSpacing: 'normal',
                                fontWeight: radius === opt.value ? '700' : '500'
                            }}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Error Message Box */}
            {error && (
                <div style={{
                    background: 'rgba(244, 63, 94, 0.1)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    color: '#e11d48',
                    padding: '1rem 1.25rem',
                    borderRadius: '12px',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    fontSize: '0.95rem'
                }}>
                    <AlertCircle size={20} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>{error}</div>
                    {locationDenied && mode !== 'city' && (
                        <button
                            type="button"
                            onClick={() => setMode('city')}
                            style={{
                                padding: '0.4rem 0.8rem',
                                fontSize: '0.8rem',
                                background: '#e11d48',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px'
                            }}
                        >
                            Search By City
                        </button>
                    )}
                </div>
            )}

            {/* Main Interactive Map and Results View */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.5rem', alignItems: 'start' }}>
                {/* Left Column: Interactive Leaflet Map */}
                <div>
                    <MapView
                        shops={shops}
                        userLocation={userLocation}
                        selectedShopId={selectedShopId}
                        onSelectShop={(shop) => setSelectedShopId(shop.id || `${shop.lat}-${shop.lng}`)}
                        loading={loading || locationLoading}
                    />

                    {/* Map Hint Footer */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        padding: '0 0.5rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#2563eb', display: 'inline-block' }}></span>
                                Your Location
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }}></span>
                                Print Shops
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span>
                                Selected
                            </span>
                        </div>
                        <span>Interactive OpenStreetMap</span>
                    </div>
                </div>

                {/* Right Column: List of Print Centers */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    maxHeight: '520px',
                    overflowY: 'auto',
                    paddingRight: '0.5rem'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid var(--glass-border)' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Building2 size={18} color="var(--primary)" />
                            {mode === 'location' ? 'Shops Nearest To You' : `Print Shops in ${activeCitySearched || 'Area'}`}
                        </h3>
                        <span style={{
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            color: 'var(--primary)',
                            background: 'rgba(59, 130, 246, 0.1)',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '12px'
                        }}>
                            {shops.length} Found
                        </span>
                    </div>

                    {loading || locationLoading ? (
                        <div className="glass-panel" style={{ padding: '3rem 1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                            <RefreshCw size={28} className="spinner" style={{ margin: '0 auto 1rem', color: 'var(--primary)' }} />
                            <p style={{ margin: 0, fontWeight: '600' }}>Finding closest print centers...</p>
                        </div>
                    ) : shops.length === 0 ? (
                        <div className="glass-panel" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                            <Compass size={36} color="var(--text-secondary)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
                            <h4 style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>No Print Shops Found In This Radius</h4>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                                Try expanding your search radius to 10 km or searching by a nearby city name.
                            </p>
                            <button
                                type="button"
                                onClick={() => handleRadiusChange(10000)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    fontSize: '0.85rem',
                                    borderRadius: '8px'
                                }}
                            >
                                Expand Radius to 10 km
                            </button>
                        </div>
                    ) : (
                        shops.map((shop) => {
                            const shopId = shop.id || `${shop.lat}-${shop.lng}`;
                            const isSelected = selectedShopId === shopId || selectedShopId === `${shop.lat}-${shop.lng}`;
                            return (
                                <ShopCard
                                    key={shopId}
                                    shop={shop}
                                    isSelected={isSelected}
                                    distanceType={mode === 'location' ? 'user' : 'city'}
                                    onSelect={(selected) => setSelectedShopId(selected.id || `${selected.lat}-${selected.lng}`)}
                                />
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default NearbyShops;

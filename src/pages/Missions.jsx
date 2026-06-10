// Модуль просторового планування місій
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline, GeoJSON, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import { 
    Trash2, RotateCw, Database, FolderOpen, Download, AlertTriangle, 
    Undo2, XCircle, Archive, ArchiveRestore, Calendar, Activity, 
    ShieldAlert, Edit3, Clock, CloudRain, Wind, Cloud, Thermometer,
    Search, PlusCircle, X 
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useLocation, useNavigate } from 'react-router-dom';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const midPointIcon = L.divIcon({ className: 'custom-midpoint', html: '<div style="width: 12px; height: 12px; background: white; border: 2px solid #3b82f6; border-radius: 50%; opacity: 0.8; box-shadow: 0 0 3px rgba(0,0,0,0.5); cursor: pointer;"></div>', iconSize: [12, 12], iconAnchor: [6, 6] });

function ccw(A, B, C) { return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]); }
function doIntersect(A, B, C, D) { return ccw(A, C, D) !== ccw(B, C, D) && ccw(A, B, C) !== ccw(A, B, D); }

function isPointInsidePolygon(point, polygon) {
    let x = point[0], y = point[1], inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i][0], yi = polygon[i][1], xj = polygon[j][0], yj = polygon[j][1];
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Інтеграція Погодних Даних (Weather API)
function LiveRadarLayer() {
    const [radarUrl, setRadarUrl] = useState(null);
    useEffect(() => {
        fetch('https://api.rainviewer.com/public/weather-maps.json')
            .then(res => res.json())
            .then(data => {
                // Використовуємо radar array
                if (data && data.radar && data.radar.past && data.radar.past.length > 0) {
                    const latest = data.radar.past[data.radar.past.length - 1];
                    // color=2: Universal Black/White/Gray scale
                    // smooth=1: Smoothing enabled
                    setRadarUrl(`https://tilecache.rainviewer.com${latest.path}/256/{z}/{x}/{y}/2/1_1.png`);
                }
            }).catch(e => console.error('Radar fetch failed', e));
    }, []);

    if (!radarUrl) return null;

    return (
        <TileLayer 
            url={radarUrl} 
            opacity={0.65} 
            zIndex={10} 
            maxNativeZoom={7} 
            maxZoom={22} 
            attribution="Global Weather Data by RainViewer" 
        />
    );
}

function MapTracker({ setMapCenter }) {
    useMapEvents({
        moveend: (e) => {
            setMapCenter([e.target.getCenter().lat, e.target.getCenter().lng]);
        }
    });
    return null;
}

// Механізм Заборонених Зон (NFZ Manager)
function NFZManager({ setDynamicNfz, setIsLoadingNfz }) {
    const map = useMap();
    const timeoutRef = useRef(null);
    const abortControllerRef = useRef(null);
    const lastFetchedBounds = useRef(null); // Кеш для збереження завантаженої області

    const fetchZones = useCallback(async () => {
        if (map.getZoom() < 11) {
            setDynamicNfz({ type: "FeatureCollection", features: [] });
            lastFetchedBounds.current = null; // Скидаємо кеш, якщо віддалилися
            return;
        }

        const currentBounds = map.getBounds();

        // 1. Перевіряємо, чи поточний екран знаходиться всередині вже завантаженої області
        if (lastFetchedBounds.current && lastFetchedBounds.current.contains(currentBounds)) {
            return; // Нічого не робимо, зони для цієї території вже завантажені
        }

        // 2. Якщо вийшли за межі — завантажуємо нову область, але беремо її "з запасом" (+15% у всі сторони)
        const paddedBounds = currentBounds.pad(0.15); 

        setIsLoadingNfz(true);
        const bbox = `${paddedBounds.getSouth()},${paddedBounds.getWest()},${paddedBounds.getNorth()},${paddedBounds.getEast()}`;

        const query = `
            [out:json][timeout:10];
            (
              way["aeroway"~"aerodrome|heliport"](${bbox});
              way["military"](${bbox});
              way["power"~"plant"](${bbox});
              way["amenity"~"prison|hospital"](${bbox});
            );
            out geom;
        `;

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        try {
            const response = await fetch('/api/overpass?data=' + encodeURIComponent(query), { 
                method: 'GET',
                signal: abortControllerRef.current.signal 
            });
            
            if (!response.ok) throw new Error(`Overpass API error: ${response.status}`);
            
            const data = await response.json();
            
            const features = data.elements.map(el => {
                if (el.type === 'way' && el.geometry && el.geometry.length > 2) {
                    const coords = el.geometry.map(g => [g.lon, g.lat]);
                    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) { 
                        coords.push(coords[0]); 
                    }
                    
                    let rawType = el.tags?.name || el.tags?.military || el.tags?.aeroway || el.tags?.amenity || el.tags?.power;
                    if (!rawType || rawType === "yes") return null;

                    let typeName = rawType.charAt(0).toUpperCase() + rawType.slice(1);
                    return { 
                        type: "Feature", 
                        properties: { name: `NFZ: ${typeName}`, color: "#ef4444" }, 
                        geometry: { type: "Polygon", coordinates: [coords] } 
                    };
                }
                return null;
            }).filter(Boolean); 

            setDynamicNfz({ type: "FeatureCollection", features });
            
            // 3. Зберігаємо збільшену область у кеш
            lastFetchedBounds.current = paddedBounds; 

        } catch (error) { 
            if (error.name !== 'AbortError') {
                console.error("Failed to fetch NFZ from OpenStreetMap:", error); 
            }
        } finally {
            setIsLoadingNfz(false);
        }
    }, [map, setDynamicNfz, setIsLoadingNfz]);

    useEffect(() => {
        // Чекаємо 500мс, щоб карта гарантовано відрендерилась і отримала правильні координати меж
        const initTimeout = setTimeout(() => {
            fetchZones();
        }, 500);
        return () => clearTimeout(initTimeout);
    }, [fetchZones]);

    useMapEvents({
        moveend: () => {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(fetchZones, 600); // Оптимальна затримка
        }
    });
    
    return null;
}

function Missions({ profile }) {
    const [waypoints, setWaypoints] = useState([]);
    const [history, setHistory] = useState([]); 
    const [editingPoint, setEditingPoint] = useState(null);
    const [missionName, setMissionName] = useState('Agro_Survey_01');
    const [savedMissions, setSavedMissions] = useState([]);
    const [drones, setDrones] = useState([]);
    const [selectedDroneId, setSelectedDroneId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState(''); 

    const [dynamicNfz, setDynamicNfz] = useState({ type: "FeatureCollection", features: [] });
    const [isLoadingNfz, setIsLoadingNfz] = useState(false);
    
    const [mapCenter, setMapCenter] = useState([51.5300, 31.3100]);
    const [weatherAlert, setWeatherAlert] = useState(null);
    const [showWeatherOverlay, setShowWeatherOverlay] = useState(false);
    const [currentWeather, setCurrentWeather] = useState(null);

    const location = useLocation();
    const navigate = useNavigate();
    const searchParams = new URLSearchParams(location.search);
    const loadMissionId = searchParams.get('loadMissionId');
    const filterDroneId = searchParams.get('drone');
    const isArchivedView = searchParams.get('tab') === 'archived';
    const [activeTab, setActiveTab] = useState(isArchivedView ? 'archived' : 'active');

    const handleNewPlan = () => {
        if (waypoints.length > 0 && !window.confirm("Discard current plan? All unsaved waypoints will be lost.")) return;
        setWaypoints([]);
        setHistory([]);
        setEditingPoint(null);
        setMissionName('New_Mission_Plan');
    };

    // ПЕРЕВІРКА ПОГОДИ
    useEffect(() => {
        const checkWeather = async () => {
            const lat = waypoints.length > 0 ? waypoints[0].lat : mapCenter[0];
            const lng = waypoints.length > 0 ? waypoints[0].lng : mapCenter[1];

            try {
                const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation&hourly=wind_speed_10m,precipitation_probability&wind_speed_unit=ms`);
                const data = await res.json();
                setCurrentWeather(data.current);

                if (waypoints.length > 0 && selectedDroneId) {
                    const drone = drones.find(d => String(d.id) === String(selectedDroneId));
                    // Ліміт вітру: 60% від максимальної швидкості дрона, або 10 м/с за замовчуванням
                    const safeWindLimit = drone && drone.max_speed ? (drone.max_speed * 0.6) : 10; 

                    const currentWind = data.current.wind_speed_10m;
                    const currentPrecip = data.current.precipitation;

                    // Якщо вітер сильніший за ліміт АБО є опади
                    if (currentWind > safeWindLimit || currentPrecip > 0) {
                        const goodHourIdx = data.hourly.wind_speed_10m.findIndex((w, i) => w <= safeWindLimit && data.hourly.precipitation_probability[i] < 10);
                        let improvementText = goodHourIdx !== -1 
                            ? `Conditions improve around ${new Date(data.hourly.time[goodHourIdx]).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.`
                            : `No improvement expected in next 24h.`;

                        setWeatherAlert({
                            wind: currentWind, 
                            rain: currentPrecip > 0,
                            message: `Warning: Weather is currently unsafe for ${drone?.name || 'this drone'}. ${currentPrecip > 0 ? 'Precipitation detected.' : `Wind speed is ${currentWind} m/s (Safe limit: ${safeWindLimit.toFixed(1)} m/s).`} ${improvementText}`
                        });
                    } else { setWeatherAlert(null); }
                } else { setWeatherAlert(null); }
            } catch (err) { console.error("Failed to fetch weather data", err); }
        };

        const timer = setTimeout(checkWeather, 1500); 
        return () => clearTimeout(timer);
    }, [waypoints.length > 0 ? waypoints[0] : null, mapCenter, selectedDroneId, drones]);

    const updateWaypointsWithHistory = useCallback((newWaypoints) => {
        setHistory(prev => {
            if (prev.length > 0 && JSON.stringify(prev[prev.length - 1]) === JSON.stringify(waypoints)) return prev;
            return [...prev, waypoints];
        });
        setWaypoints(newWaypoints);
    }, [waypoints]);

    const handleUndo = useCallback(() => {
        setHistory(prevHistory => {
            if (prevHistory.length === 0) return prevHistory;
            const previousState = prevHistory[prevHistory.length - 1];
            setWaypoints(previousState);
            return prevHistory.slice(0, -1);
        });
        setEditingPoint(null);
    }, []);

    useEffect(() => {
        const handleKeyDown = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); handleUndo(); } };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo]);

    useEffect(() => { 
        if (profile?.company_id) { fetchMissions(); fetchDrones(); }
    }, [profile]);

    useEffect(() => { if (filterDroneId) setSelectedDroneId(filterDroneId); }, [filterDroneId]);

    useEffect(() => {
        if (savedMissions.length > 0 && loadMissionId) {
            const m = savedMissions.find(m => m.id === parseInt(loadMissionId));
            if (m) { loadMission(m); navigate('/missions', { replace: true }); }
        }
    }, [savedMissions, loadMissionId, navigate]);

    const fetchMissions = async () => {
        const { data, error } = await supabase.from('missions').select('*, drones(name, model, max_flight_time, max_speed), flight_logs(id)').order('created_at', { ascending: false });
        if (!error) setSavedMissions(data);
    };

    const fetchDrones = async () => {
        const { data: allDrones } = await supabase.from('drones').select('id, name, model, max_speed, max_flight_time').order('name', { ascending: true });
        if (profile.role === 'admin') {
            setDrones(allDrones || []);
        } else {
            const { data: myAccess } = await supabase.from('drone_access').select('drone_id').eq('user_id', profile.id);
            if (myAccess && allDrones) {
                const allowedIds = myAccess.map(a => a.drone_id);
                setDrones(allDrones.filter(d => allowedIds.includes(d.id)));
            } else setDrones([]);
        }
    };

    const { totalDistance, estimatedTime } = useMemo(() => {
        let dist = 0; let time = 0;
        for (let i = 0; i < waypoints.length - 1; i++) {
            const d = L.latLng(waypoints[i].lat, waypoints[i].lng).distanceTo(L.latLng(waypoints[i + 1].lat, waypoints[i + 1].lng));
            dist += d;
            const speed = waypoints[i].speed > 0 ? waypoints[i].speed : 5; 
            time += d / speed;
        }
        return { totalDistance: dist, estimatedTime: time };
    }, [waypoints]);

    const selectedDroneInfo = useMemo(() => drones.find(d => String(d.id) === String(selectedDroneId)), [drones, selectedDroneId]);
    const isBatteryWarning = selectedDroneInfo?.max_flight_time && (estimatedTime / 60) > selectedDroneInfo.max_flight_time;

    const saveMissionToDB = async () => {
        if (waypoints.length === 0) return alert('Add at least one waypoint!');
        if (!selectedDroneId) return alert('Please assign a drone to this mission!'); 
        setIsLoading(true);
        const { error } = await supabase.from('missions').insert([{ name: missionName, waypoints: waypoints, total_distance: totalDistance, drone_id: selectedDroneId, company_id: profile.company_id }]);
        setIsLoading(false);
        if (error) alert('Error: ' + error.message);
        else { alert('Mission saved to Database!'); fetchMissions(); }
    };

    const loadMission = (mission) => {
        setMissionName(mission.name); setSelectedDroneId(mission.drone_id || ''); setHistory([]); setWaypoints(mission.waypoints); setEditingPoint(null);
    };

    const deleteMissionFromDB = async (id) => {
        if (!window.confirm('Are you sure you want to delete this mission?')) return;
        const { error } = await supabase.from('missions').delete().eq('id', id);
        if (!error) fetchMissions();
    };

    const handleArchiveMission = async (id) => {
        const { error } = await supabase.from('missions').update({ is_archived: true }).eq('id', id);
        if (!error) fetchMissions();
    };

    const handleUnarchiveMission = async (id) => {
        const { error } = await supabase.from('missions').update({ is_archived: false }).eq('id', id);
        if (!error) fetchMissions();
    };

    const formatTime = (seconds) => {
        if (!seconds) return "0s";
        const m = Math.floor(seconds / 60); const s = Math.round(seconds % 60);
        return `${m > 0 ? m + 'm ' : ''}${s}s`;
    };

    // ВИРІШЕННЯ ПРОБЛЕМ ПЕРЕТИНУ ЗАБОРОНЕНИХ ЗОН
    const hasViolation = useMemo(() => {
        if (waypoints.length === 0 || !dynamicNfz.features) return false;
        // Перевіряємо кожну заборонену зону на перетин з маршрутом
        for (let feature of dynamicNfz.features) {
            const polygonCoords = feature.geometry.coordinates[0]; 
            for (let wp of waypoints) { if (isPointInsidePolygon([wp.lng, wp.lat], polygonCoords)) return true; }
            for (let i = 0; i < waypoints.length - 1; i++) {
                let A = [waypoints[i].lng, waypoints[i].lat]; let B = [waypoints[i+1].lng, waypoints[i+1].lat];
                for (let j = 0; j < polygonCoords.length - 1; j++) {
                    let C = polygonCoords[j]; let D = polygonCoords[j + 1];
                    if (doIntersect(A, B, C, D)) return true;
                }
            }
        }
        return false;
    }, [waypoints, dynamicNfz]);

    const midpoints = useMemo(() => {
        const mids = [];
        for (let i = 0; i < waypoints.length - 1; i++) {
            const wp1 = waypoints[i], wp2 = waypoints[i + 1];
            mids.push({ lat: (wp1.lat + wp2.lat) / 2, lng: (wp1.lng + wp2.lng) / 2, insertIndex: i + 1, alt: Math.round((wp1.alt + wp2.alt) / 2), speed: Math.round((wp1.speed + wp2.speed) / 2), name: "" });
        }
        return mids;
    }, [waypoints]);

    function MapEvents() { useMapEvents({ click(e) { setEditingPoint({ lat: e.latlng.lat, lng: e.latlng.lng, alt: 50, speed: 10, name: "", isNew: true }); } }); return null; }

    const handleMarkerDragStart = () => { setHistory(prev => [...prev, waypoints]); setEditingPoint(null); };
    const handleMarkerDrag = (e, id) => { const position = e.target.getLatLng(); setWaypoints(prev => prev.map(wp => wp.id === id ? { ...wp, lat: position.lat, lng: position.lng } : wp)); };
    const handleMidpointDragStart = (e, mid) => { setHistory(prev => [...prev, waypoints]); const position = e.target.getLatLng(); const newWp = { id: Date.now(), lat: position.lat, lng: position.lng, alt: mid.alt, speed: mid.speed, name: "", isNew: false }; setWaypoints(prev => { const newArray = [...prev]; newArray.splice(mid.insertIndex, 0, newWp); return newArray; }); };
    const confirmWaypoint = () => { if (editingPoint.isNew) updateWaypointsWithHistory([...waypoints, { ...editingPoint, id: Date.now(), isNew: false }]); else updateWaypointsWithHistory(waypoints.map(wp => wp.id === editingPoint.id ? editingPoint : wp)); setEditingPoint(null); };
    const removeWaypoint = (id) => { updateWaypointsWithHistory(waypoints.filter(wp => wp.id !== id)); if (editingPoint?.id === id) setEditingPoint(null); };
    const makeCircular = () => { if (waypoints.length < 2) return; const firstPoint = { ...waypoints[0], id: Date.now(), isNew: false }; updateWaypointsWithHistory([...waypoints, firstPoint]); };

    // Генерація польотного файлу (Експорт)
    const saveMissionFile = () => {
        let fileContent = "QGC WPL 110\n";
        fileContent += `0\t1\t0\t16\t0\t0\t0\t0\t${waypoints[0].lat.toFixed(6)}\t${waypoints[0].lng.toFixed(6)}\t0.000000\t1\n`;
        let seqIndex = 1; let currentSpeed = -1;
        waypoints.forEach((wp) => { 
            if (wp.speed !== currentSpeed) {
                fileContent += `${seqIndex}\t0\t3\t178\t1.0\t${wp.speed.toFixed(1)}\t-1.0\t0.0\t0.0\t0.0\t0.0\t1\n`;
                seqIndex++; currentSpeed = wp.speed;
            }
            fileContent += `${seqIndex}\t0\t3\t16\t0.0\t0.0\t0.0\t0.0\t${wp.lat.toFixed(6)}\t${wp.lng.toFixed(6)}\t${wp.alt.toFixed(1)}\t1\n`; 
            seqIndex++;
        });
        fileContent += `${seqIndex}\t0\t3\t20\t0.0\t0.0\t0.0\t0.0\t0.0\t0.0\t0.0\t1\n`;
        const blob = new Blob([fileContent], { type: 'text/plain' });
        const link = document.createElement('a'); 
        link.href = URL.createObjectURL(blob); 
        link.download = `${missionName || 'mission'}.waypoints`; 
        link.click();
    };

    let displayedMissions = savedMissions.filter(m => activeTab === 'archived' ? m.is_archived : !m.is_archived);
    if (filterDroneId) displayedMissions = displayedMissions.filter(m => String(m.drone_id) === filterDroneId);
    if (searchQuery) displayedMissions = displayedMissions.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!profile) return null;

    return (
        <div style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 80px)' }}>
            <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <h2 style={{ margin: 0 }}>Mission Planner</h2>
                        <button onClick={handleNewPlan} style={{ ...miniButtonStyle, background: '#10b981', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <PlusCircle size={14} /> New Plan
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button onClick={handleUndo} disabled={history.length === 0} style={{ ...buttonStyle, background: history.length === 0 ? '#cbd5e1' : '#64748b', display: 'flex', gap: '5px', padding: '10px', cursor: history.length === 0 ? 'not-allowed' : 'pointer' }} title="Undo (Ctrl+Z)"><Undo2 size={16} /> Undo</button>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Mission Name</label>
                            <input value={missionName} onChange={(e) => setMissionName(e.target.value)} style={{...inputStyle, padding: '8px', width: '130px'}} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Assign Drone</label>
                            <select value={selectedDroneId} onChange={(e) => setSelectedDroneId(e.target.value)} style={{...inputStyle, padding: '8px', width: '160px'}}>
                                <option value="" disabled>-- Select Fleet --</option>
                                {drones.map(d => <option key={d.id} value={d.id}>{d.name} ({d.model})</option>)}
                            </select>
                        </div>
                        <button onClick={saveMissionToDB} disabled={isLoading || hasViolation || isBatteryWarning} style={{ ...buttonStyle, background: (hasViolation || isBatteryWarning) ? '#94a3b8' : '#3b82f6', display: 'flex', gap: '8px', marginTop: '16px', cursor: (hasViolation || isBatteryWarning) ? 'not-allowed' : 'pointer' }}>
                            <Database size={16} /> {isLoading ? 'Saving...' : 'Save to DB'}
                        </button>
                    </div>
                </div>

                {/* ЗОНА АЛЕРТІВ */}
                {hasViolation && (
                    <div style={{ background: '#fef2f2', border: '1px solid #ef4444', color: '#b91c1c', padding: '10px', borderRadius: '8px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '600' }}>
                        <AlertTriangle size={20} /> Route Violation: The flight path intersects a Restricted Zone. Please adjust the route.
                    </div>
                )}

                {isBatteryWarning && (
                    <div style={{ background: '#fff7ed', border: '1px solid #f97316', color: '#9a3412', padding: '10px', borderRadius: '8px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '600' }}>
                        <AlertTriangle size={20} /> Warning: Estimated time ({Math.round(estimatedTime/60)} min) exceeds {selectedDroneInfo?.name}'s battery limit ({selectedDroneInfo?.max_flight_time} min).
                    </div>
                )}
                
                {weatherAlert && (
                    <div style={{ background: '#eff6ff', border: '1px solid #3b82f6', color: '#1e40af', padding: '10px', borderRadius: '8px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '500' }}>
                        {weatherAlert.rain ? <CloudRain size={20} /> : <Wind size={20} />}
                        {weatherAlert.message}
                    </div>
                )}

                <div style={{ flex: 1, background: 'white', borderRadius: '12px', padding: '10px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', position: 'relative' }}>
                    
                    <div style={{ position: 'absolute', top: '15px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', pointerEvents: 'none' }}>
                        <button 
                            onClick={(e) => { e.preventDefault(); setShowWeatherOverlay(!showWeatherOverlay); }}
                            style={{ ...buttonStyle, background: showWeatherOverlay ? '#3b82f6' : 'white', color: showWeatherOverlay ? 'white' : '#475569', border: '2px solid rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', pointerEvents: 'auto', boxShadow: '0 1px 5px rgba(0,0,0,0.65)' }}
                        >
                            <Cloud size={16} /> Weather Probe
                        </button>
                        
                        {showWeatherOverlay && currentWeather && (
                            <div style={weatherWidgetStyle}>
                                <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #e2e8f0', paddingBottom: '5px', color: '#0f172a', display: 'flex', justifyContent: 'space-between' }}>
                                    Local Conditions <Activity size={14} color="#3b82f6"/>
                                </h4>
                                <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '8px', textAlign: 'center' }}>At map center</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#475569' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><Thermometer size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> Temp:</span> <strong>{currentWeather.temperature_2m}°C</strong></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><Wind size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }}/> Wind:</span> <strong>{currentWeather.wind_speed_10m} m/s</strong></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><Wind size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px', color: '#ef4444' }}/> Gusts:</span> <strong style={{ color: '#ef4444' }}>{currentWeather.wind_gusts_10m} m/s</strong></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><CloudRain size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px', color: '#3b82f6' }}/> Rain:</span> <strong>{currentWeather.precipitation} mm</strong></div>
                                </div>
                            </div>
                        )}
                    </div>

                    {isLoadingNfz && (
                        <div style={{ position: 'absolute', bottom: '20px', left: '20px', zIndex: 1000, background: 'white', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
                            <ShieldAlert size={16} className="animate-spin" /> Scanning Area for NFZ...
                        </div>
                    )}

                    <MapContainer center={mapCenter} zoom={12} style={{ height: '100%', width: '100%', borderRadius: '8px', zIndex: 1 }}>
                        <LayersControl position="topright">
                            <LayersControl.BaseLayer checked name="Standard Map">
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={22} />
                            </LayersControl.BaseLayer>
                            <LayersControl.BaseLayer name="Satellite">
                                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={22} />
                            </LayersControl.BaseLayer>
                            
                            {/* КНОПКА ВКЛЮЧЕННЯ РАДАРУ */}
                            <LayersControl.Overlay name="Live Cloud Cover">
                                <LiveRadarLayer />
                            </LayersControl.Overlay>
                        </LayersControl>
                        
                        <MapTracker setMapCenter={setMapCenter} />
                        <NFZManager setDynamicNfz={setDynamicNfz} setIsLoadingNfz={setIsLoadingNfz} />

                        {dynamicNfz.features.length > 0 && (
                            <GeoJSON 
                                key={JSON.stringify(dynamicNfz)} 
                                data={dynamicNfz} 
                                style={(feature) => ({ color: feature.properties.color, fillColor: feature.properties.color, fillOpacity: 0.3, weight: 2 })} 
                                onEachFeature={(feature, layer) => layer.bindPopup(`<strong>⛔ ${feature.properties.name}</strong><br/>No flights allowed.`)} 
                            />
                        )}
                        
                        {waypoints.map((wp, index) => (
                            <Marker key={wp.id} position={[wp.lat, wp.lng]} draggable={true} eventHandlers={{ dragstart: handleMarkerDragStart, drag: (e) => handleMarkerDrag(e, wp.id) }}>
                                <Popup><div style={{ textAlign: 'center' }}><strong>{wp.name ? `${wp.name} (#${index + 1})` : `Waypoint #${index + 1}`}</strong><br/><div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}><button onClick={() => setEditingPoint({ ...wp, isNew: false })} style={miniButtonStyle}>Edit</button><button onClick={() => removeWaypoint(wp.id)} style={{ ...miniButtonStyle, background: '#ef4444' }}>Delete</button></div></div></Popup>
                            </Marker>
                        ))}
                        {midpoints.map((mid, idx) => ( <Marker key={`mid-${idx}`} position={[mid.lat, mid.lng]} icon={midPointIcon} draggable={true} eventHandlers={{ dragstart: (e) => handleMidpointDragStart(e, mid), dragend: (e) => { const newPos = e.target.getLatLng(); setWaypoints(prev => { const newWp = [...prev]; newWp[mid.insertIndex].lat = newPos.lat; newWp[mid.insertIndex].lng = newPos.lng; return newWp; }); } }}></Marker> ))}
                        {editingPoint && editingPoint.isNew && <Marker position={[editingPoint.lat, editingPoint.lng]} opacity={0.5} />}
                        <Polyline positions={waypoints.map(wp => [wp.lat, wp.lng])} color={hasViolation ? "#ef4444" : "#3b82f6"} weight={hasViolation ? 4 : 3} dashArray={hasViolation ? "10, 10" : ""} />
                        <MapEvents />
                    </MapContainer>
                </div>
            </div>

            <div style={{ flex: 1.2, background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', overflowY: 'auto' }}>
                {editingPoint ? (
                    <div style={{ marginBottom: '20px', border: editingPoint.isNew ? '2px solid #3b82f6' : '2px solid #f59e0b', padding: '15px', borderRadius: '10px' }}>
                        <h3 style={{ marginTop: 0 }}>{editingPoint.isNew ? 'Add Point' : 'Edit Point'}</h3>
                        <div style={{ display: 'grid', gap: '12px' }}>
                            <div><label style={labelStyle}>Label (Optional) <input type="text" value={editingPoint.name || ''} onChange={e => setEditingPoint({...editingPoint, name: e.target.value})} placeholder="e.g., Target Alpha" style={inputStyle} /></label></div>
                            <div style={{ display: 'flex', gap: '10px' }}><label style={labelStyle}>Lat <input type="number" value={editingPoint.lat} onChange={e => setEditingPoint({...editingPoint, lat: parseFloat(e.target.value)})} style={inputStyle} /></label><label style={labelStyle}>Lng <input type="number" value={editingPoint.lng} onChange={e => setEditingPoint({...editingPoint, lng: parseFloat(e.target.value)})} style={inputStyle} /></label></div>
                            <label style={labelStyle}>Altitude (m) <input type="number" value={editingPoint.alt} onChange={e => setEditingPoint({...editingPoint, alt: parseInt(e.target.value)})} style={inputStyle} /></label>
                            <label style={labelStyle}>Speed (m/s) <input type="number" value={editingPoint.speed} onChange={e => setEditingPoint({...editingPoint, speed: parseInt(e.target.value)})} style={inputStyle} /></label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}><button onClick={confirmWaypoint} style={{ ...buttonStyle, background: editingPoint.isNew ? '#3b82f6' : '#f59e0b' }}>{editingPoint.isNew ? 'Confirm Point' : 'Save Changes'}</button><button onClick={() => setEditingPoint(null)} style={{ ...buttonStyle, background: '#94a3b8' }}>Cancel</button></div>
                        </div>
                    </div>
                ) : ( <div style={{ textAlign: 'center', padding: '15px', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1', marginBottom: '20px' }}><p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Click map to add waypoints</p></div> )}

                <div style={{ background: '#f1f5f9', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>TOTAL DISTANCE & ESTIMATED TIME</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>
                        {totalDistance.toFixed(0)} m <span style={{ color: '#64748b', fontSize: '14px', fontWeight: '400' }}>({(totalDistance / 1000).toFixed(2)} km)</span> 
                        <span style={{ margin: '0 10px', color: '#cbd5e1' }}>|</span> 
                        <Clock size={16} style={{ display: 'inline', marginBottom: '-2px', color: '#3b82f6' }}/> <span style={{ color: '#3b82f6' }}>{formatTime(estimatedTime)}</span>
                    </div>
                </div>

                <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ margin: '0', fontSize: '16px' }}>Flight Plan</h3>{waypoints.length > 0 && <button onClick={saveMissionFile} disabled={hasViolation} style={{...miniButtonStyle, background: hasViolation ? '#94a3b8' : '#10b981', display: 'flex', alignItems: 'center', gap: '5px'}}><Download size={14}/> Export</button>}</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                    {waypoints.length === 0 && <p style={{ fontSize: '13px', color: '#94a3b8' }}>No waypoints added yet.</p>}
                    {waypoints.map((wp, index) => (
                        <div key={wp.id} style={{...waypointCardStyle, borderLeft: editingPoint?.id === wp.id ? '4px solid #f59e0b' : '4px solid #cbd5e1'}}>
                            <div onClick={() => setEditingPoint({ ...wp, isNew: false })} style={{ cursor: 'pointer', flex: 1 }}><div style={{ fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>#{index + 1} {wp.name ? <span style={{color: '#3b82f6'}}>{wp.name}</span> : 'Waypoint'} <Edit3 size={12} color="#94a3b8"/></div><div style={{ fontSize: '12px', color: '#64748b' }}>Alt: {wp.alt}m | Spd: {wp.speed}m/s</div></div>
                            <Trash2 size={18} color="#ef4444" style={{ cursor: 'pointer' }} onClick={() => removeWaypoint(wp.id)} />
                        </div>
                    ))}
                    {waypoints.length >= 2 && <button onClick={makeCircular} style={{ ...buttonStyle, background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '5px' }}><RotateCw size={16} /> Return to Start (Loop)</button>}
                </div>

                <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h3 style={{ margin: 0, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <FolderOpen size={18} /> Database History
                        </h3>
                        {filterDroneId && ( <button onClick={() => navigate('/missions')} style={{...miniButtonStyle, background: '#64748b', display: 'flex', alignItems: 'center', gap: '4px'}}><XCircle size={12}/> Clear Filter</button> )}
                    </div>

                    <div style={{ position: 'relative', marginBottom: '15px' }}>
                        <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input 
                            type="text" 
                            placeholder="Search missions..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ ...inputStyle, width: '100%', paddingLeft: '32px', paddingRight: '32px', boxSizing: 'border-box' }}
                        />
                        {searchQuery && (
                            <X 
                                size={16} 
                                color="#94a3b8" 
                                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer' }}
                                onClick={() => setSearchQuery('')}
                            />
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => setActiveTab('active')} style={{ flex: 1, padding: '8px', border: 'none', background: activeTab === 'active' ? '#10b981' : '#f1f5f9', color: activeTab === 'active' ? 'white' : '#64748b', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>Active</button>
                        <button onClick={() => setActiveTab('archived')} style={{ flex: 1, padding: '8px', border: 'none', background: activeTab === 'archived' ? '#64748b' : '#f1f5f9', color: activeTab === 'archived' ? 'white' : '#64748b', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>Archived</button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {displayedMissions.length === 0 ? <p style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No {activeTab} missions found.</p> : 
                        displayedMissions.map((m) => (
                            <div key={m.id} style={{...waypointCardStyle, opacity: m.is_archived ? 0.7 : 1}}>
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: m.is_archived ? '#64748b' : '#0f172a' }}>{m.name}</div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', margin: '4px 0' }}><Calendar size={10} /> {new Date(m.created_at).toLocaleDateString('en-GB')}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>{m.waypoints.length} pts | {m.total_distance.toFixed(0)}m {m.drones && <span style={{ marginLeft: '8px', color: m.is_archived ? '#94a3b8' : '#10b981', fontWeight: '600' }}>🎯 {m.drones.name}</span>}</div>
                                </div>
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    {m.flight_logs && m.flight_logs.length > 0 && ( <button onClick={() => navigate(`/logbook?mission=${m.id}`)} style={{...miniButtonStyle, background: '#10b981', display: 'flex', alignItems: 'center', gap: '4px'}} title="View Analysis Logs"><Activity size={12} /> {m.flight_logs.length}</button> )}
                                    {m.is_archived ? ( <button onClick={() => handleUnarchiveMission(m.id)} title="Restore to Active" style={{...miniButtonStyle, background: '#3b82f6', padding: '4px 6px'}}><ArchiveRestore size={14} /></button> ) : ( <button onClick={() => handleArchiveMission(m.id)} title="Send to Archive" style={{...miniButtonStyle, background: '#64748b', padding: '4px 6px'}}><Archive size={14} /></button> )}
                                    <button onClick={() => loadMission(m)} style={miniButtonStyle}>Load</button>
                                    <button onClick={() => deleteMissionFromDB(m.id)} style={{...miniButtonStyle, background: '#ef4444', padding: '4px 6px'}}><Trash2 size={14} /></button>
                                </div>
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    );
}

const labelStyle = { display: 'flex', flexDirection: 'column', fontSize: '12px', fontWeight: '600', color: '#475569', gap: '4px', flex: 1 };
const inputStyle = { padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px' };
const buttonStyle = { padding: '10px 16px', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s' };
const miniButtonStyle = { padding: '4px 10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' };
const waypointCardStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' };
const weatherWidgetStyle = { background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(4px)', padding: '15px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0', width: '200px', pointerEvents: 'auto' };

export default Missions;
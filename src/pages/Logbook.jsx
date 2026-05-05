import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import Papa from 'papaparse';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Upload, AlertOctagon, Activity, Map as MapIcon, Database, Crosshair, Lightbulb, X, Eye, EyeOff, Target, Save, FolderOpen, Calendar, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

function distanceToSegment(P, A, B) {
    const R = 6371000; const rad = Math.PI / 180; const latMid = (A.lat + B.lat) / 2 * rad;
    const px = P.lng * rad * R * Math.cos(latMid), py = P.lat * rad * R;
    const ax = A.lng * rad * R * Math.cos(latMid), ay = A.lat * rad * R;
    const bx = B.lng * rad * R * Math.cos(latMid), by = B.lat * rad * R;
    const l2 = (ax - bx) ** 2 + (ay - by) ** 2;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    let t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2));
    return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay))); 
}

const adviceDatabase = {
    battery: "Battery Drop: Check batteries before agricultural flight. Avoid flying with old batteries in cold weather.",
    gps: "GPS Loss: Weak signal may indicate dense environment or heavy cloud cover. Ensure RTH uses barometer fallbacks.",
    speed: "Speed Anomaly: Sudden stops or overspeeding usually indicate strong wind gusts during field mapping.",
    course: "Off-Course: The drone was pushed off the planned trajectory. Check compass calibration.",
    time: "Flight Time Exceeded: The drone flew longer than its rated maximum flight time. Plan shorter survey routes."
};

function FitBounds({ bounds }) {
    const map = useMap();
    useEffect(() => { if (bounds && bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] }); }, [bounds, map]);
    return null;
}

function Logbook({ profile }) {
    const [savedMissions, setSavedMissions] = useState([]);
    const [savedLogs, setSavedLogs] = useState([]);
    const [selectedMission, setSelectedMission] = useState(null); 
    const [telemetryData, setTelemetryData] = useState([]); 
    const [anomalies, setAnomalies] = useState([]);
    const [courseErrorTimes, setCourseErrorTimes] = useState(new Set()); 
    const [pointErrorTimes, setPointErrorTimes] = useState(new Set()); 
    const [anomalyTypes, setAnomalyTypes] = useState(new Set()); 
    const [showTips, setShowTips] = useState(false); 
    const [hoveredPoint, setHoveredPoint] = useState(null);
    const [mapBounds, setMapBounds] = useState(null);
    const [showPlanned, setShowPlanned] = useState(true);
    const [showActual, setShowActual] = useState(true);
    const [showAnomalies, setShowAnomalies] = useState(true);
    
    const [logName, setLogName] = useState('');
    const [isSavingLog, setIsSavingLog] = useState(false);

    const [isReportOpen, setIsReportOpen] = useState(true);
    const [isChartOpen, setIsChartOpen] = useState(true);
    const [isHistoryOpen, setIsHistoryOpen] = useState(true);

    const chartRef = useRef(null);
    const location = useLocation();
    const navigate = useNavigate();
    const searchParams = new URLSearchParams(location.search);
    const filterMissionId = searchParams.get('mission');
    const filterDroneId = searchParams.get('drone');

    useEffect(() => {
        if (profile?.company_id) {
            fetchMissions();
            fetchLogs();
        }
    }, [profile]);

    useEffect(() => {
        if (filterMissionId && savedMissions.length > 0) {
            const m = savedMissions.find(m => String(m.id) === filterMissionId);
            if (m) { setSelectedMission(m); setLogName(`Analysis: ${m.name}`); }
        }
    }, [filterMissionId, savedMissions]);

    // ОНОВЛЕНО: Фільтрація дронів залежно від ролі (для отримання правильних місій)
    const fetchMissions = async () => {
        const { data: allMissions } = await supabase.from('missions').select('*, drones(name), flight_logs(id)').order('created_at', { ascending: false });
        
        if (profile.role === 'admin') {
            setSavedMissions(allMissions || []);
        } else {
            // Пілот бачить місії ТІЛЬКИ тих дронів, до яких має доступ
            const { data: myAccess } = await supabase.from('drone_access').select('drone_id').eq('user_id', profile.id);
            if (myAccess && allMissions) {
                const allowedIds = myAccess.map(a => a.drone_id);
                setSavedMissions(allMissions.filter(m => allowedIds.includes(m.drone_id)));
            } else setSavedMissions([]);
        }
    };

    const fetchLogs = async () => {
        const { data } = await supabase.from('flight_logs').select('*, missions(name), drones(name)').order('created_at', { ascending: false });
        if (data) setSavedLogs(data);
    };

    const handleMissionSelect = (e) => {
        const mission = savedMissions.find(m => m.id === parseInt(e.target.value));
        setSelectedMission(mission || null);
        if (mission) {
            setLogName(`Analysis: ${mission.name}`); 
            if (mission.waypoints.length > 0) setMapBounds(mission.waypoints.map(wp => [wp.lat, wp.lng]));
        } else setLogName('');
        setTelemetryData([]); setAnomalies([]);
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        Papa.parse(file, {
            header: true, dynamicTyping: true, 
            complete: (results) => {
                const normalizedData = results.data.filter(row => row.lat && row.lng).map(row => ({
                    time: row.time || row.TimeMs || 0, lat: row.lat || row.Latitude, lng: row.lng || row.Longitude,
                    alt: row.alt || row.Altitude || 0, speed: row.speed || row.GroundSpeed || 0, 
                    battery: row.battery || row.Voltage || 12.0, satellites: row.satellites || row.num_sats || 10
                }));
                setTelemetryData(normalizedData);
                runAnomalyDetector(normalizedData, selectedMission?.waypoints, selectedMission?.drones);
                if (normalizedData.length > 0) setMapBounds(normalizedData.map(dp => [dp.lat, dp.lng]));
            }
        });
    };

    const saveLogToDB = async () => {
        if (!selectedMission || telemetryData.length === 0) return;
        setIsSavingLog(true);
        const { error } = await supabase.from('flight_logs').insert([{ mission_id: selectedMission.id, drone_id: selectedMission.drone_id, name: logName || 'Unnamed Analysis', telemetry_data: telemetryData, company_id: profile.company_id }]);
        setIsSavingLog(false);
        if (error) alert('Error: ' + error.message);
        else { alert('Analysis Saved Successfully!'); setLogName(`Analysis: ${selectedMission.name}`); fetchLogs(); }
    };

    const loadLogFromDB = (log) => {
        const mission = savedMissions.find(m => m.id === log.mission_id);
        setSelectedMission(mission || null); setLogName(log.name); setTelemetryData(log.telemetry_data); 
        runAnomalyDetector(log.telemetry_data, mission?.waypoints, mission?.drones);
        if (log.telemetry_data.length > 0) setMapBounds(log.telemetry_data.map(dp => [dp.lat, dp.lng]));
        setIsReportOpen(true); setIsChartOpen(true);
    };

    const deleteLogFromDB = async (id) => {
        if (!window.confirm('Are you sure you want to delete this analysis log?')) return;
        const { error } = await supabase.from('flight_logs').delete().eq('id', id);
        if (error) alert('Error deleting log: ' + error.message);
        else fetchLogs();
    };

    const runAnomalyDetector = (factData, planData, droneData) => {
        let detectedAnomalies = []; let cTimes = new Set(); let pTimes = new Set(); let types = new Set();
        factData.forEach((point) => {
            let isPointError = false;
            if (point.battery < 10.5) { detectedAnomalies.push({ time: point.time, text: `Time ${point.time}s: CRITICAL BATTERY DROP (${point.battery}V)`, type: 'battery' }); types.add('battery'); isPointError = true; }
            if (point.satellites < 8) { detectedAnomalies.push({ time: point.time, text: `Time ${point.time}s: Weak GPS Signal (${point.satellites} sats)`, type: 'gps' }); types.add('gps'); isPointError = true; }
            if (point.speed > 12) { detectedAnomalies.push({ time: point.time, text: `Time ${point.time}s: Overspeeding (${point.speed.toFixed(1)} m/s)`, type: 'speed' }); types.add('speed'); isPointError = true; } 
            else if (point.alt > 10 && point.speed === 0) { detectedAnomalies.push({ time: point.time, text: `Time ${point.time}s: Unplanned mid-air stop`, type: 'speed' }); types.add('speed'); isPointError = true; }
            if (droneData && droneData.max_flight_time) { const maxTimeSeconds = droneData.max_flight_time * 60; if (point.time > maxTimeSeconds) { detectedAnomalies.push({ time: point.time, text: `Time ${point.time}s: Exceeded max flight time of ${droneData.max_flight_time}m`, type: 'time' }); types.add('time'); isPointError = true; } }
            if (isPointError) pTimes.add(point.time);
            if (planData && planData.length >= 2) {
                let minDistance = Infinity;
                for (let i = 0; i < planData.length - 1; i++) { const dist = distanceToSegment(point, planData[i], planData[i+1]); if (dist < minDistance) minDistance = dist; }
                if (minDistance > 5) { detectedAnomalies.push({ time: point.time, text: `Time ${point.time}s: Off-course by ${minDistance.toFixed(1)}m`, type: 'course' }); types.add('course'); cTimes.add(point.time); }
            }
        });
        const uniqueAnomalies = detectedAnomalies.filter((v, i, a) => a.findIndex(t => (t.text === v.text)) === i);
        setAnomalies(uniqueAnomalies.slice(0, 10)); setCourseErrorTimes(cTimes); setPointErrorTimes(pTimes); setAnomalyTypes(types);
    };

    useEffect(() => {
        const chart = chartRef.current;
        if (chart && telemetryData.length > 0) {
            if (hoveredPoint) {
                const index = telemetryData.findIndex(d => d.time === hoveredPoint.time);
                if (index !== -1) {
                    chart.setActiveElements([{ datasetIndex: 0, index }, { datasetIndex: 1, index }, { datasetIndex: 2, index }]);
                    chart.tooltip.setActiveElements([{ datasetIndex: 0, index }, { datasetIndex: 1, index }, { datasetIndex: 2, index }], { x: chart.scales.x.getPixelForTick(index), y: chart.scales.yAlt.getPixelForValue(hoveredPoint.alt) });
                }
            } else { chart.setActiveElements([]); chart.tooltip.setActiveElements([], { x: 0, y: 0 }); }
            chart.update('none'); 
        }
    }, [hoveredPoint, telemetryData]);

    const chartData = {
        labels: telemetryData.map(d => `${d.time}s`),
        datasets: [
            { label: 'Altitude (m)', data: telemetryData.map(d => d.alt), borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.5)', yAxisID: 'yAlt' },
            { label: 'Speed (m/s)', data: telemetryData.map(d => d.speed), borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.5)', yAxisID: 'yAlt', borderDash: [5, 5] },
            { label: 'Battery (V)', data: telemetryData.map(d => d.battery), borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.5)', yAxisID: 'yBat' }
        ]
    };

    const chartOptions = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, onHover: (event, activeElements) => { if (activeElements.length > 0) { const point = telemetryData[activeElements[0].index]; if (!hoveredPoint || hoveredPoint.time !== point.time) setHoveredPoint(point); } else { if (hoveredPoint) setHoveredPoint(null); } }, scales: { yAlt: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Alt(m) / Speed(m/s)'} }, yBat: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Voltage (V)'}, grid: { drawOnChartArea: false } }, } };

    const customPlugins = useMemo(() => [{ id: 'external-crosshair', afterDraw: (chart) => { if (hoveredPoint) { const index = telemetryData.findIndex(d => d.time === hoveredPoint.time); if (index === -1) return; const ctx = chart.ctx; const x = chart.scales.x.getPixelForTick(index); ctx.save(); ctx.beginPath(); ctx.moveTo(x, chart.chartArea.top); ctx.lineTo(x, chart.chartArea.bottom); ctx.lineWidth = 2; ctx.strokeStyle = '#eab308'; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.restore(); } } }], [hoveredPoint, telemetryData]);

    let displayedLogs = savedLogs;
    if (filterDroneId) displayedLogs = displayedLogs.filter(l => String(l.drone_id) === filterDroneId);
    if (filterMissionId) displayedLogs = displayedLogs.filter(l => String(l.mission_id) === filterMissionId);

    if (!profile) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 80px)', position: 'relative' }}>
            {showTips && ( <div style={modalOverlayStyle}><div style={modalContentStyle}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}><h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Lightbulb color="#f59e0b" /> Incident Analysis & Recommendations</h2><button onClick={() => setShowTips(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} color="#64748b" /></button></div>{anomalyTypes.size === 0 ? ( <p>No critical issues detected in this flight log. The flight was successful.</p> ) : ( <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}><p style={{ margin: 0, color: '#475569' }}>Based on the telemetry data, we recommend reviewing the following systems:</p>{Array.from(anomalyTypes).map(type => ( <div key={type} style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}><strong>{type.toUpperCase()}:</strong> {adviceDatabase[type]}</div> ))}</div> )}</div></div> )}

            <div style={{ display: 'flex', gap: '20px', background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><Database size={20}/> 1. Select Planned Mission</h3>{(filterMissionId || filterDroneId) && ( <button onClick={() => navigate('/logbook')} style={{...miniButtonStyle, background: '#64748b', display: 'flex', gap: '4px'}}><X size={12}/> Clear Filter</button> )}</div>
                    <select value={selectedMission?.id || ''} onChange={handleMissionSelect} style={inputStyle}>
                        <option value="">-- Choose an active mission --</option>
                        {savedMissions.filter(m => !m.is_archived).map(m => ( <option key={m.id} value={m.id}>{m.name} ({new Date(m.created_at).toLocaleDateString('en-GB')})</option> ))}
                    </select>
                    {selectedMission?.drones && ( <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px' }}><Target size={14} color="#10b981"/> <strong>Assigned Fleet:</strong> {selectedMission.drones.name} ({selectedMission.drones.model}) | Max Time: {selectedMission.drones.max_flight_time}m</div> )}
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><Upload size={20}/> 2. Upload Flight Log (CSV)</h3>
                    <input type="file" accept=".csv" onChange={handleFileUpload} disabled={!selectedMission} style={{ ...inputStyle, padding: '5px', cursor: selectedMission ? 'pointer' : 'not-allowed', background: !selectedMission ? '#f1f5f9' : 'white' }} />
                    {telemetryData.length > 0 && (
                        <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}><label style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Analysis Name</label><input value={logName} onChange={(e) => setLogName(e.target.value)} placeholder="e.g., Morning Survey Check" style={inputStyle} /></div>
                            <button onClick={saveLogToDB} disabled={isSavingLog} style={{...buttonStyle, background: '#10b981', width: '100%', display: 'flex', justifyContent: 'center', gap: '8px'}}><Save size={16} /> {isSavingLog ? 'Saving...' : 'Save Telemetry Analysis to DB'}</button>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: 0 }}>
                <div style={{ flex: 1.5, background: 'white', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><MapIcon size={20}/> Flight Path Overlay</h3>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><div style={{ display: 'flex', gap: '15px', fontSize: '13px', fontWeight: 'bold' }}><div onClick={() => setShowPlanned(!showPlanned)} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#3b82f6', cursor: 'pointer', opacity: showPlanned ? 1 : 0.4, transition: 'opacity 0.2s' }}>{showPlanned ? <Eye size={16}/> : <EyeOff size={16}/>} ─── Planned</div><div onClick={() => setShowActual(!showActual)} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fca5a5', cursor: 'pointer', opacity: showActual ? 1 : 0.4, transition: 'opacity 0.2s' }}>{showActual ? <Eye size={16}/> : <EyeOff size={16}/>} - - - Actual</div><div onClick={() => setShowAnomalies(!showAnomalies)} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#991b1b', cursor: 'pointer', opacity: showAnomalies ? 1 : 0.4, transition: 'opacity 0.2s' }}>{showAnomalies ? <Eye size={16}/> : <EyeOff size={16}/>} ───/● Anomalies</div></div></div>
                    <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', position: 'relative' }}>
                        <MapContainer center={[51.5300, 31.3100]} zoom={14} style={{ height: '100%', width: '100%' }}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            <FitBounds bounds={mapBounds} />
                            {selectedMission && showPlanned && <Polyline positions={selectedMission.waypoints.map(wp => [wp.lat, wp.lng])} color="#3b82f6" weight={4} opacity={0.5} />}
                            {showActual && telemetryData.length > 0 && <Polyline positions={telemetryData.map(dp => [dp.lat, dp.lng])} color="#fca5a5" weight={3} dashArray="8, 8" />}
                            {showAnomalies && telemetryData.length > 0 && telemetryData.slice(0, -1).map((dp, i) => { const nextDp = telemetryData[i + 1]; if (courseErrorTimes.has(dp.time) || courseErrorTimes.has(nextDp.time)) return <Polyline key={`act-seg-${i}`} positions={[[dp.lat, dp.lng], [nextDp.lat, nextDp.lng]]} color="#991b1b" weight={5} />; return null; })}
                            {showAnomalies && telemetryData.map((dp, i) => { if (pointErrorTimes.has(dp.time)) return <CircleMarker key={`anomaly-pt-${i}`} center={[dp.lat, dp.lng]} radius={5} pathOptions={{ color: '#991b1b', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }} interactive={false} />; return null; })}
                            {telemetryData.map((dp, i) => <CircleMarker key={`hitbox-${i}`} center={[dp.lat, dp.lng]} radius={12} opacity={0} fillOpacity={0} eventHandlers={{ mouseover: () => setHoveredPoint(dp), mouseout: () => setHoveredPoint(null) }} />)}
                            {hoveredPoint && <CircleMarker center={[hoveredPoint.lat, hoveredPoint.lng]} radius={7} interactive={false} pathOptions={{ color: 'black', fillColor: '#eab308', fillOpacity: 1, weight: 2 }} />}
                        </MapContainer>
                    </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto', paddingRight: '5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', background: hoveredPoint ? '#fefce8' : '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', transition: 'all 0.2s' }}><div style={{ fontSize: '13px', color: '#475569', fontWeight: 'bold' }}><Crosshair size={14} style={{ marginBottom: '-2px', marginRight: '4px' }}/> LIVE TRACKER: {hoveredPoint ? `${hoveredPoint.time}s` : 'Hover map, chart, or report'}</div>{hoveredPoint && ( <div style={{ fontSize: '13px', fontWeight: '600', display: 'flex', gap: '15px' }}><span style={{ color: '#3b82f6' }}>Alt: {hoveredPoint.alt}m</span><span style={{ color: '#f59e0b' }}>Spd: {hoveredPoint.speed}m/s</span><span style={{ color: '#ef4444' }}>Bat: {hoveredPoint.battery}V</span></div> )}</div>

                    <div style={{ background: anomalies.length > 0 ? '#fef2f2' : '#f0fdf4', border: anomalies.length > 0 ? '1px solid #f87171' : '1px solid #86efac', borderRadius: '12px', padding: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setIsReportOpen(!isReportOpen)}>
                            <h3 style={{ margin: 0, color: anomalies.length > 0 ? '#b91c1c' : '#166534', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><AlertOctagon size={20} /> Post-Flight Report</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>{anomalies.length > 0 && ( <button onClick={(e) => { e.stopPropagation(); setShowTips(true); }} style={{ background: '#fef08a', color: '#854d0e', border: '1px solid #fde047', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}><Lightbulb size={14} /> Get Tips</button> )}{isReportOpen ? <ChevronUp size={20} color="#64748b"/> : <ChevronDown size={20} color="#64748b"/>}</div>
                        </div>
                        {isReportOpen && ( <div style={{ marginTop: '15px' }}>{anomalies.length === 0 ? ( <p style={{ color: '#166534', margin: 0, fontSize: '14px' }}>Waiting for log data or no anomalies detected.</p> ) : ( <ul style={{ color: '#991b1b', margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: '1.5' }}>{anomalies.map((a, i) => ( <li key={i} onMouseEnter={() => { const point = telemetryData.find(d => d.time === a.time); if (point) setHoveredPoint(point); }} onMouseLeave={() => setHoveredPoint(null)} style={{ marginBottom: '4px', background: hoveredPoint?.time === a.time ? '#fef08a' : 'transparent', transition: 'background 0.2s', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' }}>{a.text}</li> ))}</ul> )}</div> )}
                    </div>

                    <div style={{ background: 'white', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setIsChartOpen(!isChartOpen)}><h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><Activity size={20}/> Telemetry Analysis</h3>{isChartOpen ? <ChevronUp size={20} color="#64748b"/> : <ChevronDown size={20} color="#64748b"/>}</div>
                        {isChartOpen && ( <div style={{ height: '200px', position: 'relative', marginTop: '15px' }}>{telemetryData.length > 0 ? ( <Line ref={chartRef} data={chartData} options={chartOptions} plugins={customPlugins} /> ) : ( <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>Upload a CSV log to view charts</div> )}</div> )}
                    </div>

                    <div style={{ background: 'white', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: isHistoryOpen ? '1px solid #e2e8f0' : 'none', paddingBottom: isHistoryOpen ? '10px' : '0', marginBottom: isHistoryOpen ? '15px' : '0' }} onClick={() => setIsHistoryOpen(!isHistoryOpen)}><h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><FolderOpen size={20}/> Saved Analysis History</h3>{isHistoryOpen ? <ChevronUp size={20} color="#64748b"/> : <ChevronDown size={20} color="#64748b"/>}</div>
                        {isHistoryOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '5px' }}>
                                {displayedLogs.length === 0 ? <p style={{ fontSize: '13px', color: '#94a3b8' }}>No saved logs found.</p> : 
                                    displayedLogs.map((log) => (
                                        <div key={log.id} style={waypointCardStyle}>
                                            <div>
                                                <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#0f172a' }}>{log.name || 'Unnamed Analysis'}</div>
                                                <div style={{ fontSize: '12px', color: '#475569' }}>Mission: {log.missions?.name || 'Unknown'}</div>
                                                <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', margin: '4px 0' }}><Calendar size={10} /> {new Date(log.created_at).toLocaleString('en-GB')}</div>
                                                {log.drones && <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '600' }}>🎯 {log.drones.name}</span>}
                                            </div>
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                <button onClick={() => loadLogFromDB(log)} style={miniButtonStyle}>Load</button>
                                                <button onClick={() => deleteLogFromDB(log.id)} style={{...miniButtonStyle, background: '#ef4444', padding: '4px 6px'}}><Trash2 size={14} /></button>
                                            </div>
                                        </div>
                                    ))
                                }
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' };
const buttonStyle = { padding: '10px 16px', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s' };
const miniButtonStyle = { padding: '4px 10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' };
const waypointCardStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' };
const modalOverlayStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(2px)' };
const modalContentStyle = { background: 'white', padding: '30px', borderRadius: '16px', width: '600px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' };

export default Logbook;
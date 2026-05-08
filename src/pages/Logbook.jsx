import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import Papa from 'papaparse';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom'; 
import { Upload, AlertOctagon, Activity, Map as MapIcon, Database, Crosshair, Lightbulb, X, Eye, EyeOff, Target, Save, FolderOpen, Calendar, ChevronUp, ChevronDown, Trash2, Download, Navigation, Clock, List, BarChart2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, zoomPlugin);

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

// === НОВЕ: ДИНАМІЧНИЙ ГЕНЕРАТОР ПОРАД НА ОСНОВІ ДРОНА ===
const getDynamicAdvice = (type, drone) => {
    const droneName = drone ? `${drone.name} (${drone.model})` : 'the assigned drone';
    
    switch (type) {
        case 'speed':
            return drone?.max_speed 
                ? `Speed Limit Exceeded: The telemetry shows sudden acceleration beyond safe limits. The hardware specification for ${droneName} restricts safe operation to ${drone.max_speed} m/s. Exceeding this dramatically increases the risk of loss of control, motor burnout, and reduces structural integrity in wind.`
                : `Speed Anomaly: Sudden stops or overspeeding usually indicate strong wind gusts during field mapping.`;
        case 'time':
            return drone?.max_flight_time
                ? `Critical Flight Time: You flew longer than the recommended maximum. The manufacturer limit for ${droneName} is ${drone.max_flight_time} minutes. Operating beyond this threshold severely compromises battery health and risks sudden mid-air power failure. Redesign your survey routes to be shorter.`
                : `Flight Time Exceeded: The drone flew longer than its rated maximum flight time. Plan shorter survey routes.`;
        case 'battery':
            return `Battery Voltage Drop: Voltage dropped below 10.5V. Check the battery health for ${droneName}. Avoid flying with degraded or old batteries, especially in cold weather.`;
        case 'gps':
            return `GPS Signal Loss: The satellite count dropped to critical levels. This may indicate a dense flying environment (trees/buildings), heavy cloud cover, or solar interference. Ensure the RTH (Return To Home) protocol uses barometer fallbacks.`;
        case 'course':
            return `Off-Course Deviation: The drone was pushed off the planned trajectory by more than 10 meters. Check the compass calibration on ${droneName} before the next flight. Also, review the wind conditions during this mission.`;
        default:
            return "Review telemetry for potential hardware or environmental anomalies.";
    }
};

const ALIASES = {
    time: ['time', 'Time(seconds)', 'time(millisecond)', 'TimeMs', 'Time', 'datetime(utc)'],
    lat: ['lat', 'Latitude', 'latitude', 'OSD.latitude', 'latitude(degrees)', 'GPS.Lat'],
    lng: ['lng', 'lon', 'Longitude', 'longitude', 'OSD.longitude', 'longitude(degrees)', 'GPS.Lng'],
    alt: ['alt', 'Altitude(meters)', 'height', 'Altitude', 'altitude(feet)', 'height_above_takeoff(feet)', 'OSD.altitude', 'GPS.Alt'],
    speed: ['speed', 'HSpeed(m/s)', 'Speed(m/s)', 'GroundSpeed', 'speed(mph)', 'OSD.speed'],
    battery: ['battery', 'BatteryVoltage', 'voltage(v)', 'Voltage', 'BAT.Volt', 'OSD.battery'],
    satellites: ['satellites', 'GpsCount', 'num_sats', 'GPS.Sats', 'Satellites', 'sats'],
    pitch: ['pitch', 'Pitch', 'pitch(degrees)', 'Pitch(degrees)', 'Pitch(deg)', 'pitch_angle'],
    roll: ['roll', 'Roll', 'roll(degrees)', 'Roll(degrees)', 'Roll(deg)', 'roll_angle'],
    yaw: ['yaw', 'Yaw', 'yaw(360)', 'compass_heading(degrees)', 'Yaw(degrees)', 'Yaw(deg)', 'yaw_angle'],
    temperature: ['temperature', 'battery_temperature(f)', 'Temp', 'OSD.temperature'],
    current: ['current(a)', 'current', 'Amperage', 'Current', 'OSD.current']
};

const METRICS = [
    { key: 'alt', label: 'Altitude', unit: 'm', color: '#3b82f6', icon: <Navigation size={16}/> },
    { key: 'speed', label: 'Speed', unit: 'm/s', color: '#f59e0b', icon: <Activity size={16}/> },
    { key: 'battery', label: 'Battery Voltage', unit: 'V', color: '#ef4444', icon: <AlertOctagon size={16}/> },
    { key: 'satellites', label: 'Satellites', unit: 'sats', color: '#8b5cf6', icon: <Target size={16}/> },
    { key: 'pitch', label: 'Pitch (Тангаж)', unit: '°', color: '#10b981', icon: <Navigation size={16}/> },
    { key: 'roll', label: 'Roll (Крен)', unit: '°', color: '#14b8a6', icon: <Navigation size={16}/> },
    { key: 'yaw', label: 'Yaw (Напрямок)', unit: '°', color: '#6366f1', icon: <Navigation size={16}/> },
    { key: 'temperature', label: 'Battery Temp', unit: '°C', color: '#ef4444', icon: <Activity size={16}/> },
    { key: 'current', label: 'Current Draw', unit: 'A', color: '#f97316', icon: <Activity size={16}/> },
];

function MapController({ bounds, isPdfMode }) {
    const map = useMap();
    useEffect(() => { if (bounds && bounds.length > 0) { map.fitBounds(bounds, { padding: [50, 50] }); } }, [bounds, map]);
    useEffect(() => {
        setTimeout(() => {
            map.invalidateSize();
            if (bounds && bounds.length > 0) { map.fitBounds(bounds, { padding: [50, 50], animate: false }); }
        }, 300);
    }, [isPdfMode, map, bounds]);
    return null;
}

const MetricChart = ({ metric, data, hoveredPoint, setHoveredPoint, isPdfMode }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [showTable, setShowTable] = useState(false);
    const chartRef = useRef(null);

    useEffect(() => {
        if (isPdfMode) { setIsExpanded(true); setShowTable(false); }
    }, [isPdfMode]);

    useEffect(() => {
        const chart = chartRef.current;
        if (chart && !showTable && data.length > 0) {
            if (hoveredPoint) {
                const index = data.findIndex(d => d.time === hoveredPoint.time);
                if (index !== -1) {
                    chart.setActiveElements([{ datasetIndex: 0, index }]);
                    chart.tooltip.setActiveElements([{ datasetIndex: 0, index }], { x: chart.scales.x.getPixelForTick(index), y: chart.scales.y.getPixelForValue(hoveredPoint[metric.key]) });
                }
            } else {
                chart.setActiveElements([]);
                chart.tooltip.setActiveElements([], { x: 0, y: 0 });
            }
            chart.update('none');
        }
    }, [hoveredPoint, data, showTable, metric.key]);

    const chartData = {
        labels: data.map(d => `${d.time}s`),
        datasets: [{
            label: `${metric.label} (${metric.unit})`,
            data: data.map(d => d[metric.key]),
            borderColor: metric.color,
            backgroundColor: `${metric.color}33`,
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 5
        }]
    };

    const customCrosshair = useMemo(() => [{
        id: 'crosshair',
        afterDraw: (chart) => {
            if (hoveredPoint) {
                const index = data.findIndex(d => d.time === hoveredPoint.time);
                if (index === -1) return;
                const ctx = chart.ctx;
                const x = chart.scales.x.getPixelForTick(index);
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, chart.chartArea.top);
                ctx.lineTo(x, chart.chartArea.bottom);
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#94a3b8';
                ctx.setLineDash([5, 5]);
                ctx.stroke();
                ctx.restore();
            }
        }
    }], [hoveredPoint, data]);

    const chartOptions = {
        responsive: true, maintainAspectRatio: false, animation: !isPdfMode,
        interaction: { mode: 'index', intersect: false },
        onHover: (e, activeElements) => {
            if (activeElements.length > 0) setHoveredPoint(data[activeElements[0].index]);
            else setHoveredPoint(null);
        },
        plugins: {
            legend: { display: false },
            zoom: {
                pan: { enabled: true, mode: 'x' },
                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
            }
        },
        scales: {
            x: { ticks: { maxTicksLimit: 10 } },
            y: { title: { display: true, text: `${metric.label} (${metric.unit})` } }
        }
    };

    return (
        <div className={isPdfMode ? "pdf-block" : ""} style={{ background: 'white', borderRadius: '12px', padding: '15px', border: '1px solid #e2e8f0', marginBottom: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: metric.color }}>
                    {metric.icon} {metric.label}
                </h4>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        onClick={() => setShowTable(!showTable)} 
                        style={{ padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px', background: showTable ? '#3b82f6' : '#f1f5f9', color: showTable ? 'white' : '#475569', border: '1px solid #cbd5e1' }}
                    >
                        {showTable ? <BarChart2 size={14}/> : <List size={14}/>}
                        {showTable ? 'View Chart' : 'View Data'}
                    </button>
                    <button onClick={() => setIsExpanded(!isExpanded)} style={{ background:'none', border:'none', cursor:'pointer', color: '#64748b' }}>
                        {isExpanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                    </button>
                </div>
            </div>
            
            {isExpanded && (
                <div style={{ marginTop: '15px' }}>
                    {showTable ? (
                        <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <table style={{ width: '100%', fontSize: '12px', textAlign: 'left', borderCollapse: 'collapse' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                                    <tr>
                                        <th style={{ padding: '10px 12px', color: '#475569' }}>Time (s)</th>
                                        <th style={{ padding: '10px 12px', color: metric.color }}>{metric.label} ({metric.unit})</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((row, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px 12px', color: '#64748b' }}>{row.time}</td>
                                            <td style={{ padding: '8px 12px', fontWeight: '500' }}>{row[metric.key] !== null ? row[metric.key].toFixed(2) : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ height: '220px', position: 'relative' }}>
                            <Line ref={chartRef} data={chartData} options={chartOptions} plugins={customCrosshair} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

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
    const [actualFlightDistance, setActualFlightDistance] = useState(0); 
    const [actualFlightTime, setActualFlightTime] = useState(0); 
    const [actualAnomaliesCount, setActualAnomaliesCount] = useState(0); 

    const [isSavingLog, setIsSavingLog] = useState(false);
    
    const [isExporting, setIsExporting] = useState(false);
    const [isPdfMode, setIsPdfMode] = useState(false);

    const [isReportOpen, setIsReportOpen] = useState(true);
    const [isChartOpen, setIsChartOpen] = useState(true);
    const [isHistoryOpen, setIsHistoryOpen] = useState(true);

    const location = useLocation();
    const navigate = useNavigate();
    const searchParams = new URLSearchParams(location.search);
    const filterMissionId = searchParams.get('mission');
    const filterDroneId = searchParams.get('drone');

    useEffect(() => {
        if (profile?.company_id) { fetchMissions(); fetchLogs(); }
    }, [profile]);

    useEffect(() => {
        if (filterMissionId && savedMissions.length > 0) {
            const m = savedMissions.find(m => String(m.id) === filterMissionId);
            if (m) { setSelectedMission(m); setLogName(`Analysis: ${m.name}`); }
        }
    }, [filterMissionId, savedMissions]);

    useEffect(() => {
        const bounds = [];
        if (selectedMission && selectedMission.waypoints) bounds.push(...selectedMission.waypoints.map(wp => [wp.lat, wp.lng]));
        if (telemetryData && telemetryData.length > 0) bounds.push(...telemetryData.map(dp => [dp.lat, dp.lng]));
        if (bounds.length > 0) setMapBounds(bounds);
    }, [selectedMission, telemetryData]);

    const fetchMissions = async () => {
        const { data: allMissions } = await supabase.from('missions').select('*, drones(name, model, max_flight_time, max_speed), flight_logs(id)').order('created_at', { ascending: false });
        if (profile.role === 'admin') setSavedMissions(allMissions || []);
        else {
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
        if (mission) setLogName(`Analysis: ${mission.name}`); 
        else setLogName('');
        
        setTelemetryData([]); setAnomalies([]); setActualFlightDistance(0); setActualFlightTime(0); setActualAnomaliesCount(0);
    };

    const calculateDistanceSafely = (dataArray) => {
        let dist = 0;
        for (let i = 0; i < dataArray.length - 1; i++) {
            dist += L.latLng(dataArray[i].lat, dataArray[i].lng).distanceTo(L.latLng(dataArray[i+1].lat, dataArray[i+1].lng));
        }
        return dist;
    };

    const formatTime = (seconds) => {
        if (!seconds) return "0s";
        const m = Math.floor(seconds / 60); 
        const s = Math.round(seconds % 60);
        return `${m > 0 ? m + 'm ' : ''}${s}s`;
    };

    const extractMetric = (row, aliases, isFeet = false, isMph = false, isFahrenheit = false) => {
        const key = aliases.find(k => row[k] !== undefined && row[k] !== null && row[k] !== '');
        if (key) {
            let val = parseFloat(row[key]);
            if (!isNaN(val)) {
                if (isFeet && key.toLowerCase().includes('feet')) val *= 0.3048;
                if (isMph && key.toLowerCase().includes('mph')) val *= 0.44704;
                if (isFahrenheit && key.toLowerCase().includes('(f)')) val = (val - 32) * (5/9);
                return val;
            }
        }
        return null;
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        Papa.parse(file, {
            header: true, dynamicTyping: true, skipEmptyLines: 'greedy', 
            complete: (results) => {
                const normalizedData = results.data
                    .map((row, index) => {
                        const latKey = ALIASES.lat.find(k => row[k] !== undefined && row[k] !== null && row[k] !== '');
                        const lngKey = ALIASES.lng.find(k => row[k] !== undefined && row[k] !== null && row[k] !== '');
                        
                        if (!latKey || !lngKey) return null; 

                        let cleanLat = typeof row[latKey] === 'string' ? parseFloat(row[latKey].replace(',', '.')) : parseFloat(row[latKey]);
                        let cleanLng = typeof row[lngKey] === 'string' ? parseFloat(row[lngKey].replace(',', '.')) : parseFloat(row[lngKey]);
                        if (isNaN(cleanLat) || isNaN(cleanLng)) return null;

                        let parsedTime = index; 
                        const timeKey = ALIASES.time.find(k => row[k] !== undefined && row[k] !== null && row[k] !== '');
                        if (timeKey) {
                            let t = parseFloat(row[timeKey]);
                            if (!isNaN(t)) {
                                if (timeKey.toLowerCase().includes('ms') || timeKey.toLowerCase().includes('millisecond')) parsedTime = t / 1000;
                                else parsedTime = t;
                            }
                        }

                        return {
                            time: parsedTime, 
                            lat: cleanLat, 
                            lng: cleanLng,
                            alt: extractMetric(row, ALIASES.alt, true, false), 
                            speed: extractMetric(row, ALIASES.speed, false, true), 
                            battery: extractMetric(row, ALIASES.battery), 
                            satellites: extractMetric(row, ALIASES.satellites),
                            pitch: extractMetric(row, ALIASES.pitch),
                            roll: extractMetric(row, ALIASES.roll),
                            yaw: extractMetric(row, ALIASES.yaw),
                            temperature: extractMetric(row, ALIASES.temperature, false, false, true),
                            current: extractMetric(row, ALIASES.current)
                        };
                    })
                    .filter(row => row !== null && (Math.abs(row.lat) > 0.00001 || Math.abs(row.lng) > 0.00001)); 
                
                if (normalizedData.length === 0) {
                    alert("No valid GPS data found in this log. Ensure it contains Latitude and Longitude columns, and values are not 0,0.");
                    return;
                }

                const calculatedDist = calculateDistanceSafely(normalizedData);
                const detectedErrs = runAnomalyDetector(normalizedData, selectedMission?.waypoints, selectedMission?.drones);
                const fTime = normalizedData.length > 1 ? (normalizedData[normalizedData.length - 1].time - normalizedData[0].time) : 0;
                
                setActualFlightDistance(calculatedDist);
                setActualFlightTime(fTime > 0 ? fTime : normalizedData.length);
                setActualAnomaliesCount(detectedErrs.length);
                setTelemetryData(normalizedData);
            }
        });
    };

    const saveLogToDB = async () => {
        if (!selectedMission || telemetryData.length === 0) return;
        setIsSavingLog(true);
        const { error } = await supabase.from('flight_logs').insert([{ 
            mission_id: selectedMission.id, drone_id: selectedMission.drone_id, 
            name: logName || 'Unnamed Analysis', telemetry_data: telemetryData, 
            actual_distance: actualFlightDistance, 
            flight_time: actualFlightTime, 
            anomalies_count: actualAnomaliesCount,
            company_id: profile.company_id 
        }]);
        setIsSavingLog(false);
        if (error) alert('Error: ' + error.message);
        else { alert('Analysis Saved Successfully!'); setLogName(`Analysis: ${selectedMission.name}`); fetchLogs(); }
    };

    const loadLogFromDB = async (log) => {
        const mission = savedMissions.find(m => m.id === log.mission_id);
        setSelectedMission(mission || null); 
        setLogName(log.name); 
        
        const validData = (log.telemetry_data || []).map(dp => ({
            ...dp, lat: parseFloat(dp.lat), lng: parseFloat(dp.lng)
        }));
        setTelemetryData(validData); 
        
        let dist = log.actual_distance || 0;
        let time = log.flight_time || 0;
        
        const detectedErrs = runAnomalyDetector(validData, mission?.waypoints, mission?.drones);
        let aCount = log.anomalies_count;
        
        let needsDbHeal = false;
        if (dist === 0 && validData.length > 1) { dist = calculateDistanceSafely(validData); needsDbHeal = true; }
        if (time === 0 && validData.length > 1) { time = validData[validData.length - 1].time - validData[0].time; if(time <= 0) time = validData.length; needsDbHeal = true; }
        if (aCount !== detectedErrs.length) { aCount = detectedErrs.length; needsDbHeal = true; }
        
        if (needsDbHeal) {
            await supabase.from('flight_logs').update({ actual_distance: dist, flight_time: time, anomalies_count: aCount }).eq('id', log.id);
        }
        
        setActualFlightDistance(dist);
        setActualFlightTime(time);
        setActualAnomaliesCount(aCount);
        setIsReportOpen(true); setIsChartOpen(true);
    };

    const deleteLogFromDB = async (id) => {
        if (!window.confirm('Are you sure you want to delete this analysis log?')) return;
        const { error } = await supabase.from('flight_logs').delete().eq('id', id);
        if (error) alert('Error deleting log: ' + error.message);
        else fetchLogs();
    };

    const handleExportPDF = async (e) => {
        e.stopPropagation();
        setIsExporting(true); 
        setIsPdfMode(true); 
        
        setTimeout(() => {
            window.dispatchEvent(new Event('resize')); 
            setTimeout(async () => {
                try {
                    const pdf = new jsPDF('p', 'mm', 'a4');
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const pdfHeight = pdf.internal.pageSize.getHeight();
                    
                    const marginX = 10;
                    const maxImgWidth = pdfWidth - (marginX * 2);
                    let currentY = 10; 
                    let isFirstPage = true;

                    const blocks = document.querySelectorAll('.pdf-block');

                    for (let i = 0; i < blocks.length; i++) {
                        const block = blocks[i];
                        
                        const canvas = await html2canvas(block, { scale: 2, useCORS: true });
                        const imgData = canvas.toDataURL('image/png');
                        
                        const imgHeight = (canvas.height * maxImgWidth) / canvas.width;

                        if (currentY + imgHeight > pdfHeight - 10 && !isFirstPage) {
                            pdf.addPage();
                            currentY = 10; 
                        }
                        
                        pdf.addImage(imgData, 'PNG', marginX, currentY, maxImgWidth, imgHeight);
                        currentY += imgHeight + 5; 
                        isFirstPage = false;
                    }

                    pdf.save(`${logName || 'flight-report'}.pdf`);
                } catch (error) {
                    console.error("PDF Export failed:", error); 
                    alert("Failed to generate PDF. Make sure all maps and charts are loaded.");
                }
                
                setIsPdfMode(false); 
                setIsExporting(false);
                setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
            }, 1500); 
        }, 100);
    };

    const runAnomalyDetector = (factData, planData, droneData) => {
        let detectedAnomalies = []; let cTimes = new Set(); let pTimes = new Set(); let types = new Set();
        let missionStartIndex = 0; let missionEndIndex = factData.length - 1;

        if (planData && planData.length >= 2 && factData.length > 0) {
            let minDistToStart = Infinity; let minDistToEnd = Infinity;
            factData.forEach((pt, idx) => {
                const dStart = L.latLng(pt.lat, pt.lng).distanceTo(L.latLng(planData[0].lat, planData[0].lng));
                const dEnd = L.latLng(pt.lat, pt.lng).distanceTo(L.latLng(planData[planData.length - 1].lat, planData[planData.length - 1].lng));
                if (dStart < minDistToStart) { minDistToStart = dStart; missionStartIndex = idx; }
                if (dEnd < minDistToEnd) { minDistToEnd = dEnd; missionEndIndex = idx; }
            });
            if (missionStartIndex > missionEndIndex) { missionStartIndex = 0; missionEndIndex = factData.length - 1; }
        }

        factData.forEach((point, index) => {
            let isPointError = false;
            
            const speedLimit = droneData?.max_speed || 18;

            if (point.battery !== null && point.battery < 10.5) { detectedAnomalies.push({ time: point.time, text: `Time ${point.time}s: CRITICAL BATTERY DROP (${point.battery.toFixed(1)}V)`, type: 'battery' }); types.add('battery'); isPointError = true; }
            if (point.satellites !== null && point.satellites < 8) { detectedAnomalies.push({ time: point.time, text: `Time ${point.time}s: Weak GPS Signal (${point.satellites} sats)`, type: 'gps' }); types.add('gps'); isPointError = true; }
            
            if (point.speed !== null && point.speed > speedLimit) { 
                detectedAnomalies.push({ time: point.time, text: `Time ${point.time}s: Overspeeding (${point.speed.toFixed(1)} m/s, Limit: ${speedLimit})`, type: 'speed' }); 
                types.add('speed'); 
                isPointError = true; 
            } 
            
            if (droneData && droneData.max_flight_time) { const maxTimeSeconds = droneData.max_flight_time * 60; if (point.time > maxTimeSeconds) { detectedAnomalies.push({ time: point.time, text: `Time ${point.time}s: Exceeded max flight time of ${droneData.max_flight_time}m`, type: 'time' }); types.add('time'); isPointError = true; } }
            if (isPointError) pTimes.add(point.time);
            
            if (planData && planData.length >= 2) {
                if (index >= missionStartIndex && index <= missionEndIndex) {
                    let minDistance = Infinity;
                    for (let i = 0; i < planData.length - 1; i++) { 
                        const dist = distanceToSegment(point, planData[i], planData[i+1]); 
                        if (dist < minDistance) minDistance = dist; 
                    }
                    if (minDistance > 10) { 
                        detectedAnomalies.push({ time: point.time, text: `Time ${point.time}s: Off-course by ${minDistance.toFixed(1)}m`, type: 'course' }); 
                        types.add('course'); 
                        cTimes.add(point.time); 
                    }
                }
            }
        });
        
        const uniqueAnomalies = detectedAnomalies.filter((v, i, a) => a.findIndex(t => (t.text === v.text)) === i);
        setAnomalies(uniqueAnomalies.slice(0, 10)); setCourseErrorTimes(cTimes); setPointErrorTimes(pTimes); setAnomalyTypes(types);
        return uniqueAnomalies;
    };

    const activeMetrics = METRICS.filter(m => telemetryData.some(d => d[m.key] !== null && d[m.key] !== undefined));

    let displayedLogs = savedLogs;
    if (filterDroneId) displayedLogs = displayedLogs.filter(l => String(l.drone_id) === filterDroneId);
    if (filterMissionId) displayedLogs = displayedLogs.filter(l => String(l.mission_id) === filterMissionId);

    if (!profile) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 80px)', position: 'relative' }}>
            
            {/* ОНОВЛЕНО: Модалка з персоналізованими порадами */}
            {showTips && !isPdfMode && ( 
                <div style={modalOverlayStyle}>
                    <div style={modalContentStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '15px' }}>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Lightbulb color="#f59e0b" /> Incident Analysis & Recommendations
                            </h2>
                            <button onClick={() => setShowTips(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} color="#64748b" /></button>
                        </div>
                        {anomalyTypes.size === 0 ? ( 
                            <p>No critical issues detected in this flight log. The flight was successful.</p> 
                        ) : ( 
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <p style={{ margin: 0, color: '#475569' }}>
                                    Based on the telemetry data and the specific hardware limits of <strong>{selectedMission?.drones?.name || 'this drone'}</strong>, we recommend reviewing the following systems:
                                </p>
                                {Array.from(anomalyTypes).map(type => ( 
                                    <div key={type} style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #f59e0b', fontSize: '14px', lineHeight: '1.5' }}>
                                        <strong>{type.toUpperCase()}:</strong> {getDynamicAdvice(type, selectedMission?.drones)}
                                    </div> 
                                ))}
                            </div> 
                        )}
                    </div>
                </div> 
            )}

            {!isPdfMode && (
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
            )}

            <div id="logbook-report" style={
                isPdfMode ? {
                    width: '1000px', background: 'white', padding: '40px', position: 'absolute', top: 0, left: 0, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '20px'
                } : {
                    display: 'flex', gap: '20px', flex: 1, minHeight: 0, background: '#f8fafc', padding: '10px', borderRadius: '12px'
                }
            }>
                {isPdfMode && (
                    <div className="pdf-block" style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '15px' }}>
                        <h1 style={{ margin: '0 0 10px 0', color: '#0f172a' }}>Flight Analysis Report</h1>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#475569' }}>
                            <div>
                                <strong>Analysis Name:</strong> {logName || 'Unnamed Analysis'}<br/>
                                <strong>Date Generated:</strong> {new Date().toLocaleString('en-GB')}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <strong>Flown Distance:</strong> {(actualFlightDistance / 1000).toFixed(2)} km<br/>
                                <strong>Flight Time:</strong> {formatTime(actualFlightTime)} | <strong>Issues:</strong> {actualAnomaliesCount}<br/>
                                {selectedMission?.drones && (<><strong>Assigned Fleet:</strong> {selectedMission.drones.name} ({selectedMission.drones.model})</>)}
                            </div>
                        </div>
                    </div>
                )}

                <div className={isPdfMode ? "pdf-block" : ""} style={{
                    flex: isPdfMode ? 'none' : 1.5,
                    height: isPdfMode ? '450px' : 'auto', 
                    background: 'white', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', flexDirection: 'column'
                }}>
                    <h3 style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><MapIcon size={20}/> Flight Path Overlay</h3>
                    {!isPdfMode && ( <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><div style={{ display: 'flex', gap: '15px', fontSize: '13px', fontWeight: 'bold' }}><div onClick={() => setShowPlanned(!showPlanned)} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#3b82f6', cursor: 'pointer', opacity: showPlanned ? 1 : 0.4, transition: 'opacity 0.2s' }}>{showPlanned ? <Eye size={16}/> : <EyeOff size={16}/>} ─── Planned</div><div onClick={() => setShowActual(!showActual)} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fca5a5', cursor: 'pointer', opacity: showActual ? 1 : 0.4, transition: 'opacity 0.2s' }}>{showActual ? <Eye size={16}/> : <EyeOff size={16}/>} - - - Actual</div><div onClick={() => setShowAnomalies(!showAnomalies)} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#991b1b', cursor: 'pointer', opacity: showAnomalies ? 1 : 0.4, transition: 'opacity 0.2s' }}>{showAnomalies ? <Eye size={16}/> : <EyeOff size={16}/>} ───/● Anomalies</div></div></div> )}
                    <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0', position: 'relative' }}>
                        <MapContainer preferCanvas={true} center={[51.5300, 31.3100]} zoom={14} style={{ height: '100%', width: '100%' }}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            <MapController bounds={mapBounds} isPdfMode={isPdfMode} />
                            {selectedMission && showPlanned && <Polyline positions={selectedMission.waypoints.map(wp => [wp.lat, wp.lng])} color="#3b82f6" weight={4} opacity={0.5} />}
                            {showActual && telemetryData.length > 0 && <Polyline positions={telemetryData.map(dp => [dp.lat, dp.lng])} color="#fca5a5" weight={3} dashArray="8, 8" />}
                            {showAnomalies && telemetryData.length > 0 && telemetryData.slice(0, -1).map((dp, i) => { const nextDp = telemetryData[i + 1]; if (courseErrorTimes.has(dp.time) || courseErrorTimes.has(nextDp.time)) return <Polyline key={`act-seg-${i}`} positions={[[dp.lat, dp.lng], [nextDp.lat, nextDp.lng]]} color="#991b1b" weight={5} />; return null; })}
                            {showAnomalies && telemetryData.map((dp, i) => { if (pointErrorTimes.has(dp.time)) return <CircleMarker key={`anomaly-pt-${i}`} center={[dp.lat, dp.lng]} radius={5} pathOptions={{ color: '#991b1b', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }} interactive={false} />; return null; })}
                            {!isPdfMode && telemetryData.map((dp, i) => <CircleMarker key={`hitbox-${i}`} center={[dp.lat, dp.lng]} radius={12} opacity={0} fillOpacity={0} eventHandlers={{ mouseover: () => setHoveredPoint(dp), mouseout: () => setHoveredPoint(null) }} />)}
                            {hoveredPoint && !isPdfMode && <CircleMarker center={[hoveredPoint.lat, hoveredPoint.lng]} radius={7} interactive={false} pathOptions={{ color: 'black', fillColor: '#eab308', fillOpacity: 1, weight: 2 }} />}
                        </MapContainer>
                    </div>
                </div>

                {isPdfMode ? (
                    <>
                        <div className="pdf-block" style={{ display: 'flex', gap: '20px' }}>
                            <div style={{ flex: 1, background: anomalies.length > 0 ? '#fef2f2' : '#f0fdf4', border: anomalies.length > 0 ? '1px solid #f87171' : '1px solid #86efac', borderRadius: '12px', padding: '15px' }}>
                                <h3 style={{ margin: '0 0 10px 0', color: anomalies.length > 0 ? '#b91c1c' : '#166534', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><AlertOctagon size={20} /> Post-Flight Report</h3>
                                {anomalies.length === 0 ? ( <p style={{ color: '#166534', margin: 0, fontSize: '14px' }}>No anomalies detected. Flight was successful.</p> ) : ( <ul style={{ color: '#991b1b', margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: '1.5' }}>{anomalies.map((a, i) => <li key={i} style={{ marginBottom: '4px' }}>{a.text}</li>)}</ul> )}
                            </div>
                            <div style={{ flex: 1, background: '#fffbeb', border: '1px solid #fde047', borderRadius: '12px', padding: '15px' }}>
                                <h3 style={{ margin: '0 0 10px 0', color: '#854d0e', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><Lightbulb size={20} /> Recommendations</h3>
                                {anomalyTypes.size === 0 ? ( <p style={{ color: '#854d0e', margin: 0, fontSize: '14px' }}>No recommendations required.</p> ) : ( <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#854d0e' }}>{Array.from(anomalyTypes).map(type => ( <div key={type}><strong>{type.toUpperCase()}:</strong> {getDynamicAdvice(type, selectedMission?.drones)}</div> ))}</div> )}
                            </div>
                        </div>
                        
                        {activeMetrics.map(metric => (
                            <MetricChart key={metric.key} metric={metric} data={telemetryData} hoveredPoint={hoveredPoint} setHoveredPoint={setHoveredPoint} isPdfMode={isPdfMode} />
                        ))}
                    </>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto', paddingRight: '5px' }}>
                        
                        {telemetryData.length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: selectedMission ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                <div style={{ background: '#e0f2fe', border: '1px solid #bae6fd', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '10px', color: '#0284c7', fontWeight: 'bold', textTransform: 'uppercase' }}>Flown Distance</span>
                                    <span style={{ fontSize: '18px', color: '#0369a1', fontWeight: '900' }}>{(actualFlightDistance / 1000).toFixed(2)} km</span>
                                </div>
                                
                                {selectedMission && (
                                    <div style={{ background: '#d1fae5', border: '1px solid #a7f3d0', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '10px', color: '#059669', fontWeight: 'bold', textTransform: 'uppercase' }}>Planned Distance</span>
                                        <span style={{ fontSize: '18px', color: '#047857', fontWeight: '900' }}>{(selectedMission.total_distance / 1000).toFixed(2)} km</span>
                                    </div>
                                )}

                                <div style={{ background: '#f3e8ff', border: '1px solid #ddd6fe', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '10px', color: '#7c3aed', fontWeight: 'bold', textTransform: 'uppercase' }}>Flight Time</span>
                                    <span style={{ fontSize: '18px', color: '#6d28d9', fontWeight: '900' }}>{formatTime(actualFlightTime)}</span>
                                </div>

                                <div style={{ background: actualAnomaliesCount > 0 ? '#fef2f2' : '#f0fdf4', border: actualAnomaliesCount > 0 ? '1px solid #fecaca' : '1px solid #bbf7d0', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '10px', color: actualAnomaliesCount > 0 ? '#e11d48' : '#059669', fontWeight: 'bold', textTransform: 'uppercase' }}>Issues Found</span>
                                    <span style={{ fontSize: '18px', color: actualAnomaliesCount > 0 ? '#be123c' : '#047857', fontWeight: '900' }}>{actualAnomaliesCount}</span>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', background: hoveredPoint ? '#fefce8' : '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0', transition: 'all 0.2s' }}>
                            <div style={{ fontSize: '13px', color: '#475569', fontWeight: 'bold' }}>
                                <Crosshair size={14} style={{ marginBottom: '-2px', marginRight: '4px' }}/> 
                                {hoveredPoint ? `LIVE TRACKER: ${hoveredPoint.time}s` : 'Hover over map or chart to track point'}
                            </div>
                            {hoveredPoint && ( 
                                <div style={{ fontSize: '13px', fontWeight: '600', display: 'flex', gap: '15px' }}>
                                    <span style={{ color: '#3b82f6' }}>Alt: {hoveredPoint.alt !== null ? hoveredPoint.alt.toFixed(1) : '-'}m</span>
                                    <span style={{ color: '#f59e0b' }}>Spd: {hoveredPoint.speed !== null ? hoveredPoint.speed.toFixed(1) : '-'}m/s</span>
                                    <span style={{ color: '#ef4444' }}>Bat: {hoveredPoint.battery !== null ? hoveredPoint.battery.toFixed(1) : '-'}V</span>
                                </div> 
                            )}
                        </div>

                        <div style={{ background: anomalies.length > 0 ? '#fef2f2' : '#f0fdf4', border: anomalies.length > 0 ? '1px solid #f87171' : '1px solid #86efac', borderRadius: '12px', padding: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setIsReportOpen(!isReportOpen)}>
                                <h3 style={{ margin: 0, color: anomalies.length > 0 ? '#b91c1c' : '#166534', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><AlertOctagon size={20} /> Post-Flight Report</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {telemetryData.length > 0 && (
                                        <button onClick={handleExportPDF} disabled={isExporting} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '6px', cursor: isExporting ? 'wait' : 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <Download size={14} /> {isExporting ? 'Exporting...' : 'Export PDF'}
                                        </button>
                                    )}
                                    {anomalies.length > 0 && ( <button onClick={(e) => { e.stopPropagation(); setShowTips(true); }} style={{ background: '#fef08a', color: '#854d0e', border: '1px solid #fde047', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}><Lightbulb size={14} /> Get Tips</button> )}
                                    {isReportOpen ? <ChevronUp size={20} color="#64748b"/> : <ChevronDown size={20} color="#64748b"/>}
                                </div>
                            </div>
                            {isReportOpen && ( <div style={{ marginTop: '15px' }}>{anomalies.length === 0 ? ( <p style={{ color: '#166534', margin: 0, fontSize: '14px' }}>Waiting for log data or no anomalies detected.</p> ) : ( <ul style={{ color: '#991b1b', margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: '1.5' }}>{anomalies.map((a, i) => ( <li key={i} onMouseEnter={() => { const point = telemetryData.find(d => d.time === a.time); if (point) setHoveredPoint(point); }} onMouseLeave={() => setHoveredPoint(null)} style={{ marginBottom: '4px', background: hoveredPoint?.time === a.time ? '#fef08a' : 'transparent', transition: 'background 0.2s', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' }}>{a.text}</li> ))}</ul> )}</div> )}
                        </div>

                        {/* Динамічні графіки */}
                        <div style={{ background: 'white', borderRadius: '12px', padding: '15px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}><Activity size={20}/> Telemetry Analysis (Interactive)</h3>
                            </div>
                            
                            {telemetryData.length > 0 ? (
                                activeMetrics.map(metric => (
                                    <MetricChart key={metric.key} metric={metric} data={telemetryData} hoveredPoint={hoveredPoint} setHoveredPoint={setHoveredPoint} isPdfMode={isPdfMode} />
                                ))
                            ) : (
                                <div style={{ height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '14px', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
                                    Upload a CSV log to view dynamic charts
                                </div>
                            )}
                        </div>

                        {!isPdfMode && (
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
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' };
const buttonStyle = { padding: '10px 16px', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s' };
const miniButtonStyle = { padding: '4px 10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' };
const waypointCardStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' };
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(2px)' };
const modalContentStyle = { background: 'white', padding: '30px', borderRadius: '16px', width: '600px', maxWidth: '90%', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', maxHeight: '90vh', overflowY: 'auto' };

export default Logbook;
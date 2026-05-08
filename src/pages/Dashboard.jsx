import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { 
    LayoutDashboard, Target, Map as MapIcon, Activity, 
    TrendingUp, Clock, Navigation, Calendar as CalendarIcon,
    ChevronDown, ChevronUp, Send, Plane, AlertOctagon, Download,
    List, BarChart2
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, zoomPlugin);

// === КОНФІГ ДИНАМІЧНИХ ГРАФІКІВ ДАШБОРДА ===
const DASHBOARD_METRICS = [
    { id: 'distance', label: 'Flown Distance', unit: 'km', color: '#f59e0b', icon: <Navigation size={16}/> },
    { id: 'time', label: 'Flight Time', unit: 'hrs', color: '#0284c7', icon: <Clock size={16}/> },
    { id: 'errors', label: 'Critical Incidents', unit: 'Incidents', color: '#ef4444', icon: <AlertOctagon size={16}/> },
    { id: 'logs', label: 'Analyzed Flights', unit: 'Flights', color: '#8b5cf6', icon: <Activity size={16}/> },
    { id: 'missions', label: 'Planned Missions', unit: 'Missions', color: '#10b981', icon: <MapIcon size={16}/> },
];

// === КОМПОНЕНТ ОКРЕМОГО ГРАФІКА ===
const DashboardChart = ({ metric, labels, data, isPdfMode }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [showTable, setShowTable] = useState(false);
    const chartRef = useRef(null);

    useEffect(() => {
        if (isPdfMode) { setIsExpanded(true); setShowTable(false); }
    }, [isPdfMode]);

    const chartData = {
        labels,
        datasets: [{
            label: `${metric.label} (${metric.unit})`,
            data,
            borderColor: metric.color,
            backgroundColor: `${metric.color}33`,
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 6
        }]
    };

    const chartOptions = {
        responsive: true, maintainAspectRatio: false, animation: !isPdfMode,
        plugins: {
            legend: { display: false },
            zoom: {
                pan: { enabled: true, mode: 'x' },
                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
            }
        },
        scales: {
            x: { ticks: { maxTicksLimit: 10 } },
            y: { beginAtZero: true, title: { display: true, text: `${metric.label} (${metric.unit})` }, ticks: { precision: 0 } }
        }
    };

    // Не малюємо графік, якщо всі дані нульові (щоб не засмічувати інтерфейс)
    const totalSum = data.reduce((acc, val) => acc + val, 0);
    if (totalSum === 0 && !isPdfMode) return null; 

    return (
        <div className={isPdfMode ? "pdf-block" : ""} style={{ background: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '15px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', color: metric.color }}>
                    {metric.icon} {metric.label} Over Time
                </h3>
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
                                        <th style={{ padding: '10px 12px', color: '#475569' }}>Date</th>
                                        <th style={{ padding: '10px 12px', color: metric.color }}>{metric.label} ({metric.unit})</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {labels.map((date, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '8px 12px', color: '#64748b' }}>{date}</td>
                                            <td style={{ padding: '8px 12px', fontWeight: '500' }}>{data[i] !== 0 ? data[i] : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ height: '220px', position: 'relative' }}>
                            <Line ref={chartRef} data={chartData} options={chartOptions} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

function Dashboard({ profile }) {
    const navigate = useNavigate(); 
    const [timeRange, setTimeRange] = useState('week'); 
    
    const [stats, setStats] = useState({
        dronesCount: 0,
        missionsCount: 0,
        logsCount: 0,
        totalActualDistance: 0,
        totalFlightTime: 0,
        totalAnomalies: 0
    });
    
    const [chartLogs, setChartLogs] = useState([]); 
    const [chartMissions, setChartMissions] = useState([]);
    const [activeDrones, setActiveDrones] = useState([]);
    const [recentLogs, setRecentLogs] = useState([]);
    const [recentMissions, setRecentMissions] = useState([]);
    const [loading, setLoading] = useState(true);

    const [isLogsOpen, setIsLogsOpen] = useState(true);
    const [isMissionsOpen, setIsMissionsOpen] = useState(true);

    const [isExporting, setIsExporting] = useState(false);
    const [isPdfMode, setIsPdfMode] = useState(false);

    useEffect(() => {
        if (profile?.company_id) {
            fetchDashboardData();
        }
    }, [profile, timeRange]); 

    useEffect(() => {
        if (isPdfMode) {
            setIsLogsOpen(true);
            setIsMissionsOpen(true);
        }
    }, [isPdfMode]);

    const fetchDashboardData = async () => {
        setLoading(true);
        
        let startDate = null;
        const date = new Date();
        if (timeRange === 'week') date.setDate(date.getDate() - 7);
        else if (timeRange === 'month') date.setMonth(date.getMonth() - 1);
        else if (timeRange === 'year') date.setFullYear(date.getFullYear() - 1);
        
        if (timeRange !== 'all') {
            startDate = date.toISOString();
        }

        let allowedDroneIds = null;
        if (profile.role !== 'admin') {
            const { data: accessData } = await supabase.from('drone_access').select('drone_id').eq('user_id', profile.id);
            allowedDroneIds = accessData ? accessData.map(a => a.drone_id) : [];
        }

        let dronesReq = supabase.from('drones').select('id, name, model');
        let missionsReq = supabase.from('missions').select('id, name, total_distance, created_at, drone_id');
        let logsReq = supabase.from('flight_logs').select('id, name, actual_distance, flight_time, anomalies_count, created_at, drone_id, mission_id, missions(name)'); 

        if (profile.role !== 'admin') {
            dronesReq = dronesReq.in('id', allowedDroneIds || []);
            missionsReq = missionsReq.in('drone_id', allowedDroneIds || []);
            logsReq = logsReq.in('drone_id', allowedDroneIds || []);
        }

        if (startDate) {
            missionsReq = missionsReq.gte('created_at', startDate);
            logsReq = logsReq.gte('created_at', startDate);
        }

        const [drones, missions, logs] = await Promise.all([dronesReq, missionsReq, logsReq]);

        const totalActualDist = logs.data?.reduce((acc, curr) => acc + (curr.actual_distance || 0), 0) || 0;
        const totalTimeSeconds = logs.data?.reduce((acc, curr) => acc + (curr.flight_time || 0), 0) || 0;
        const totalErrors = logs.data?.reduce((acc, curr) => acc + (curr.anomalies_count || 0), 0) || 0;

        setStats({
            dronesCount: drones.data?.length || 0,
            missionsCount: missions.data?.length || 0,
            logsCount: logs.data?.length || 0,
            totalActualDistance: totalActualDist,
            totalFlightTime: totalTimeSeconds,
            totalAnomalies: totalErrors
        });

        const sortedLogs = [...(logs.data || [])].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
        const sortedMissions = [...(missions.data || [])].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

        const droneStatsMap = {};
        (drones.data || []).forEach(d => { 
            droneStatsMap[d.id] = { ...d, plannedDist: 0, flownDist: 0, logsCount: 0, flightTime: 0, errors: 0 }; 
        });
        
        (missions.data || []).forEach(m => {
            if (droneStatsMap[m.drone_id]) droneStatsMap[m.drone_id].plannedDist += (m.total_distance || 0);
        });

        (logs.data || []).forEach(l => {
            if (droneStatsMap[l.drone_id]) {
                droneStatsMap[l.drone_id].flownDist += (l.actual_distance || 0);
                droneStatsMap[l.drone_id].flightTime += (l.flight_time || 0);
                droneStatsMap[l.drone_id].errors += (l.anomalies_count || 0);
                droneStatsMap[l.drone_id].logsCount += 1;
            }
        });
        
        const activeFleet = Object.values(droneStatsMap)
            .filter(d => d.logsCount > 0 || d.plannedDist > 0)
            .sort((a,b) => b.flownDist - a.flownDist);

        setChartLogs(logs.data || []);
        setChartMissions(missions.data || []);
        setRecentLogs(sortedLogs);
        setRecentMissions(sortedMissions);
        setActiveDrones(activeFleet);
        setLoading(false);
    };

    const formatHours = (seconds) => {
        return (seconds / 3600).toFixed(2);
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

                    const fileNameDate = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
                    pdf.save(`Fleet-Dashboard-Report-${fileNameDate}.pdf`);
                } catch (error) {
                    console.error("PDF Export failed:", error); 
                    alert("Failed to generate PDF. Make sure all charts are loaded.");
                }
                
                setIsPdfMode(false); 
                setIsExporting(false);
                setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
            }, 1500); 
        }, 100);
    };

    // === ФОРМУВАННЯ АГРЕГОВАНИХ ДАНИХ ДЛЯ КОЖНОЇ МЕТРИКИ ===
    const aggregatedData = useMemo(() => {
        const labels = [];
        const dataMap = { logs: [], missions: [], distance: [], errors: [], time: [] };
        
        if (timeRange === 'week' || timeRange === 'month') {
            const daysToShow = timeRange === 'week' ? 7 : 30;
            for (let i = daysToShow - 1; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                labels.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }));
                Object.keys(dataMap).forEach(k => dataMap[k].push(0));
            }

            chartLogs.forEach(item => {
                const dateStr = new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
                const index = labels.indexOf(dateStr);
                if (index !== -1) { 
                    dataMap.logs[index] += 1; 
                    dataMap.distance[index] += (item.actual_distance || 0); 
                    dataMap.errors[index] += (item.anomalies_count || 0); 
                    dataMap.time[index] += (item.flight_time || 0);
                }
            });

            chartMissions.forEach(item => {
                const dateStr = new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
                const index = labels.indexOf(dateStr);
                if (index !== -1) dataMap.missions[index] += 1;
            });

        } else {
            for (let i = 11; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                labels.push(d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })); 
                Object.keys(dataMap).forEach(k => dataMap[k].push(0));
            }

            chartLogs.forEach(item => {
                const dateStr = new Date(item.created_at).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
                const index = labels.indexOf(dateStr);
                if (index !== -1) { 
                    dataMap.logs[index] += 1; 
                    dataMap.distance[index] += (item.actual_distance || 0); 
                    dataMap.errors[index] += (item.anomalies_count || 0); 
                    dataMap.time[index] += (item.flight_time || 0);
                }
            });

            chartMissions.forEach(item => {
                const dateStr = new Date(item.created_at).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
                const index = labels.indexOf(dateStr);
                if (index !== -1) dataMap.missions[index] += 1;
            });
        }

        // Конвертація після агрегації
        dataMap.distance = dataMap.distance.map(d => parseFloat((d / 1000).toFixed(2)));
        dataMap.time = dataMap.time.map(t => parseFloat(formatHours(t)));

        return { labels, dataMap };
    }, [chartLogs, chartMissions, timeRange]);

    if (loading) return <div style={{ color: '#64748b', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>Calculating fleet statistics...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', position: 'relative' }}>
            <header className="pdf-block" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', background: isPdfMode ? 'white' : 'transparent', padding: isPdfMode ? '20px' : '0', borderRadius: '12px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '28px', color: '#0f172a' }}>Fleet Overview</h1>
                    <p style={{ color: '#64748b', margin: '5px 0 0 0' }}>Welcome back. Here is what's happening with your drones.</p>
                </div>
                
                <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'white', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <CalendarIcon size={16} color="#64748b" />
                        <select 
                            value={timeRange} 
                            onChange={(e) => setTimeRange(e.target.value)}
                            style={{ border: 'none', outline: 'none', background: 'transparent', color: '#0f172a', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
                            disabled={isExporting}
                        >
                            <option value="week">Last 7 Days</option>
                            <option value="month">Last 30 Days</option>
                            <option value="year">This Year</option>
                            <option value="all">All Time</option>
                        </select>
                    </div>
                    
                    {!isPdfMode && (
                        <button onClick={handleExportPDF} disabled={isExporting} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: isExporting ? 'wait' : 'pointer', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <Download size={16} /> {isExporting ? 'Exporting...' : 'Export PDF Report'}
                        </button>
                    )}
                </div>
            </header>

            <div className="pdf-block" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                <StatCard icon={<Target color="#3b82f6"/>} title={profile.role === 'admin' ? "Total Fleet" : "Assigned Drones"} value={stats.dronesCount} unit="Units" onClick={() => navigate('/drones')} />
                <StatCard icon={<MapIcon color="#10b981"/>} title="Planned Routes" value={stats.missionsCount} unit="Missions" onClick={() => navigate('/missions')} />
                <StatCard icon={<Activity color="#8b5cf6"/>} title="Analyzed Logs" value={stats.logsCount} unit="Flights" onClick={() => navigate('/logbook')} />
                <StatCard icon={<Navigation color="#f59e0b"/>} title="Flown Distance" value={(stats.totalActualDistance / 1000).toFixed(1)} unit="Kilometers" onClick={() => navigate('/logbook')} />
                <StatCard icon={<Clock color="#0284c7"/>} title="Total Flight Time" value={formatHours(stats.totalFlightTime)} unit="Hours" onClick={() => navigate('/logbook')} />
                <StatCard icon={<AlertOctagon color="#ef4444"/>} title="Critical Incidents" value={stats.totalAnomalies} unit="Errors" onClick={() => navigate('/logbook')} borderColor="#ef4444" />
            </div>

            <div style={{ display: 'flex', flexDirection: isPdfMode ? 'column' : 'row', gap: '20px', alignItems: 'flex-start' }}>
                
                {/* ЛІВА КОЛОНКА (ГРАФІКИ) */}
                <div style={{ flex: isPdfMode ? 'none' : 2, width: '100%', display: 'flex', flexDirection: 'column' }}>
                    
                    <h2 className="pdf-block" style={{ margin: '0 0 15px 0', fontSize: '20px', color: '#334155' }}>Activity Charts</h2>
                    
                    {DASHBOARD_METRICS.map(metric => (
                        <DashboardChart 
                            key={metric.id}
                            metric={metric} 
                            labels={aggregatedData.labels} 
                            data={aggregatedData.dataMap[metric.id]} 
                            isPdfMode={isPdfMode}
                        />
                    ))}

                    <div className="pdf-block" style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Plane size={20} color="#f59e0b" /> Active Fleet Performance
                        </h3>
                        {activeDrones.length === 0 ? (
                            <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>No drones were active in this period.</p>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                                {activeDrones.map(drone => (
                                    <div 
                                        key={drone.id} 
                                        onClick={() => !isPdfMode && navigate(`/drones?drone=${drone.id}`)}
                                        style={{ padding: '15px', background: '#f8fafc', border: drone.errors > 0 ? '1px solid #fca5a5' : '1px solid #e2e8f0', borderRadius: '10px', cursor: isPdfMode ? 'default' : 'pointer', transition: 'border-color 0.2s' }}
                                        onMouseOver={(e) => !isPdfMode && (e.currentTarget.style.borderColor = drone.errors > 0 ? '#ef4444' : '#f59e0b')}
                                        onMouseOut={(e) => !isPdfMode && (e.currentTarget.style.borderColor = drone.errors > 0 ? '#fca5a5' : '#e2e8f0')}
                                    >
                                        <div style={{ fontWeight: 'bold', color: '#0f172a', display: 'flex', justifyContent: 'space-between' }}>
                                            {drone.name}
                                            {drone.errors > 0 && <span style={{fontSize: '11px', color: '#ef4444', background: '#fef2f2', padding: '2px 6px', borderRadius: '8px'}}>{drone.errors} Errors</span>}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#3b82f6', marginBottom: '8px' }}>{drone.model}</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#64748b' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span>Planned:</span> <strong>{(drone.plannedDist / 1000).toFixed(1)} km</strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span>Flown:</span> <strong style={{ color: '#f59e0b' }}>{(drone.flownDist / 1000).toFixed(1)} km</strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed #cbd5e1' }}>
                                                <span>Time:</span> <strong>{formatHours(drone.flightTime)} hrs</strong>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ПРАВА КОЛОНКА (ІСТОРІЯ) */}
                <div style={{ flex: isPdfMode ? 'none' : 1, width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    <div className="pdf-block" style={{ background: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                        <div 
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: isLogsOpen ? '15px' : '0' }}
                            onClick={() => setIsLogsOpen(!isLogsOpen)}
                        >
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '16px' }}>
                                <Clock size={18} color="#8b5cf6" /> Recent Analysis
                            </h3>
                            {isLogsOpen ? <ChevronUp size={18} color="#64748b"/> : <ChevronDown size={18} color="#64748b"/>}
                        </div>
                        
                        {isLogsOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {recentLogs.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>No flights recorded yet.</p> : 
                                    recentLogs.map(log => (
                                        <div 
                                            key={log.id} 
                                            onClick={() => !isPdfMode && navigate(`/logbook?mission=${log.mission_id}`)}
                                            style={{ padding: '12px', background: log.anomalies_count > 0 ? '#fef2f2' : '#f8fafc', borderRadius: '10px', border: log.anomalies_count > 0 ? '1px solid #fca5a5' : '1px solid #e2e8f0', cursor: isPdfMode ? 'default' : 'pointer', transition: 'border-color 0.2s' }}
                                            onMouseOver={(e) => !isPdfMode && (e.currentTarget.style.borderColor = log.anomalies_count > 0 ? '#ef4444' : '#8b5cf6')}
                                            onMouseOut={(e) => !isPdfMode && (e.currentTarget.style.borderColor = log.anomalies_count > 0 ? '#fca5a5' : '#e2e8f0')}
                                        >
                                            <div style={{ fontWeight: 'bold', fontSize: '13px', color: log.anomalies_count > 0 ? '#b91c1c' : '#0f172a', display: 'flex', justifyContent: 'space-between' }}>
                                                {log.name || 'Unnamed Analysis'}
                                                {log.anomalies_count > 0 && <AlertOctagon size={14} color="#ef4444"/>}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                                <span>{(log.actual_distance / 1000).toFixed(1)} km flown</span>
                                                <span>{new Date(log.created_at).toLocaleDateString('en-GB')}</span>
                                            </div>
                                        </div>
                                    ))
                                }
                            </div>
                        )}
                    </div>

                    <div className="pdf-block" style={{ background: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                        <div 
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: isMissionsOpen ? '15px' : '0' }}
                            onClick={() => setIsMissionsOpen(!isMissionsOpen)}
                        >
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '16px' }}>
                                <Send size={18} color="#10b981" /> Recent Missions
                            </h3>
                            {isMissionsOpen ? <ChevronUp size={18} color="#64748b"/> : <ChevronDown size={18} color="#64748b"/>}
                        </div>
                        
                        {isMissionsOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {recentMissions.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>No missions planned yet.</p> : 
                                    recentMissions.map(mission => (
                                        <div 
                                            key={mission.id} 
                                            onClick={() => !isPdfMode && navigate(`/missions?loadMissionId=${mission.id}`)}
                                            style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', cursor: isPdfMode ? 'default' : 'pointer', transition: 'border-color 0.2s' }}
                                            onMouseOver={(e) => !isPdfMode && (e.currentTarget.style.borderColor = '#10b981')}
                                            onMouseOut={(e) => !isPdfMode && (e.currentTarget.style.borderColor = '#e2e8f0')}
                                        >
                                            <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#0f172a' }}>{mission.name}</div>
                                            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                                                <span>Plan: {(mission.total_distance / 1000).toFixed(1)} km</span>
                                                <span>{new Date(mission.created_at).toLocaleDateString('en-GB')}</span>
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

const StatCard = ({ icon, title, value, unit, onClick, borderColor }) => (
    <div 
        onClick={onClick}
        style={{ background: 'white', padding: '24px', borderRadius: '16px', borderLeft: borderColor ? `4px solid ${borderColor}` : 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', display: 'flex', alignItems: 'center', gap: '20px', cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
        onMouseOver={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 15px -3px rgb(0 0 0 / 0.1)'; }}
        onMouseOut={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)'; }}
    >
        <div style={{ background: borderColor ? '#fef2f2' : '#f1f5f9', padding: '12px', borderRadius: '12px' }}>{icon}</div>
        <div>
            <div style={{ fontSize: '14px', color: borderColor ? borderColor : '#64748b', fontWeight: 'bold' }}>{title}</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a' }}>{value} <span style={{ fontSize: '14px', fontWeight: '400', color: '#94a3b8' }}>{unit}</span></div>
        </div>
    </div>
);

export default Dashboard;
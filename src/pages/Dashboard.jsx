import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { 
    LayoutDashboard, Target, Map as MapIcon, Activity, 
    TrendingUp, Clock, Navigation, Calendar as CalendarIcon,
    ChevronDown, ChevronUp, Send, Plane, AlertOctagon, Download,
    List, BarChart2, Filter, ShieldCheck, Battery, Zap, Satellite, Wifi, Search
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, zoomPlugin);

// === НОВИЙ ВІДЖЕТ IoT РЕАЛЬНОГО ЧАСУ ===
const LiveTrackerWidget = () => {
    const [liveData, setLiveData] = useState(null);
    const [isOnline, setIsOnline] = useState(false);

    useEffect(() => {
        const channel = supabase.channel('drone_live_telemetry');

        channel
            .on('broadcast', { event: 'live_data' }, (message) => {
                setLiveData(message.payload);
                setIsOnline(true);
            })
            .subscribe();

        // Таймер для перевірки статусу (якщо 3 секунди немає даних - офлайн)
        const timer = setInterval(() => {
            setIsOnline(false);
        }, 3000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(timer);
        };
    }, []);

    return (
        <div className="pdf-block" style={{ background: isOnline ? '#ecfdf5' : '#f8fafc', padding: '20px', borderRadius: '16px', border: isOnline ? '2px solid #34d399' : '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', marginBottom: '20px', transition: 'all 0.3s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', color: isOnline ? '#059669' : '#64748b' }}>
                    <Wifi size={18} className={isOnline ? "animate-pulse" : ""} /> 
                    Live IoT Telemetry {isOnline ? "(ONLINE)" : "(WAITING FOR CONNECTION...)"}
                </h3>
            </div>

            {isOnline && liveData ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '15px' }}>
                    <div style={{ background: 'white', padding: '12px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}><Battery size={14} color="#ef4444"/> Battery</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>{liveData.battery.toFixed(1)} V</div>
                    </div>
                    <div style={{ background: 'white', padding: '12px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}><Zap size={14} color="#f59e0b"/> Air Speed</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>{liveData.speed} m/s</div>
                    </div>
                    <div style={{ background: 'white', padding: '12px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}><Navigation size={14} color="#3b82f6"/> Altitude</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>{liveData.alt.toFixed(1)} m</div>
                    </div>
                    <div style={{ background: 'white', padding: '12px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}><Satellite size={14} color="#8b5cf6"/> GPS Sats</div>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a' }}>{liveData.sats}</div>
                    </div>
                </div>
            ) : (
                <div style={{ fontSize: '14px', color: '#94a3b8' }}>
                    Start the edge processor (fly.py) on your drone to begin live broadcasting to the dashboard.
                </div>
            )}
            <style>{`
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
                .animate-pulse { animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
            `}</style>
        </div>
    );
};
// === КІНЕЦЬ ВІДЖЕТА IoT ===

const DASHBOARD_METRICS = [
    { id: 'distance', label: 'Flown Distance', unit: 'km', color: '#f59e0b', icon: <Navigation size={16}/> },
    { id: 'time', label: 'Flight Time', unit: 'hrs', color: '#0284c7', icon: <Clock size={16}/> },
    { id: 'errors', label: 'Critical Incidents', unit: 'Incidents', color: '#ef4444', icon: <AlertOctagon size={16}/> },
    { id: 'logs', label: 'Analyzed Flights', unit: 'Flights', color: '#8b5cf6', icon: <Activity size={16}/> },
    { id: 'missions', label: 'Planned Missions', unit: 'Missions', color: '#10b981', icon: <MapIcon size={16}/> },
];

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
    
    // === СТЕЙТ ДЛЯ ФІЛЬТРАЦІЇ ПО ДРОНУ ===
    const [selectedDroneId, setSelectedDroneId] = useState('all');
    const [allAvailableDrones, setAllAvailableDrones] = useState([]);
    
    // === ПОШУК ДЛЯ АВТОПАРКУ ===
    const [fleetSearchQuery, setFleetSearchQuery] = useState('');

    const [stats, setStats] = useState({
        dronesCount: 0, missionsCount: 0, logsCount: 0, totalActualDistance: 0, totalFlightTime: 0, totalAnomalies: 0
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

    const activeFleetRef = useRef(null);
    const recentAnalysisRef = useRef(null);
    const [highlightedDroneId, setHighlightedDroneId] = useState(null);
    const [highlightedLogId, setHighlightedLogId] = useState(null);

    // Генеруємо список останніх 12 місяців для фільтру
    const monthOptions = useMemo(() => {
        const options = [];
        const d = new Date();
        for (let i = 0; i < 12; i++) {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            options.push({
                value: `${year}-${month}`,
                label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
            });
            d.setMonth(d.getMonth() - 1);
        }
        return options;
    }, []);

    // Завантажуємо базовий список дронів ОДИН раз при старті
    useEffect(() => {
        if (profile?.company_id) {
            fetchBaseDronesList();
        }
    }, [profile]);

    const fetchBaseDronesList = async () => {
        let dronesReq = supabase.from('drones').select('id, name, model');
        if (profile.role !== 'admin') {
            const { data: accessData } = await supabase.from('drone_access').select('drone_id').eq('user_id', profile.id);
            const allowedIds = accessData ? accessData.map(a => a.drone_id) : [];
            dronesReq = dronesReq.in('id', allowedIds);
        }
        const { data } = await dronesReq;
        if (data) setAllAvailableDrones(data);
    };

    useEffect(() => {
        if (profile?.company_id) {
            fetchDashboardData();
        }
    }, [profile, timeRange, selectedDroneId]);

    useEffect(() => {
        if (isPdfMode) {
            setIsLogsOpen(true);
            setIsMissionsOpen(true);
        }
    }, [isPdfMode]);

    const fetchDashboardData = async () => {
        setLoading(true);
        
        let startDate = null;
        let endDate = null;
        const date = new Date();

        // Перевіряємо вибраний діапазон часу
        if (timeRange === 'week') {
            date.setDate(date.getDate() - 7);
            startDate = date.toISOString();
        } else if (timeRange === 'month') {
            date.setMonth(date.getMonth() - 1);
            startDate = date.toISOString();
        } else if (timeRange === 'year') {
            date.setFullYear(date.getFullYear() - 1);
            startDate = date.toISOString();
        } else if (timeRange.match(/^\d{4}-\d{2}$/)) { 
            // Якщо вибрано конкретний місяць (напр. '2026-05')
            const [y, m] = timeRange.split('-');
            startDate = new Date(y, m - 1, 1).toISOString();
            endDate = new Date(y, m, 0, 23, 59, 59, 999).toISOString();
        }

        let allowedDroneIds = null;
        if (profile.role !== 'admin') {
            const { data: accessData } = await supabase.from('drone_access').select('drone_id').eq('user_id', profile.id);
            allowedDroneIds = accessData ? accessData.map(a => a.drone_id) : [];
        }

        let missionsReq = supabase.from('missions').select('id, name, total_distance, created_at, drone_id');
        let logsReq = supabase.from('flight_logs').select('id, name, actual_distance, flight_time, anomalies_count, created_at, drone_id, mission_id, missions(name)'); 

        if (profile.role !== 'admin') {
            missionsReq = missionsReq.in('drone_id', allowedDroneIds || []);
            logsReq = logsReq.in('drone_id', allowedDroneIds || []);
        }

        if (selectedDroneId !== 'all') {
            missionsReq = missionsReq.eq('drone_id', selectedDroneId);
            logsReq = logsReq.eq('drone_id', selectedDroneId);
        }

        if (startDate) {
            missionsReq = missionsReq.gte('created_at', startDate);
            logsReq = logsReq.gte('created_at', startDate);
        }
        if (endDate) {
            missionsReq = missionsReq.lte('created_at', endDate);
            logsReq = logsReq.lte('created_at', endDate);
        }

        const [missions, logs] = await Promise.all([missionsReq, logsReq]);

        const totalActualDist = logs.data?.reduce((acc, curr) => acc + (curr.actual_distance || 0), 0) || 0;
        const totalTimeSeconds = logs.data?.reduce((acc, curr) => acc + (curr.flight_time || 0), 0) || 0;
        const totalErrors = logs.data?.reduce((acc, curr) => acc + (curr.anomalies_count || 0), 0) || 0;

        setStats({
            dronesCount: selectedDroneId === 'all' ? allAvailableDrones.length : 1,
            missionsCount: missions.data?.length || 0,
            logsCount: logs.data?.length || 0,
            totalActualDistance: totalActualDist,
            totalFlightTime: totalTimeSeconds,
            totalAnomalies: totalErrors
        });

        const sortedLogs = [...(logs.data || [])].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
        const sortedMissions = [...(missions.data || [])].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);

        if (selectedDroneId === 'all') {
            const droneStatsMap = {};
            allAvailableDrones.forEach(d => { 
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
            
            setActiveDrones(activeFleet);
        }

        setChartLogs(logs.data || []);
        setChartMissions(missions.data || []);
        setRecentLogs(sortedLogs);
        setRecentMissions(sortedMissions);
        setLoading(false);
    };

    const formatHours = (seconds) => {
        return (seconds / 3600).toFixed(2);
    };

    const handleTopDroneClick = () => {
        if (activeDrones.length > 0 && !isPdfMode && selectedDroneId === 'all') {
            activeFleetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setHighlightedDroneId(activeDrones[0].id);
            setTimeout(() => setHighlightedDroneId(null), 3000);
        }
    };

    const handleCriticalLogClick = () => {
        if (!isPdfMode) {
            const worstFlight = [...chartLogs].sort((a,b) => b.anomalies_count - a.anomalies_count)[0];
            if (worstFlight && worstFlight.anomalies_count > 0) {
                if (!recentLogs.find(l => l.id === worstFlight.id)) {
                    setRecentLogs(prev => [worstFlight, ...prev].slice(0, 6));
                }
                
                setIsLogsOpen(true); 
                setTimeout(() => {
                    recentAnalysisRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setHighlightedLogId(worstFlight.id);
                    setTimeout(() => setHighlightedLogId(null), 3000);
                }, 100);
            }
        }
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

                    const droneName = selectedDroneId !== 'all' ? allAvailableDrones.find(d => d.id === parseInt(selectedDroneId))?.name.replace(/\s+/g, '-') : 'Fleet';
                    const fileNameDate = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
                    pdf.save(`${droneName}-Dashboard-Report-${fileNameDate}.pdf`);
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

    const aggregatedData = useMemo(() => {
        const labels = [];
        const dataMap = { logs: [], missions: [], distance: [], errors: [], time: [] };
        
        let isDaily = timeRange === 'week' || timeRange === 'month' || timeRange.match(/^\d{4}-\d{2}$/);
        
        if (isDaily) {
            let daysToShow = timeRange === 'week' ? 7 : 30;
            let baseDate = new Date();

            // Якщо вибрано специфічний місяць, налаштовуємо базу для днів
            if (timeRange.match(/^\d{4}-\d{2}$/)) {
                const [y, m] = timeRange.split('-');
                baseDate = new Date(y, m, 0); // Останній день вибраного місяця
                daysToShow = baseDate.getDate(); // Кількість днів у цьому місяці
                
                // Якщо це поточний місяць, не показуємо дні з майбутнього
                const today = new Date();
                if (today.getFullYear() == y && today.getMonth() + 1 == m) {
                    baseDate = today;
                    daysToShow = today.getDate();
                }
            }

            for (let i = daysToShow - 1; i >= 0; i--) {
                const d = new Date(baseDate);
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
            // Для "This Year" та "All Time" розбиваємо по місяцях
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

        dataMap.distance = dataMap.distance.map(d => parseFloat((d / 1000).toFixed(2)));
        dataMap.time = dataMap.time.map(t => parseFloat(formatHours(t)));

        return { labels, dataMap };
    }, [chartLogs, chartMissions, timeRange]);

    const activeSelectedDroneInfo = selectedDroneId !== 'all' ? allAvailableDrones.find(d => d.id === parseInt(selectedDroneId)) : null;

    // Фільтруємо дрони за пошуком
    const filteredActiveDrones = activeDrones.filter(d => 
        d.name.toLowerCase().includes(fleetSearchQuery.toLowerCase()) || 
        d.model.toLowerCase().includes(fleetSearchQuery.toLowerCase())
    );

    if (loading) return <div style={{ color: '#64748b', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>Calculating fleet statistics...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', position: 'relative' }}>
            <header className="pdf-block" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', background: isPdfMode ? 'white' : 'transparent', padding: isPdfMode ? '20px' : '0', borderRadius: '12px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '28px', color: '#0f172a' }}>
                        {selectedDroneId === 'all' ? 'Fleet Overview' : `Analytics: ${activeSelectedDroneInfo?.name}`}
                    </h1>
                    <p style={{ color: '#64748b', margin: '5px 0 0 0' }}>
                        {selectedDroneId === 'all' ? "Welcome back. Here is what's happening with your entire fleet." : `Viewing detailed history and performance for ${activeSelectedDroneInfo?.model}.`}
                    </p>
                </div>
                
                <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'white', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <Filter size={16} color="#3b82f6" />
                        <select 
                            value={selectedDroneId} 
                            onChange={(e) => setSelectedDroneId(e.target.value)}
                            style={{ border: 'none', outline: 'none', background: 'transparent', color: '#3b82f6', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
                            disabled={isExporting}
                        >
                            <option value="all">All Fleet</option>
                            {allAvailableDrones.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'white', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <CalendarIcon size={16} color="#64748b" />
                        <select 
                            value={timeRange} 
                            onChange={(e) => setTimeRange(e.target.value)}
                            style={{ border: 'none', outline: 'none', background: 'transparent', color: '#0f172a', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
                            disabled={isExporting}
                        >
                            <optgroup label="Rolling Periods">
                                <option value="week">Last 7 Days</option>
                                <option value="month">Last 30 Days</option>
                                <option value="year">This Year</option>
                                <option value="all">All Time</option>
                            </optgroup>
                            <optgroup label="Specific Months">
                                {monthOptions.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </optgroup>
                        </select>
                    </div>
                    
                    {!isPdfMode && (
                        <button onClick={handleExportPDF} disabled={isExporting} style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: isExporting ? 'wait' : 'pointer', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                            <Download size={16} /> {isExporting ? 'Exporting...' : 'Export Report'}
                        </button>
                    )}
                </div>
            </header>

            <div className="pdf-block" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                <StatCard icon={<Target color="#3b82f6"/>} title={profile.role === 'admin' ? "Total Fleet" : "Assigned Drones"} value={stats.dronesCount} unit={selectedDroneId === 'all' ? "Units" : "Unit"} onClick={() => navigate('/drones')} />
                <StatCard icon={<MapIcon color="#10b981"/>} title="Planned Routes" value={stats.missionsCount} unit="Missions" onClick={() => navigate(selectedDroneId === 'all' ? '/missions' : `/missions?drone=${selectedDroneId}`)} />
                <StatCard icon={<Activity color="#8b5cf6"/>} title="Analyzed Logs" value={stats.logsCount} unit="Flights" onClick={() => navigate(selectedDroneId === 'all' ? '/logbook' : `/logbook?drone=${selectedDroneId}`)} />
                <StatCard icon={<Navigation color="#f59e0b"/>} title="Flown Distance" value={(stats.totalActualDistance / 1000).toFixed(1)} unit="Kilometers" onClick={() => navigate('/logbook')} />
                <StatCard icon={<Clock color="#0284c7"/>} title="Total Flight Time" value={formatHours(stats.totalFlightTime)} unit="Hours" onClick={() => navigate('/logbook')} />
                <StatCard icon={<AlertOctagon color="#ef4444"/>} title="Critical Incidents" value={stats.totalAnomalies} unit="Errors" onClick={() => navigate('/logbook')} borderColor="#ef4444" />
            </div>

            <div className="pdf-block" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                {selectedDroneId === 'all' ? (
                    <div 
                        onClick={handleTopDroneClick}
                        style={{ background: 'white', padding: '20px', borderRadius: '16px', borderLeft: '4px solid #10b981', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', cursor: activeDrones.length > 0 && !isPdfMode ? 'pointer' : 'default', transition: 'transform 0.2s', ...(!isPdfMode && activeDrones.length > 0 && { ':hover': { transform: 'translateY(-2px)' } }) }}
                    >
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <TrendingUp size={16} color="#10b981"/> Top Performing Drone
                        </h3>
                        {activeDrones.length > 0 ? (
                            <div>
                                <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a' }}>{activeDrones[0].name}</div>
                                <div style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
                                    Leader of the period with <strong style={{color: '#0f172a'}}>{(activeDrones[0].flownDist / 1000).toFixed(1)} km</strong> flown across <strong style={{color: '#0f172a'}}>{activeDrones[0].logsCount}</strong> missions.
                                </div>
                            </div>
                        ) : (
                            <span style={{ color: '#94a3b8', fontSize: '14px' }}>No flight activity in this period.</span>
                        )}
                    </div>
                ) : (
                    <div style={{ background: 'white', padding: '20px', borderRadius: '16px', borderLeft: '4px solid #3b82f6', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <Plane size={16} color="#3b82f6"/> Aircraft Profile
                        </h3>
                        <div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a' }}>{activeSelectedDroneInfo?.name}</div>
                            <div style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
                                Model: <strong>{activeSelectedDroneInfo?.model}</strong>. Displaying isolated metrics for this specific unit.
                            </div>
                        </div>
                    </div>
                )}

                <div 
                    onClick={handleCriticalLogClick}
                    style={{ background: 'white', padding: '20px', borderRadius: '16px', borderLeft: '4px solid #ef4444', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', cursor: chartLogs.some(log => log.anomalies_count > 0) && !isPdfMode ? 'pointer' : 'default', transition: 'transform 0.2s' }}
                >
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <AlertOctagon size={16} color="#ef4444"/> Critical Attention Required
                    </h3>
                    {chartLogs.some(log => log.anomalies_count > 0) ? (
                        (() => {
                            const worstFlight = [...chartLogs].sort((a,b) => b.anomalies_count - a.anomalies_count)[0];
                            return (
                                <div>
                                    <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a' }}>{worstFlight.name || 'Unnamed Flight'}</div>
                                    <div style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
                                        Recorded <strong style={{color: '#ef4444'}}>{worstFlight.anomalies_count} critical anomalies</strong>. Recommended hardware inspection.
                                    </div>
                                </div>
                            );
                        })()
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: '500', height: '100%' }}>
                            <span>{selectedDroneId === 'all' ? 'Fleet is' : 'This drone is'} 100% healthy. No anomalies detected!</span>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: isPdfMode ? 'column' : 'row', gap: '20px', alignItems: 'flex-start' }}>
                
                {/* ЛІВА КОЛОНКА (ГРАФІКИ) */}
                <div style={{ flex: isPdfMode ? 'none' : 2, width: '100%', display: 'flex', flexDirection: 'column' }}>
                    
                    <LiveTrackerWidget />

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

                    {/* БЛОК АВТОПАРКУ */}
                    {selectedDroneId === 'all' && (
                        <div ref={activeFleetRef} className="pdf-block" style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Plane size={20} color="#f59e0b" /> Active Fleet Performance
                                </h3>
                                {/* ПОЛЕ ПОШУКУ ПО ФЛОТУ */}
                                {!isPdfMode && activeDrones.length > 0 && (
                                    <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <Search size={14} color="#64748b" style={{ marginRight: '8px' }}/>
                                        <input 
                                            type="text" 
                                            placeholder="Search fleet..." 
                                            value={fleetSearchQuery}
                                            onChange={(e) => setFleetSearchQuery(e.target.value)}
                                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '13px', width: '140px' }}
                                        />
                                    </div>
                                )}
                            </div>
                            
                            {activeDrones.length === 0 ? (
                                <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>No drones were active in this period.</p>
                            ) : filteredActiveDrones.length === 0 ? (
                                <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0, textAlign: 'center', padding: '20px 0' }}>No drones match your search.</p>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                                    {filteredActiveDrones.map(drone => (
                                        <div 
                                            key={drone.id} 
                                            onClick={() => !isPdfMode && navigate(`/drones?drone=${drone.id}`)}
                                            style={{ 
                                                padding: '15px', 
                                                background: highlightedDroneId === drone.id ? '#ecfdf5' : '#f8fafc', 
                                                border: drone.errors > 0 ? '1px solid #fca5a5' : '1px solid #e2e8f0', 
                                                borderRadius: '10px', 
                                                cursor: isPdfMode ? 'default' : 'pointer', 
                                                transition: 'all 0.3s ease',
                                                transform: highlightedDroneId === drone.id ? 'scale(1.02)' : 'scale(1)',
                                                boxShadow: highlightedDroneId === drone.id ? '0 0 0 3px #34d399' : 'none',
                                                zIndex: highlightedDroneId === drone.id ? 10 : 1
                                            }}
                                            onMouseOver={(e) => !isPdfMode && highlightedDroneId !== drone.id && (e.currentTarget.style.borderColor = drone.errors > 0 ? '#ef4444' : '#f59e0b')}
                                            onMouseOut={(e) => !isPdfMode && highlightedDroneId !== drone.id && (e.currentTarget.style.borderColor = drone.errors > 0 ? '#fca5a5' : '#e2e8f0')}
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
                    )}
                </div>

                {/* ПРАВА КОЛОНКА (ІСТОРІЯ) */}
                <div style={{ flex: isPdfMode ? 'none' : 1, width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    <div ref={recentAnalysisRef} className="pdf-block" style={{ background: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
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
                                            style={{ 
                                                padding: '12px', 
                                                background: highlightedLogId === log.id ? '#fef2f2' : (log.anomalies_count > 0 ? '#fef2f2' : '#f8fafc'), 
                                                borderRadius: '10px', 
                                                border: log.anomalies_count > 0 ? '1px solid #fca5a5' : '1px solid #e2e8f0', 
                                                cursor: isPdfMode ? 'default' : 'pointer', 
                                                transition: 'all 0.3s ease',
                                                transform: highlightedLogId === log.id ? 'scale(1.02)' : 'scale(1)',
                                                boxShadow: highlightedLogId === log.id ? '0 0 0 3px #f87171' : 'none',
                                                zIndex: highlightedLogId === log.id ? 10 : 1
                                            }}
                                            onMouseOver={(e) => !isPdfMode && highlightedLogId !== log.id && (e.currentTarget.style.borderColor = log.anomalies_count > 0 ? '#ef4444' : '#8b5cf6')}
                                            onMouseOut={(e) => !isPdfMode && highlightedLogId !== log.id && (e.currentTarget.style.borderColor = log.anomalies_count > 0 ? '#fca5a5' : '#e2e8f0')}
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
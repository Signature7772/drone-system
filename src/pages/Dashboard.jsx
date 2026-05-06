import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { 
    LayoutDashboard, Target, Map as MapIcon, Activity, 
    TrendingUp, Clock, Navigation, Calendar as CalendarIcon,
    ChevronDown, ChevronUp, Send, Plane, AlertOctagon
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, LogarithmicScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

// ОНОВЛЕНО: Додано LogarithmicScale
ChartJS.register(CategoryScale, LinearScale, LogarithmicScale, PointElement, LineElement, Title, Tooltip, Legend);

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

    useEffect(() => {
        if (profile?.company_id) {
            fetchDashboardData();
        }
    }, [profile, timeRange]); 

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

    const chartData = useMemo(() => {
        const labels = [];
        const logsCounts = [];
        const missionsCounts = [];
        const distCounts = [];
        const errorsCounts = []; 
        const timeCounts = []; // ОНОВЛЕНО: Дані для часу
        
        if (timeRange === 'week' || timeRange === 'month') {
            const daysToShow = timeRange === 'week' ? 7 : 30;
            for (let i = daysToShow - 1; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                labels.push(d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }));
                logsCounts.push(0); missionsCounts.push(0); distCounts.push(0); errorsCounts.push(0); timeCounts.push(0);
            }

            chartLogs.forEach(item => {
                const dateStr = new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
                const index = labels.indexOf(dateStr);
                if (index !== -1) { 
                    logsCounts[index] += 1; 
                    distCounts[index] += (item.actual_distance || 0); 
                    errorsCounts[index] += (item.anomalies_count || 0); 
                    timeCounts[index] += (item.flight_time || 0);
                }
            });

            chartMissions.forEach(item => {
                const dateStr = new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
                const index = labels.indexOf(dateStr);
                if (index !== -1) missionsCounts[index] += 1;
            });

        } else {
            for (let i = 11; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                labels.push(d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })); 
                logsCounts.push(0); missionsCounts.push(0); distCounts.push(0); errorsCounts.push(0); timeCounts.push(0);
            }

            chartLogs.forEach(item => {
                const dateStr = new Date(item.created_at).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
                const index = labels.indexOf(dateStr);
                if (index !== -1) { 
                    logsCounts[index] += 1; 
                    distCounts[index] += (item.actual_distance || 0); 
                    errorsCounts[index] += (item.anomalies_count || 0); 
                    timeCounts[index] += (item.flight_time || 0);
                }
            });

            chartMissions.forEach(item => {
                const dateStr = new Date(item.created_at).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
                const index = labels.indexOf(dateStr);
                if (index !== -1) missionsCounts[index] += 1;
            });
        }

        return {
            labels,
            datasets: [
                {
                    label: 'Analyzed Logs',
                    data: logsCounts,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y'
                },
                {
                    label: 'Planned Missions',
                    data: missionsCounts,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y'
                },
                {
                    label: 'Critical Incidents',
                    data: errorsCounts,
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderDash: [2, 2],
                    tension: 0.3,
                    type: 'line',
                    yAxisID: 'y'
                },
                {
                    label: 'Flown Distance (km)',
                    data: distCounts.map(d => d / 1000), 
                    borderColor: '#f59e0b',
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    tension: 0.3,
                    type: 'line',
                    yAxisID: 'y1'
                },
                {
                    label: 'Flight Time (hrs)',
                    data: timeCounts.map(t => parseFloat(formatHours(t))), // Переводимо в години
                    borderColor: '#0284c7',
                    backgroundColor: 'transparent',
                    borderDash: [10, 5],
                    tension: 0.3,
                    type: 'line',
                    yAxisID: 'y1'
                }
            ]
        };
    }, [chartLogs, chartMissions, timeRange]);

    const chartOptions = {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        scales: {
            y: { 
                type: 'linear', 
                display: true, 
                position: 'left', 
                title: { display: true, text: 'Count (Logs, Missions, Errors)' }, 
                ticks: { stepSize: 1 } 
            },
            y1: { 
                // ОНОВЛЕНО: Використовуємо логарифмічну шкалу, щоб бачити і 0.3 год, і 60 км одночасно
                type: 'logarithmic', 
                display: true, 
                position: 'right', 
                title: { display: true, text: 'Distance (km) & Time (hrs) - Log Scale' }, 
                grid: { drawOnChartArea: false },
                ticks: {
                    callback: function(value, index, values) {
                        if (value === 0.1 || value === 1 || value === 10 || value === 100 || value === 1000) {
                            return value;
                        }
                        return null; // Приховуємо зайві мітки логарифмічної шкали
                    }
                }
            }
        }
    };

    if (loading) return <div style={{ color: '#64748b', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>Calculating fleet statistics...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '28px', color: '#0f172a' }}>Fleet Overview</h1>
                    <p style={{ color: '#64748b', margin: '5px 0 0 0' }}>Welcome back. Here is what's happening with your drones.</p>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'white', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <CalendarIcon size={16} color="#64748b" />
                    <select 
                        value={timeRange} 
                        onChange={(e) => setTimeRange(e.target.value)}
                        style={{ border: 'none', outline: 'none', background: 'transparent', color: '#0f172a', fontWeight: '600', fontSize: '14px', cursor: 'pointer' }}
                    >
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                        <option value="year">This Year</option>
                        <option value="all">All Time</option>
                    </select>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
                <StatCard icon={<Target color="#3b82f6"/>} title={profile.role === 'admin' ? "Total Fleet" : "Assigned Drones"} value={stats.dronesCount} unit="Units" onClick={() => navigate('/drones')} />
                <StatCard icon={<MapIcon color="#10b981"/>} title="Planned Routes" value={stats.missionsCount} unit="Missions" onClick={() => navigate('/missions')} />
                <StatCard icon={<Activity color="#8b5cf6"/>} title="Analyzed Logs" value={stats.logsCount} unit="Flights" onClick={() => navigate('/logbook')} />
                <StatCard icon={<Navigation color="#f59e0b"/>} title="Flown Distance" value={(stats.totalActualDistance / 1000).toFixed(1)} unit="Kilometers" onClick={() => navigate('/logbook')} />
                <StatCard icon={<Clock color="#8b5cf6"/>} title="Total Flight Time" value={formatHours(stats.totalFlightTime)} unit="Hours" onClick={() => navigate('/logbook')} />
                <StatCard icon={<AlertOctagon color="#ef4444"/>} title="Critical Incidents" value={stats.totalAnomalies} unit="Errors" onClick={() => navigate('/logbook')} borderColor="#ef4444" />
            </div>

            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <TrendingUp size={20} color="#3b82f6" /> Flight & Planning Activity
                        </h3>
                        <div style={{ height: '300px' }}>
                            <Line data={chartData} options={chartOptions} />
                        </div>
                    </div>

                    <div style={{ background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
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
                                        // ОНОВЛЕНО: Навігація в реєстр дронів
                                        onClick={() => navigate(`/drones?drone=${drone.id}`)}
                                        style={{ padding: '15px', background: '#f8fafc', border: drone.errors > 0 ? '1px solid #fca5a5' : '1px solid #e2e8f0', borderRadius: '10px', cursor: 'pointer', transition: 'border-color 0.2s' }}
                                        onMouseOver={(e) => e.currentTarget.style.borderColor = drone.errors > 0 ? '#ef4444' : '#f59e0b'}
                                        onMouseOut={(e) => e.currentTarget.style.borderColor = drone.errors > 0 ? '#fca5a5' : '#e2e8f0'}
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

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div style={{ background: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                        <div 
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                            onClick={() => setIsLogsOpen(!isLogsOpen)}
                        >
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '16px' }}>
                                <Clock size={18} color="#8b5cf6" /> Recent Analysis
                            </h3>
                            {isLogsOpen ? <ChevronUp size={18} color="#64748b"/> : <ChevronDown size={18} color="#64748b"/>}
                        </div>
                        
                        {isLogsOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                                {recentLogs.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>No flights recorded yet.</p> : 
                                    recentLogs.map(log => (
                                        <div 
                                            key={log.id} 
                                            onClick={() => navigate(`/logbook?mission=${log.mission_id}`)}
                                            style={{ padding: '12px', background: log.anomalies_count > 0 ? '#fef2f2' : '#f8fafc', borderRadius: '10px', border: log.anomalies_count > 0 ? '1px solid #fca5a5' : '1px solid #e2e8f0', cursor: 'pointer', transition: 'border-color 0.2s' }}
                                            onMouseOver={(e) => e.currentTarget.style.borderColor = log.anomalies_count > 0 ? '#ef4444' : '#8b5cf6'}
                                            onMouseOut={(e) => e.currentTarget.style.borderColor = log.anomalies_count > 0 ? '#fca5a5' : '#e2e8f0'}
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

                    <div style={{ background: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                        <div 
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                            onClick={() => setIsMissionsOpen(!isMissionsOpen)}
                        >
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '16px' }}>
                                <Send size={18} color="#10b981" /> Recent Missions
                            </h3>
                            {isMissionsOpen ? <ChevronUp size={18} color="#64748b"/> : <ChevronDown size={18} color="#64748b"/>}
                        </div>
                        
                        {isMissionsOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
                                {recentMissions.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>No missions planned yet.</p> : 
                                    recentMissions.map(mission => (
                                        <div 
                                            key={mission.id} 
                                            onClick={() => navigate(`/missions?loadMissionId=${mission.id}`)}
                                            style={{ padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'border-color 0.2s' }}
                                            onMouseOver={(e) => e.currentTarget.style.borderColor = '#10b981'}
                                            onMouseOut={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
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
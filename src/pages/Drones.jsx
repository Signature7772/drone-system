import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
// ВИПРАВЛЕНО: Додано імпорт Clock
import { Plus, Trash2, Edit2, ShieldAlert, Cpu, Gauge, Navigation, Activity, Search, ShieldCheck, X, Zap, Play, Archive, Clock } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const DRONE_TEMPLATES = [
    { id: 'custom', name: 'Custom / Manual Entry', model: '', type: 'Quadcopter', max_flight_time: '', max_speed: '', max_altitude: '', weight: '', controller_type: 'Standard RC' },
    { id: 'dji_m3e', name: 'DJI Mavic 3 Enterprise', model: 'Mavic 3E', type: 'Quadcopter', max_flight_time: 45, max_speed: 21, max_altitude: 6000, weight: 0.915, controller_type: 'DJI RC Pro Enterprise' },
    { id: 'dji_m300', name: 'DJI Matrice 300 RTK', model: 'M300 RTK', type: 'Quadcopter', max_flight_time: 55, max_speed: 23, max_altitude: 7000, weight: 6.3, controller_type: 'DJI Smart Controller Ent' },
    { id: 'dji_agras_t40', name: 'DJI Agras T40 (Agri)', model: 'Agras T40', type: 'Hexacopter', max_flight_time: 15, max_speed: 10, max_altitude: 30, weight: 50.0, controller_type: 'DJI Agras Smart RC' },
    { id: 'autel_evo_max', name: 'Autel EVO Max 4T', model: 'EVO Max 4T', type: 'Quadcopter', max_flight_time: 42, max_speed: 23, max_altitude: 7000, weight: 1.6, controller_type: 'Autel Smart Controller V3' },
    { id: 'wingtra', name: 'WingtraOne GEN II', model: 'WingtraOne', type: 'VTOL', max_flight_time: 59, max_speed: 16, max_altitude: 5000, weight: 3.7, controller_type: 'Wingtra Tablet' },
];

function Drones({ profile }) {
    const [drones, setDrones] = useState([]);
    const [users, setUsers] = useState([]);
    const [accessMap, setAccessMap] = useState({});
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    const [viewingSpecs, setViewingSpecs] = useState(null);

    const navigate = useNavigate();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const filterDroneId = searchParams.get('drone'); 

    const [formData, setFormData] = useState({
        name: '',
        model: '',
        max_flight_time: '',
        type: 'Quadcopter',
        max_speed: '',
        max_altitude: '',
        weight: '',
        controller_type: 'Standard RC'
    });

    useEffect(() => {
        if (profile?.company_id) {
            fetchDronesAndAccess();
        }
    }, [profile]);

    const fetchDronesAndAccess = async () => {
        setLoading(true);
        const { data: dronesData } = await supabase
            .from('drones')
            .select('*, missions(id, is_archived), flight_logs(id)')
            .eq('company_id', profile.company_id)
            .order('name', { ascending: true });
        
        let availableDrones = dronesData || [];

        if (profile.role !== 'admin') {
            const { data: myAccess } = await supabase
                .from('drone_access')
                .select('drone_id')
                .eq('user_id', profile.id);
            
            const allowedIds = myAccess ? myAccess.map(a => a.drone_id) : [];
            availableDrones = availableDrones.filter(d => allowedIds.includes(d.id));
        }
        
        setDrones(availableDrones);

        if (profile.role === 'admin') {
            const { data: usersData } = await supabase.from('profiles').select('id, email, role').eq('company_id', profile.company_id);
            setUsers(usersData || []);

            const { data: accessData } = await supabase.from('drone_access').select('drone_id, user_id');
            const newAccessMap = {};
            if (accessData) {
                accessData.forEach(row => {
                    if (!newAccessMap[row.drone_id]) newAccessMap[row.drone_id] = [];
                    newAccessMap[row.drone_id].push(row.user_id);
                });
            }
            setAccessMap(newAccessMap);
        }
        setLoading(false);
    };

    const handleTemplateChange = (e) => {
        const template = DRONE_TEMPLATES.find(t => t.id === e.target.value);
        if (template && template.id !== 'custom') {
            setFormData({
                ...formData,
                model: template.model,
                type: template.type,
                max_flight_time: template.max_flight_time,
                max_speed: template.max_speed,
                max_altitude: template.max_altitude,
                weight: template.weight,
                controller_type: template.controller_type
            });
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (profile.role !== 'admin') return alert('Access Denied');

        const dronePayload = {
            company_id: profile.company_id,
            name: formData.name,
            model: formData.model,
            max_flight_time: parseInt(formData.max_flight_time) || 0,
            type: formData.type || 'Quadcopter',
            max_speed: parseFloat(formData.max_speed) || 0,
            max_altitude: parseFloat(formData.max_altitude) || 0,
            weight: parseFloat(formData.weight) || 0,
            controller_type: formData.controller_type || 'Standard RC'
        };

        if (editingId) {
            const { error } = await supabase.from('drones').update(dronePayload).eq('id', editingId);
            if (error) alert(error.message);
        } else {
            const { error } = await supabase.from('drones').insert([dronePayload]);
            if (error) alert(error.message);
        }
        
        setFormData({ name: '', model: '', max_flight_time: '', type: 'Quadcopter', max_speed: '', max_altitude: '', weight: '', controller_type: 'Standard RC' });
        setShowForm(false);
        setEditingId(null);
        fetchDronesAndAccess();
    };

    const handleEdit = (drone) => {
        setFormData({
            name: drone.name || '',
            model: drone.model || '',
            max_flight_time: drone.max_flight_time || '',
            type: drone.type || 'Quadcopter',
            max_speed: drone.max_speed || '',
            max_altitude: drone.max_altitude || '',
            weight: drone.weight || '',
            controller_type: drone.controller_type || 'Standard RC'
        });
        setEditingId(drone.id);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' }); 
    };

    const handleDelete = async (id) => {
        if (profile.role !== 'admin') return alert('Access Denied');
        if (!window.confirm('Are you sure you want to delete this drone?')) return;
        
        const { error } = await supabase.from('drones').delete().eq('id', id);
        if (error) alert(error.message);
        else fetchDronesAndAccess();
    };

    const toggleAccess = async (droneId, userId) => {
        if (profile.role !== 'admin') return;

        const hasAccess = accessMap[droneId]?.includes(userId);
        if (hasAccess) {
            await supabase.from('drone_access').delete().match({ drone_id: droneId, user_id: userId });
        } else {
            await supabase.from('drone_access').insert([{ drone_id: droneId, user_id: userId }]);
        }
        fetchDronesAndAccess();
    };

    let filteredDrones = drones.filter(d => 
        (d.name && d.name.toLowerCase().includes(searchQuery.toLowerCase())) || 
        (d.model && d.model.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (filterDroneId) {
        filteredDrones = filteredDrones.filter(d => String(d.id) === filterDroneId);
    }

    if (loading) return <div style={{ color: '#64748b', display: 'flex', justifyContent: 'center', marginTop: '50px' }}>Loading fleet registry...</div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {viewingSpecs && (
                <div style={modalOverlayStyle}>
                    <div style={{ ...modalContentStyle, width: '450px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Cpu color="#3b82f6" /> Drone Specifications</h2>
                            <button onClick={() => setViewingSpecs(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={24} color="#64748b" /></button>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #3b82f6' }}>
                                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>{viewingSpecs.name || 'Unknown Drone'}</div>
                                <div style={{ fontSize: '14px', color: '#64748b' }}>{viewingSpecs.model || 'Unknown Model'} | {viewingSpecs.type || 'Quadcopter'}</div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div style={specCardStyle}>
                                    <Clock size={16} color="#8b5cf6" />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Max Flight Time</div>
                                        <div style={{ fontWeight: 'bold' }}>{viewingSpecs.max_flight_time ? `${viewingSpecs.max_flight_time} mins` : 'N/A'}</div>
                                    </div>
                                </div>
                                <div style={specCardStyle}>
                                    <Gauge size={16} color="#f59e0b" />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Max Speed</div>
                                        <div style={{ fontWeight: 'bold' }}>{viewingSpecs.max_speed ? `${viewingSpecs.max_speed} m/s` : 'N/A'}</div>
                                    </div>
                                </div>
                                <div style={specCardStyle}>
                                    <Navigation size={16} color="#10b981" />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Max Altitude</div>
                                        <div style={{ fontWeight: 'bold' }}>{viewingSpecs.max_altitude ? `${viewingSpecs.max_altitude} m` : 'N/A'}</div>
                                    </div>
                                </div>
                                <div style={specCardStyle}>
                                    <Activity size={16} color="#ef4444" />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Takeoff Weight</div>
                                        <div style={{ fontWeight: 'bold' }}>{viewingSpecs.weight ? `${viewingSpecs.weight} kg` : 'N/A'}</div>
                                    </div>
                                </div>
                            </div>
                            
                            <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '12px', borderRadius: '8px', fontSize: '13px', color: '#334155' }}>
                                <strong>Controller / GCS:</strong> <br/>{viewingSpecs.controller_type || 'Standard RC'}
                            </div>

                            <div style={{ background: '#fffbeb', border: '1px solid #fde047', padding: '12px', borderRadius: '8px', fontSize: '12px', color: '#854d0e', marginTop: '10px' }}>
                                <strong>Logbook Analytics Tip:</strong> The Logbook anomaly detector is synchronized with these hardware limits. Flying faster than <strong>{viewingSpecs.max_speed || 'the safe limit'} m/s</strong> or longer than <strong>{viewingSpecs.max_flight_time || 'the rated time'} mins</strong> will trigger automated incident alerts.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    Fleet Registry
                    {filterDroneId && (
                        <button onClick={() => navigate('/drones')} style={{...miniButtonStyle, marginLeft: '10px', background: '#64748b', display: 'flex', alignItems: 'center', gap: '4px'}}>
                            Show All
                        </button>
                    )}
                </h1>
                <div style={{ display: 'flex', gap: '15px' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={16} color="#94a3b8" style={{ position: 'absolute', top: '10px', left: '10px' }} />
                        <input 
                            type="text" 
                            placeholder="Search fleet..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ padding: '8px 10px 8px 32px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '14px', width: '200px' }}
                        />
                    </div>
                    {profile.role === 'admin' && (
                        <button onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData({ name: '', model: '', max_flight_time: '', type: 'Quadcopter', max_speed: '', max_altitude: '', weight: '', controller_type: 'Standard RC' }); }} style={{ ...buttonStyle, background: showForm ? '#94a3b8' : '#3b82f6', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'Register Drone'}
                        </button>
                    )}
                </div>
            </div>

            {showForm && profile.role === 'admin' && (
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', border: '1px solid #e2e8f0', borderLeft: editingId ? '4px solid #f59e0b' : '4px solid #3b82f6' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {editingId ? <Edit2 size={18} color="#f59e0b"/> : <Plus size={18} color="#3b82f6"/>} 
                        {editingId ? 'Edit Drone Properties' : 'Register New Drone'}
                    </h3>
                    
                    {!editingId && (
                        <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #cbd5e1' }}>
                            <label style={{...labelStyle, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '5px'}}><Zap size={14}/> Auto-fill from Templates</label>
                            <select onChange={handleTemplateChange} style={inputStyle}>
                                {DRONE_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                    )}

                    <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                        <div><label style={labelStyle}>Designation Name (Internal)</label><input required placeholder="e.g., Scout-01" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={inputStyle} /></div>
                        <div><label style={labelStyle}>Hardware Model</label><input required placeholder="e.g., DJI Mavic 3" value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} style={inputStyle} /></div>
                        
                        <div>
                            <label style={labelStyle}>Frame Type</label>
                            <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} style={inputStyle}>
                                <option value="Quadcopter">Quadcopter</option>
                                <option value="Hexacopter">Hexacopter</option>
                                <option value="Fixed-Wing">Fixed-Wing</option>
                                <option value="VTOL">VTOL</option>
                            </select>
                        </div>
                        <div><label style={labelStyle}>Controller / GCS Type</label><input required placeholder="e.g., Smart Controller" value={formData.controller_type} onChange={e => setFormData({...formData, controller_type: e.target.value})} style={inputStyle} /></div>
                        
                        <div><label style={labelStyle}>Takeoff Weight (kg)</label><input type="number" step="0.01" value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})} style={inputStyle} /></div>
                        <div><label style={labelStyle}>Max Flight Time (minutes)</label><input type="number" required value={formData.max_flight_time} onChange={e => setFormData({...formData, max_flight_time: e.target.value})} style={inputStyle} /></div>
                        
                        <div><label style={labelStyle}>Max Horizontal Speed (m/s)</label><input type="number" step="0.1" required value={formData.max_speed} onChange={e => setFormData({...formData, max_speed: e.target.value})} style={inputStyle} /></div>
                        <div><label style={labelStyle}>Max Altitude Limit (m)</label><input type="number" required value={formData.max_altitude} onChange={e => setFormData({...formData, max_altitude: e.target.value})} style={inputStyle} /></div>
                        
                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', marginTop: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '15px' }}>
                            <button type="submit" style={{ ...buttonStyle, background: '#10b981' }}>{editingId ? 'Save Changes' : 'Register Aircraft'}</button>
                            <button type="button" onClick={() => setShowForm(false)} style={{ ...buttonStyle, background: '#64748b' }}>Cancel</button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                {filteredDrones.map(drone => {
                    const activeMissions = drone.missions?.filter(m => !m.is_archived) || [];
                    const archivedMissions = drone.missions?.filter(m => m.is_archived) || [];
                    const flightLogs = drone.flight_logs || [];

                    return (
                        <div key={drone.id} style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', border: filterDroneId ? '2px solid #3b82f6' : '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>{drone.name}</div>
                                    <div style={{ fontSize: '13px', color: '#3b82f6', fontWeight: '600' }}>{drone.model}</div>
                                </div>
                                {profile.role === 'admin' && (
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <button onClick={() => handleEdit(drone)} style={{ ...miniButtonStyle, background: '#f59e0b', padding: '6px' }}><Edit2 size={14} /></button>
                                        <button onClick={() => handleDelete(drone.id)} style={{ ...miniButtonStyle, background: '#ef4444', padding: '6px' }}><Trash2 size={14} /></button>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                                <div style={{ fontSize: '12px', background: '#f1f5f9', color: '#475569', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold' }}>{drone.type || 'Quadcopter'}</div>
                                <button 
                                    onClick={() => setViewingSpecs(drone)}
                                    style={{ fontSize: '12px', background: '#eff6ff', color: '#3b82f6', border: '1px solid #bfdbfe', padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', flex: 1, textAlign: 'center', transition: 'background 0.2s' }}
                                    onMouseOver={(e) => e.target.style.background = '#dbeafe'}
                                    onMouseOut={(e) => e.target.style.background = '#eff6ff'}
                                >
                                    View Specs
                                </button>
                            </div>

                            {profile.role === 'admin' && (
                                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '15px' }}>
                                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}><ShieldCheck size={14} /> Pilot Access Control</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                                        {users.filter(u => u.role === 'pilot').map(user => {
                                            const hasAccess = accessMap[drone.id]?.includes(user.id);
                                            return (
                                                <label key={user.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', background: hasAccess ? '#f0fdf4' : 'transparent', padding: '4px 8px', borderRadius: '6px', transition: 'background 0.2s' }} onMouseOver={(e) => {if(!hasAccess) e.currentTarget.style.background = '#f1f5f9'}} onMouseOut={(e) => {if(!hasAccess) e.currentTarget.style.background = 'transparent'}}>
                                                    <input type="checkbox" checked={hasAccess || false} onChange={() => toggleAccess(drone.id, user.id)} style={{ cursor: 'pointer' }} />
                                                    <span style={{ color: hasAccess ? '#166534' : '#475569', fontWeight: hasAccess ? '600' : '400' }}>{user.email}</span>
                                                </label>
                                            );
                                        })}
                                        {users.filter(u => u.role === 'pilot').length === 0 && <div style={{ fontSize: '12px', color: '#94a3b8' }}>No pilots in team yet.</div>}
                                    </div>
                                </div>
                            )}
                            
                            {profile.role === 'pilot' && (
                                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '15px', fontSize: '12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold' }}>
                                    <ShieldCheck size={14} /> Access Granted by Admin
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '5px', marginTop: 'auto', paddingTop: '15px', borderTop: '1px dashed #cbd5e1' }}>
                                <button onClick={() => navigate(`/missions?drone=${drone.id}`)} disabled={activeMissions.length === 0} style={missionBtnStyle(activeMissions.length, '#10b981')}><Play size={14} /> Act: {activeMissions.length}</button>
                                <button onClick={() => navigate(`/missions?drone=${drone.id}&tab=archived`)} disabled={archivedMissions.length === 0} style={missionBtnStyle(archivedMissions.length, '#64748b')}><Archive size={14} /> Arch: {archivedMissions.length}</button>
                                <button onClick={() => navigate(`/logbook?drone=${drone.id}`)} disabled={flightLogs.length === 0} style={missionBtnStyle(flightLogs.length, '#3b82f6')}><Activity size={14} /> Logs: {flightLogs.length}</button>
                            </div>

                        </div>
                    );
                })}
            </div>
            
            {filteredDrones.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>No drones found.</div>}
        </div>
    );
}

const labelStyle = { display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', boxSizing: 'border-box' };
const buttonStyle = { padding: '10px 16px', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s' };
const miniButtonStyle = { border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'white' };
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(3px)' };
const modalContentStyle = { background: 'white', padding: '25px', borderRadius: '16px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' };
const specCardStyle = { display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' };
const missionBtnStyle = (count, color) => ({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '8px 4px', borderRadius: '8px', border: 'none', background: count > 0 ? color : '#f1f5f9', color: count > 0 ? 'white' : '#94a3b8', cursor: count > 0 ? 'pointer' : 'default', fontWeight: 'bold', fontSize: '12px', transition: 'background 0.2s' });

export default Drones;
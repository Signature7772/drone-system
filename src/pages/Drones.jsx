import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Target, Plus, Trash2, Battery, Weight, Cpu, Edit, Copy, Play, Archive, Activity, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function Drones({ profile }) {
    const [drones, setDrones] = useState([]);
    const [pilots, setPilots] = useState([]); // Список пілотів
    const [droneAccess, setDroneAccess] = useState([]); // Доступи
    const [isLoading, setIsLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null); 
    const [expandedAccessDroneId, setExpandedAccessDroneId] = useState(null); // Відкрита панель доступу
    
    const navigate = useNavigate();
    const isAdmin = profile?.role === 'admin';

    const defaultDroneState = { name: '', model: 'DJI Mavic 3', max_flight_time: 40, weight: 0.9, controller_type: 'Proprietary' };
    const [newDrone, setNewDrone] = useState(defaultDroneState);

    useEffect(() => {
        if (profile?.company_id) {
            fetchDrones();
            if (isAdmin) fetchPilotsAndAccess();
        }
    }, [profile, isAdmin]);

    const fetchDrones = async () => {
        const { data, error } = await supabase.from('drones').select('*, missions(id, is_archived), flight_logs(id)').order('created_at', { ascending: false });
        if (!error) setDrones(data);
    };

    const fetchPilotsAndAccess = async () => {
        const [pilotsRes, accessRes] = await Promise.all([
            supabase.from('profiles').select('id, email').eq('company_id', profile.company_id).eq('role', 'pilot'),
            supabase.from('drone_access').select('*').eq('company_id', profile.company_id)
        ]);
        if (!pilotsRes.error) setPilots(pilotsRes.data);
        if (!accessRes.error) setDroneAccess(accessRes.data);
    };

    const togglePilotAccess = async (droneId, pilotId, hasAccess) => {
        if (hasAccess) {
            await supabase.from('drone_access').delete().match({ drone_id: droneId, user_id: pilotId });
        } else {
            await supabase.from('drone_access').insert([{ drone_id: droneId, user_id: pilotId, company_id: profile.company_id }]);
        }
        fetchPilotsAndAccess(); // Оновлюємо доступи
    };

    const handleSaveDrone = async (e) => {
        e.preventDefault(); setIsLoading(true);
        const droneDataWithCompany = { ...newDrone, company_id: profile.company_id };
        let error;
        if (editingId) error = (await supabase.from('drones').update(droneDataWithCompany).eq('id', editingId)).error;
        else error = (await supabase.from('drones').insert([droneDataWithCompany])).error;

        setIsLoading(false);
        if (error) alert('Error: ' + error.message);
        else { closeForm(); fetchDrones(); }
    };

    const handleDeleteDrone = async (id) => {
        if (!window.confirm('Delete this drone?')) return;
        const { error } = await supabase.from('drones').delete().eq('id', id);
        if (!error) fetchDrones();
    };

    const handleEditClick = (drone) => {
        setNewDrone({ name: drone.name, model: drone.model, max_flight_time: drone.max_flight_time, weight: drone.weight, controller_type: drone.controller_type });
        setEditingId(drone.id); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' }); 
    };

    const handleCloneClick = (drone) => {
        setNewDrone({ name: `${drone.name} (Copy)`, model: drone.model, max_flight_time: drone.max_flight_time, weight: drone.weight, controller_type: drone.controller_type });
        setEditingId(null); setShowForm(true); window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const closeForm = () => { setShowForm(false); setEditingId(null); setNewDrone(defaultDroneState); };

    if (!profile) return null;

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}><Target size={28} color="#3b82f6" /> Drone Fleet Registry</h2>
                {isAdmin && (
                    <button onClick={() => showForm ? closeForm() : setShowForm(true)} style={{ ...buttonStyle, background: showForm ? '#94a3b8' : '#3b82f6', display: 'flex', gap: '8px' }}>
                        <Plus size={18} /> {showForm ? 'Cancel' : 'Register New Drone'}
                    </button>
                )}
            </div>

            {showForm && isAdmin && (
                 <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', marginBottom: '30px', borderLeft: editingId ? '4px solid #f59e0b' : '4px solid #3b82f6' }}>
                    <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>{editingId ? <Edit size={20} color="#f59e0b" /> : <Plus size={20} color="#3b82f6" />} {editingId ? 'Edit Drone' : 'Add New Drone'}</h3>
                    <form onSubmit={handleSaveDrone} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                        <div><label style={labelStyle}>Call Sign / Name</label><input required value={newDrone.name} onChange={e => setNewDrone({...newDrone, name: e.target.value})} style={inputStyle} /></div>
                        <div><label style={labelStyle}>Hardware Model</label><input required value={newDrone.model} onChange={e => setNewDrone({...newDrone, model: e.target.value})} style={inputStyle} /></div>
                        <div><label style={labelStyle}>Max Flight Time (min)</label><input required type="number" value={newDrone.max_flight_time} onChange={e => setNewDrone({...newDrone, max_flight_time: parseInt(e.target.value)})} style={inputStyle} /></div>
                        <div><label style={labelStyle}>Takeoff Weight (kg)</label><input required type="number" step="0.1" value={newDrone.weight} onChange={e => setNewDrone({...newDrone, weight: parseFloat(e.target.value)})} style={inputStyle} /></div>
                        <div>
                            <label style={labelStyle}>Flight Controller</label>
                            <select value={newDrone.controller_type} onChange={e => setNewDrone({...newDrone, controller_type: e.target.value})} style={inputStyle}>
                                <option>Proprietary (DJI / Autel)</option><option>ArduPilot / Pixhawk</option><option>PX4</option><option>Betaflight / INAV</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button type="submit" disabled={isLoading} style={{ ...buttonStyle, background: editingId ? '#f59e0b' : '#10b981', width: '100%' }}>{isLoading ? 'Saving...' : 'Save'}</button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                {drones.map(drone => {
                    const activeMissions = drone.missions?.filter(m => !m.is_archived) || [];
                    const archivedMissions = drone.missions?.filter(m => m.is_archived) || [];
                    const flightLogs = drone.flight_logs || [];

                    return (
                    <div key={drone.id} style={{ background: 'white', borderRadius: '12px', padding: '20px', boxShadow: '0 2px 4px -1px rgb(0 0 0 / 0.1)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px', marginBottom: '15px' }}>
                            <div>
                                <h3 style={{ margin: '0 0 5px 0', color: '#0f172a' }}>{drone.name}</h3>
                                <span style={{ fontSize: '13px', background: '#e0f2fe', color: '#0284c7', padding: '4px 8px', borderRadius: '12px', fontWeight: '500' }}>{drone.model}</span>
                            </div>
                            {isAdmin && (
                                <div style={{ display: 'flex', gap: '5px' }}>
                                    <button onClick={() => setExpandedAccessDroneId(expandedAccessDroneId === drone.id ? null : drone.id)} title="Access Rights" style={{...iconBtnStyle, background: expandedAccessDroneId === drone.id ? '#e0e7ff' : '#f8fafc'}}><ShieldCheck size={16} color="#4f46e5" /></button>
                                    <button onClick={() => handleEditClick(drone)} title="Edit Drone" style={iconBtnStyle}><Edit size={16} color="#3b82f6" /></button>
                                    <button onClick={() => handleDeleteDrone(drone.id)} title="Delete Drone" style={{...iconBtnStyle, background: '#fef2f2'}}><Trash2 size={16} color="#ef4444" /></button>
                                </div>
                            )}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                            <div style={specStyle}><Battery size={16} color="#64748b"/> <span style={{ color: '#475569' }}>Max Flight Time:</span> <strong style={{ marginLeft: 'auto' }}>{drone.max_flight_time} min</strong></div>
                            <div style={specStyle}><Weight size={16} color="#64748b"/> <span style={{ color: '#475569' }}>Takeoff Weight:</span> <strong style={{ marginLeft: 'auto' }}>{drone.weight} kg</strong></div>
                            <div style={specStyle}><Cpu size={16} color="#64748b"/> <span style={{ color: '#475569' }}>FC Type:</span> <strong style={{ marginLeft: 'auto', fontSize: '13px' }}>{drone.controller_type}</strong></div>
                            
                            {/* БЛОК ДОСТУПІВ */}
                            {isAdmin && expandedAccessDroneId === drone.id && (
                                <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', marginTop: '10px', border: '1px solid #e2e8f0' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#4f46e5', textTransform: 'uppercase' }}>Pilot Access</h4>
                                    {pilots.length === 0 ? <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>No pilots registered yet.</p> : pilots.map(pilot => {
                                        const hasAccess = droneAccess.some(a => a.drone_id === drone.id && a.user_id === pilot.id);
                                        return (
                                            <label key={pilot.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155', cursor: 'pointer', marginBottom: '5px' }}>
                                                <input type="checkbox" checked={hasAccess} onChange={() => togglePilotAccess(drone.id, pilot.id, hasAccess)} />
                                                {pilot.email}
                                            </label>
                                        );
                                    })}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '5px', marginTop: '10px', paddingTop: '15px', borderTop: '1px dashed #cbd5e1' }}>
                                <button onClick={() => navigate(`/missions?loadMissionId=${activeMissions[0]?.id}`)} disabled={activeMissions.length === 0} style={missionBtnStyle(activeMissions.length, '#10b981')}><Play size={14} /> Act: {activeMissions.length}</button>
                                <button onClick={() => navigate(`/missions?drone=${drone.id}&tab=archived`)} disabled={archivedMissions.length === 0} style={missionBtnStyle(archivedMissions.length, '#64748b')}><Archive size={14} /> Arch: {archivedMissions.length}</button>
                                <button onClick={() => navigate(`/logbook?drone=${drone.id}`)} disabled={flightLogs.length === 0} style={missionBtnStyle(flightLogs.length, '#3b82f6')}><Activity size={14} /> Logs: {flightLogs.length}</button>
                            </div>
                        </div>
                    </div>
                )})}
            </div>
        </div>
    );
}

const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' };
const buttonStyle = { padding: '10px 16px', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s' };
const specStyle = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' };
const iconBtnStyle = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' };
const missionBtnStyle = (count, color) => ({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '8px 4px', borderRadius: '8px', border: 'none', background: count > 0 ? color : '#f1f5f9', color: count > 0 ? 'white' : '#94a3b8', cursor: count > 0 ? 'pointer' : 'default', fontWeight: 'bold', fontSize: '12px' });

export default Drones;
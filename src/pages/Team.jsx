// Модуль управління командою
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Users, Trash2, UserMinus, ShieldAlert, KeyRound, RefreshCw } from 'lucide-react';

function Team({ profile }) {
    const [teamMembers, setTeamMembers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [companyInfo, setCompanyInfo] = useState(null);

    useEffect(() => {
        // Якщо користувач належить до компанії, завантажуємо дані команди та інформацію про компанію
        if (profile?.company_id) {
            fetchTeam();
            fetchCompanyDetails();
        } else {
            setIsLoading(false);
        }
    }, [profile]);

    // Завантаження даних (Функції fetchTeam та fetchCompanyDetails)
    const fetchTeam = async () => {
        // Запит для отримання всіх членів команди, які належать до тієї ж компанії
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('company_id', profile.company_id)
            .order('created_at', { ascending: true });
            
        if (!error && data) setTeamMembers(data);
        setIsLoading(false);
    };

    const fetchCompanyDetails = async () => {
        // Запит для отримання назви компанії та коду запрошення
        const { data } = await supabase
            .from('companies')
            .select('name, join_code')
            .eq('id', profile.company_id)
            .single();
        if (data) setCompanyInfo(data);
    };

    // ГЕНЕРАЦІЯ НОВОГО КОДУ ЗАПРОШЕННЯ
    const handleRefreshCode = async () => {
        if (!window.confirm("Are you sure? All old invite codes will become invalid immediately.")) return;
        const newJoinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        const { error } = await supabase.from('companies').update({ join_code: newJoinCode }).eq('id', profile.company_id);
        if (error) alert("Error: " + error.message);
        else fetchCompanyDetails(); // Оновлюємо UI
    };

    // Видалення співробітників адміном
    const handleAdminDeleteUser = async (targetId, email) => {
        if (!window.confirm(`Are you sure you want to PERMANENTLY delete user ${email}?`)) return;
        const { error } = await supabase.rpc('admin_delete_user', { target_user_id: targetId });
        if (error) alert('Error: ' + error.message);
        else {
            alert('User deleted successfully.');
            fetchTeam();
        }
    };

    // Видалення власного акаунту
    const handleDeleteOwnAccount = async () => {
        if (!window.confirm('WARNING: This will permanently delete your account and all your data. Are you sure?')) return;
        const { error } = await supabase.rpc('delete_own_account');
        if (error) alert('Error: ' + error.message);
        else {
            alert('Account deleted. Goodbye!');
            await supabase.auth.signOut();
            window.location.reload();
        }
    };

    if (isLoading) return <div>Loading team data...</div>;
    if (!profile) return null;

    // Інтерфейс та Рольовий доступ
    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Users size={28} color="#3b82f6" /> Team Management
                </h2>
            </div>

            {companyInfo && (
                <div style={{ background: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', marginBottom: '30px', borderLeft: '4px solid #3b82f6' }}>
                    <h3 style={{ margin: '0 0 10px 0' }}>Workspace: {companyInfo.name}</h3>
                    {profile.role === 'admin' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f1f5f9', padding: '10px 15px', borderRadius: '8px', display: 'inline-flex' }}>
                            <KeyRound size={16} color="#64748b" />
                            <span style={{ color: '#475569' }}>Invite Pilots with Code:</span>
                            <strong style={{ fontSize: '18px', letterSpacing: '2px', color: '#0f172a' }}>{companyInfo.join_code}</strong>
                            {/* Кнопка оновлення коду */}
                            <button onClick={handleRefreshCode} title="Generate new code" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', marginLeft: '10px', color: '#3b82f6' }}>
                                <RefreshCw size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', overflow: 'hidden' }}>
                {teamMembers.map(member => (
                    <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', borderBottom: '1px solid #f1f5f9' }}>
                        <div>
                            <div style={{ fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {member.email}
                                {member.id === profile.id && <span style={{ fontSize: '11px', background: '#e2e8f0', padding: '2px 6px', borderRadius: '12px' }}>You</span>}
                            </div>
                            <div style={{ fontSize: '12px', color: member.role === 'admin' ? '#3b82f6' : '#64748b', fontWeight: '600', textTransform: 'uppercase', marginTop: '4px' }}>
                                {member.role}
                            </div>
                        </div>

                        <div>
                            {profile.role === 'admin' && member.id !== profile.id && (
                                <button 
                                    onClick={() => handleAdminDeleteUser(member.id, member.email)}
                                    style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold' }}
                                >
                                    <UserMinus size={16} /> Kick / Delete
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '40px', padding: '20px', background: '#fff1f2', borderRadius: '12px', border: '1px solid #fecdd3' }}>
                <h3 style={{ margin: '0 0 10px 0', color: '#be123c', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldAlert size={20} /> Danger Zone
                </h3>
                <p style={{ color: '#9f1239', fontSize: '14px', marginBottom: '15px' }}>
                    Once you delete your account, there is no going back. Please be certain.
                    {profile.role === 'admin' && " Note: Deleting the admin account does not delete the company data."}
                </p>
                <button 
                    onClick={handleDeleteOwnAccount}
                    style={{ background: '#e11d48', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold' }}
                >
                    <Trash2 size={16} /> Delete My Account
                </button>
            </div>
        </div>
    );
}

export default Team;
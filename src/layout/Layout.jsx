import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Map, FileText, Target, Activity, LogOut, Users } from 'lucide-react';
import { supabase } from '../supabaseClient';

const Layout = () => {
    const location = useLocation();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };

    const getLinkStyle = (path) => ({
        color: location.pathname === path ? '#fff' : '#94a3b8',
        backgroundColor: location.pathname === path ? '#3b82f6' : 'transparent',
        textDecoration: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '16px',
        padding: '12px 16px',
        borderRadius: '8px',
        transition: 'all 0.2s',
        fontWeight: '500'
    });

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            {/* Sidebar */}
            <aside style={{ width: '260px', background: '#0f172a', color: 'white', padding: '24px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '40px' }}>
                    <Activity color="#3b82f6" size={28} />
                    <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>DroneOS</h2>
                </div>

                <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    <Link to="/" style={getLinkStyle('/')}><LayoutDashboard size={20} /> Dashboard</Link>
                    <Link to="/missions" style={getLinkStyle('/missions')}><Map size={20} /> Mission Planner</Link>
                    <Link to="/logbook" style={getLinkStyle('/logbook')}><FileText size={20} /> Logbook & Analysis</Link>
                    <Link to="/drones" style={getLinkStyle('/drones')}><Target size={20} /> Drone Registry</Link>
                    <Link to="/team" style={getLinkStyle('/team')}><Users size={20} /> Team & Settings</Link>
                </nav>

                {/* Блок користувача внизу */}
                <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid #1e293b' }}>
                    <button 
                        onClick={handleLogout}
                        style={{ 
                            width: '100%', background: 'none', border: 'none', color: '#fca5a5', 
                            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                            cursor: 'pointer', fontSize: '16px', fontWeight: '500'
                        }}
                    >
                        <LogOut size={20} /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main style={{ flex: 1, padding: '32px', overflowY: 'auto', height: '100vh', background: '#f8fafc' }}>
                <Outlet />
            </main>
        </div>
    );
};

export default Layout;
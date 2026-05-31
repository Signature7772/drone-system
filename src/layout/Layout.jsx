// Структурний каркас додатку з бічною панеллю та основним контентом
import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Map, FileText, Target, Activity, LogOut, Users, ChevronLeft, Menu } from 'lucide-react';
import { supabase } from '../supabaseClient';

const Layout = () => {
    const location = useLocation();
    // Стан для керування згорнутим/розгорнутим станом бічної панелі
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Функція для обробки виходу користувача
    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };

    // Функція для визначення стилю посилання
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
        fontWeight: '500',
        justifyContent: isCollapsed ? 'center' : 'flex-start' // Центруємо іконки при згортанні
    });

    // Основний рендер компонента з бічною панеллю та контентом
    return (
        <div style={{ display: 'flex', minHeight: '100vh', overflow: 'hidden' }}>
            {/* Sidebar */}
            <aside style={{ 
                width: isCollapsed ? '80px' : '260px', // Динамічна ширина
                transition: 'width 0.3s ease',
                background: '#0f172a', 
                color: 'white', 
                padding: isCollapsed ? '24px 10px' : '24px', 
                display: 'flex', 
                flexDirection: 'column',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'space-between', marginBottom: '40px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Activity color="#3b82f6" size={28} style={{ minWidth: '28px' }} />
                        {!isCollapsed && <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700', whiteSpace: 'nowrap' }}>DroneOS</h2>}
                    </div>
                    {/* Кнопка згортання/розгортання */}
                    <button 
                        onClick={() => setIsCollapsed(!isCollapsed)} 
                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', display: 'flex' }}
                    >
                        {isCollapsed ? <Menu size={24} /> : <ChevronLeft size={24} />}
                    </button>
                </div>

                <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    <Link to="/" style={getLinkStyle('/')} title="Dashboard">
                        <LayoutDashboard size={20} style={{ minWidth: '20px' }} /> {!isCollapsed && 'Dashboard'}
                    </Link>
                    <Link to="/missions" style={getLinkStyle('/missions')} title="Mission Planner">
                        <Map size={20} style={{ minWidth: '20px' }} /> {!isCollapsed && 'Mission Planner'}
                    </Link>
                    <Link to="/logbook" style={getLinkStyle('/logbook')} title="Logbook & Analysis">
                        <FileText size={20} style={{ minWidth: '20px' }} /> {!isCollapsed && 'Logbook & Analysis'}
                    </Link>
                    <Link to="/drones" style={getLinkStyle('/drones')} title="Drone Registry">
                        <Target size={20} style={{ minWidth: '20px' }} /> {!isCollapsed && 'Drone Registry'}
                    </Link>
                    <Link to="/team" style={getLinkStyle('/team')} title="Team & Settings">
                        <Users size={20} style={{ minWidth: '20px' }} /> {!isCollapsed && 'Team & Settings'}
                    </Link>
                </nav>

                <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid #1e293b' }}>
                    <button 
                        onClick={handleLogout}
                        title="Sign Out"
                        style={{ 
                            width: '100%', background: 'none', border: 'none', color: '#fca5a5', 
                            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
                            cursor: 'pointer', fontSize: '16px', fontWeight: '500',
                            justifyContent: isCollapsed ? 'center' : 'flex-start'
                        }}
                    >
                        <LogOut size={20} style={{ minWidth: '20px' }} /> {!isCollapsed && 'Sign Out'}
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
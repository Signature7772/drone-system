import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient'; 

import Layout from './layout/Layout';
import Missions from './pages/Missions'; 
import Logbook from './pages/Logbook';
import Drones from './pages/Drones';
import Auth from './pages/Auth'; 
import Team from './pages/Team';

const Dashboard = () => <div>Flight Statistics</div>;

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, company_id, role, email') // ОНОВЛЕНО: Тепер беремо всі потрібні дані
      .eq('id', userId)
      .single();
    
    if (data) {
      setProfile(data);
    } else {
      // Захист: якщо профілю раптом немає в базі, створюємо локальну заглушку для Onboarding
      setProfile({ id: userId, company_id: null });
    }
    setLoading(false);
  };

  if (loading) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Loading workspace...</div>;
  }

  // ОНОВЛЕНО: Якщо немає сесії АБО немає компанії -> гарантовано показуємо Auth/Onboarding
  if (!session || !profile?.company_id) {
    return <Auth session={session} />;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="missions" element={<Missions profile={profile} />} />
          <Route path="logbook" element={<Logbook profile={profile} />} />
          <Route path="drones" element={<Drones profile={profile} />} />
          {/* ВИПРАВЛЕНО: Team тепер знаходиться ВСЕРЕДИНІ Layout, тому бокове меню не зникатиме */}
          <Route path="team" element={<Team profile={profile} />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
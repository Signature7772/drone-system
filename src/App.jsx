// Головний вхідний вузол клієнтської частини
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient'; 

import Layout from './layout/Layout';
import Missions from './pages/Missions'; 
import Logbook from './pages/Logbook';
import Drones from './pages/Drones';
import Auth from './pages/Auth'; 
import Team from './pages/Team';
import Dashboard from './pages/Dashboard';

function App() {
  // Змінні стану
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Блок авторизації (useEffect та fetchProfile)
  useEffect(() => {
    // 1. Перевіряємо при старті, чи є збережена сесія
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });

    // 2. Слухаємо зміни (наприклад, якщо користувач натиснув "Вийти")
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
    // 3. Запит до таблиці profiles
    const { data, error } = await supabase
      .from('profiles')
      .select('id, company_id, role, email') 
      .eq('id', userId)
      .single();
    
    if (data) {
      setProfile(data);
    } else {
      setProfile({ id: userId, company_id: null });
    }
    setLoading(false);
  };

  // Блок захисту маршрутів
  if (loading) {
    return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Loading workspace...</div>;
  }

  if (!session || !profile?.company_id) {
    return <Auth session={session} />;
  }

  // Блок Маршрутизації
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard profile={profile} />} />
          <Route path="missions" element={<Missions profile={profile} />} />
          <Route path="logbook" element={<Logbook profile={profile} />} />
          <Route path="drones" element={<Drones profile={profile} />} />
          <Route path="team" element={<Team profile={profile} />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
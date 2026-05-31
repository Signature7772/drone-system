// Модуль автентифікації та реєстрації компанії
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Mail, Lock, Building2, KeyRound, LogIn, UserPlus, LogOut, Target } from 'lucide-react';

function Auth({ session }) {
    // Стан компонента
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLogin, setIsLogin] = useState(true);

    const [profile, setProfile] = useState(null);
    const [companyName, setCompanyName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [onboardingMode, setOnboardingMode] = useState('choice');

    useEffect(() => {
        if (session) {
            fetchProfile();
        }
    }, [session]);

    const fetchProfile = async () => {
        const { data, error } = await supabase
            .from('profiles')
            .select('*, companies(name)')
            .eq('id', session.user.id)
            .single();
            
        if (!error && data) {
            setProfile(data);
        }
    };

    // Базова Авторизація
    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        let error;

        if (isLogin) {
            const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
            error = signInError;
        } else {
            const { error: signUpError } = await supabase.auth.signUp({ email, password });
            error = signUpError;
            if (!error) alert('Success! You can now access your workspace.');
        }

        if (error) alert(error.message);
        setLoading(false);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.reload();
    };

    // Створення компанії (Адміністратор)
    const handleCreateCompany = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        // 1. Генеруємо випадковий код із 6 символів
        const newJoinCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        // 2. Створюємо запис компанії в БД
        const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .insert([{ name: companyName, join_code: newJoinCode }])
            .select()
            .single();

        if (companyError) {
            alert('Error creating company: ' + companyError.message);
            setLoading(false);
            return;
        }

        // 3. Зберігаємо профіль користувача як 'admin' цієї компанії
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({ 
                id: session.user.id, 
                email: session.user.email, 
                company_id: companyData.id, 
                role: 'admin' 
            });

        if (profileError) alert('Error updating profile: ' + profileError.message);
        else {
            alert(`Company created! Your Join Code is: ${newJoinCode}. Save it to invite pilots.`);
            window.location.reload(); 
        }
        setLoading(false);
    };

    // Приєднання до компанії (Пілот)
    const handleJoinCompany = async (e) => {
        e.preventDefault();
        setLoading(true);

        // 1. Шукаємо компанію за введеним кодом
        const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .select('id, name')
            .eq('join_code', joinCode)
            .single();

        if (companyError || !companyData) {
            alert('Invalid Join Code. Company not found.');
            setLoading(false);
            return;
        }

        // 3. Зберігаємо профіль користувача як 'pilot' цієї компанії
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({ 
                id: session.user.id, 
                email: session.user.email, 
                company_id: companyData.id, 
                role: 'pilot' 
            });

        if (profileError) alert('Error updating profile: ' + profileError.message);
        else {
            alert(`Successfully joined ${companyData.name}!`);
            window.location.reload();
        }
        setLoading(false);
    };

    // Екран онбордингу
    if (session && (!profile || !profile.company_id)) {
        return (
            <div style={pageContainerStyle}>
                <div style={{ ...authCardStyle, maxWidth: '500px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                        <h2 style={{ margin: '0 0 10px 0', color: '#0f172a' }}>Welcome to DroneFleet SaaS</h2>
                        <p style={{ color: '#64748b', margin: 0 }}>You need to setup your workspace before continuing.</p>
                    </div>

                    {onboardingMode === 'choice' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <button onClick={() => setOnboardingMode('create')} style={{ ...actionButtonStyle, background: '#3b82f6', color: 'white' }}>
                                <Building2 size={20} /> Create New Company Workspace (Admin)
                            </button>
                            <button onClick={() => setOnboardingMode('join')} style={{ ...actionButtonStyle, background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1' }}>
                                <KeyRound size={20} /> I have a Join Code (Pilot)
                            </button>
                            <button onClick={handleLogout} style={{ marginTop: '20px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                                <LogOut size={16} /> Sign out
                            </button>
                        </div>
                    )}

                    {onboardingMode === 'create' && (
                        <form onSubmit={handleCreateCompany} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <h3 style={{ margin: 0, textAlign: 'center', color: '#3b82f6' }}>Create Workspace</h3>
                            <div>
                                <label style={labelStyle}>Company Name</label>
                                <input required type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g., AgroTech LLC" style={inputStyle} />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="button" onClick={() => setOnboardingMode('choice')} style={{ ...buttonStyle, background: '#94a3b8', flex: 1 }}>Back</button>
                                <button type="submit" disabled={loading} style={{ ...buttonStyle, background: '#3b82f6', flex: 2 }}>{loading ? 'Creating...' : 'Create'}</button>
                            </div>
                        </form>
                    )}

                    {onboardingMode === 'join' && (
                        <form onSubmit={handleJoinCompany} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <h3 style={{ margin: 0, textAlign: 'center', color: '#64748b' }}>Join Workspace</h3>
                            <div>
                                <label style={labelStyle}>Join Code (provided by your Admin)</label>
                                <input required type="text" value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="e.g., AB12CD" style={{...inputStyle, textTransform: 'uppercase'}} />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button type="button" onClick={() => setOnboardingMode('choice')} style={{ ...buttonStyle, background: '#94a3b8', flex: 1 }}>Back</button>
                                <button type="submit" disabled={loading} style={{ ...buttonStyle, background: '#10b981', flex: 2 }}>{loading ? 'Joining...' : 'Join Company'}</button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    // Екран логіну та реєстрації
    if (!session) {
        return (
            <div style={pageContainerStyle}>
                <div style={authCardStyle}>
                    <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                        <div style={{ display: 'inline-flex', background: '#eff6ff', padding: '15px', borderRadius: '50%', marginBottom: '15px' }}>
                            <Target size={32} color="#3b82f6" />
                        </div>
                        <h2 style={{ margin: '0 0 10px 0', color: '#0f172a' }}>DroneFleet Cloud</h2>
                        <p style={{ color: '#64748b', margin: 0 }}>{isLogin ? 'Sign in to access your dashboard' : 'Create an account to get started'}</p>
                    </div>

                    <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <label style={labelStyle}>Email Address</label>
                            <div style={{ position: 'relative' }}>
                                <Mail size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" style={{ ...inputStyle, paddingLeft: '40px' }} />
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}>Password</label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                                <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={{ ...inputStyle, paddingLeft: '40px' }} />
                            </div>
                        </div>

                        <button type="submit" disabled={loading} style={{ ...buttonStyle, background: '#3b82f6', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '12px', marginTop: '10px' }}>
                            {isLogin ? <LogIn size={18}/> : <UserPlus size={18}/>}
                            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
                        </button>
                    </form>

                    <div style={{ textAlign: 'center', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                        <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
                            {isLogin ? "Don't have an account? " : "Already have an account? "}
                            <span onClick={() => setIsLogin(!isLogin)} style={{ color: '#3b82f6', fontWeight: 'bold', cursor: 'pointer' }}>
                                {isLogin ? 'Sign Up' : 'Sign In'}
                            </span>
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}

const pageContainerStyle = { height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' };
const authCardStyle = { background: 'white', padding: '40px', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', width: '100%', maxWidth: '400px' };
const labelStyle = { display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' };
const inputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none', boxSizing: 'border-box' };
const buttonStyle = { color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', transition: 'all 0.2s' };
const actionButtonStyle = { width: '100%', padding: '15px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '15px', fontSize: '16px', fontWeight: '600', border: 'none', cursor: 'pointer', transition: 'transform 0.1s' };

export default Auth;
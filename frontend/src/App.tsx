import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Globe, Settings, Database, FolderOpen, Shield, LogOut, Cpu, HardDrive, MemoryStick as Memory, File, FileArchive, Trash, Plus, Upload, ArrowLeft } from 'lucide-react';
import axios from 'axios';
import './index.css';
import './App.css';

const API_BASE = 'http://localhost:8006/api';

// Set up Axios interceptor for JWT
axios.interceptors.request.use((config) => {
    const token = localStorage.getItem('sangatta_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// Components
const Login = ({ setAuthenticated }: { setAuthenticated: (val: boolean) => void }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await axios.post(`${API_BASE}/auth/login`, { username, password });
            localStorage.setItem('sangatta_token', res.data.token);
            setAuthenticated(true);
            navigate('/');
        } catch (err) {
            setError('Invalid credentials');
        }
    };

    return (
        <div className="login-container">
            <div className="glass-panel login-panel">
                <div className="login-header">
                    <h2>Freeskoden Sangatta</h2>
                    <p>Webserver Control Panel</p>
                </div>
                {error && <div className="alert-error">{error}</div>}
                <form onSubmit={handleLogin}>
                    <div className="input-group">
                        <label>Username</label>
                        <input type="text" value={username} onChange={e => setUsername(e.target.value)} required />
                    </div>
                    <div className="input-group">
                        <label>Password</label>
                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                    </div>
                    <button type="submit" className="btn btn-primary" style={{width: '100%', marginTop: '10px'}}>
                        Secure Login
                    </button>
                </form>
            </div>
        </div>
    );
};

const Dashboard = () => {
    const [metrics, setMetrics] = useState<any>(null);

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const res = await axios.get(`${API_BASE}/system/metrics`);
                setMetrics(res.data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchMetrics();
        const interval = setInterval(fetchMetrics, 3000);
        return () => clearInterval(interval);
    }, []);

    if (!metrics) return <div className="loading">Loading system metrics...</div>;

    const formatBytes = (bytes: number) => (bytes / (1024 ** 3)).toFixed(2) + ' GB';

    return (
        <div className="dashboard">
            <header className="page-header">
                <h1>System Overview</h1>
                <p>OS: {metrics.os.distro} {metrics.os.release} ({metrics.os.platform})</p>
            </header>

            <div className="metrics-grid">
                <div className="glass-panel metric-card">
                    <div className="metric-header">
                        <Cpu className="metric-icon text-blue" />
                        <h3>CPU Load</h3>
                    </div>
                    <div className="metric-value">{metrics.cpu.load.toFixed(1)}%</div>
                    <div className="metric-sub">{metrics.cpu.cores} Cores</div>
                    <div className="progress-bar"><div className="progress-fill bg-blue" style={{width: `${metrics.cpu.load}%`}}></div></div>
                </div>

                <div className="glass-panel metric-card">
                    <div className="metric-header">
                        <Memory className="metric-icon text-green" />
                        <h3>Memory Usage</h3>
                    </div>
                    <div className="metric-value">{formatBytes(metrics.memory.used)}</div>
                    <div className="metric-sub">of {formatBytes(metrics.memory.total)}</div>
                    <div className="progress-bar">
                        <div className="progress-fill bg-green" style={{width: `${(metrics.memory.used / metrics.memory.total) * 100}%`}}></div>
                    </div>
                </div>

                <div className="glass-panel metric-card">
                    <div className="metric-header">
                        <HardDrive className="metric-icon text-warning" />
                        <h3>Disk Space</h3>
                    </div>
                    <div className="metric-value">{formatBytes(metrics.disk.used)}</div>
                    <div className="metric-sub">of {formatBytes(metrics.disk.total)}</div>
                    <div className="progress-bar">
                        <div className="progress-fill bg-warning" style={{width: `${metrics.disk.usePercent}%`}}></div>
                    </div>
                </div>
            </div>

            <div className="quick-actions">
                <div className="glass-panel">
                    <h3>Quick Actions</h3>
                    <div className="action-buttons">
                        <button className="btn btn-primary" onClick={() => axios.post(`${API_BASE}/services/restart`, {service: 'nginx'})}>Restart Nginx</button>
                        <button className="btn btn-primary" onClick={() => axios.post(`${API_BASE}/services/restart`, {service: 'php-fpm'})}>Restart PHP</button>
                        <button className="btn btn-primary" onClick={() => axios.post(`${API_BASE}/services/restart`, {service: 'mariadb'})}>Restart MariaDB</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const VHostManager = () => {
    const [vhosts, setVhosts] = useState<any[]>([]);
    const [newDomain, setNewDomain] = useState('');
    
    const fetchVHosts = async () => {
        try {
            const res = await axios.get(`${API_BASE}/vhosts`);
            setVhosts(res.data);
        } catch (e) { console.error(e); }
    };
    
    useEffect(() => { fetchVHosts(); }, []);
    
    const createVHost = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post(`${API_BASE}/vhosts`, { domain: newDomain });
            setNewDomain('');
            fetchVHosts();
        } catch (e) { alert('Failed to create VHost'); }
    };
    
    const deleteVHost = async (domain: string) => {
        if(!confirm(`Delete ${domain}?`)) return;
        try {
            await axios.delete(`${API_BASE}/vhosts/${domain}`);
            fetchVHosts();
        } catch (e) { alert('Failed to delete VHost'); }
    };

    return (
        <div className="page-container">
            <header className="page-header">
                <h1>Virtual Hosts</h1>
                <p>Manage Nginx server blocks</p>
            </header>
            
            <div className="glass-panel" style={{marginBottom: '24px'}}>
                <h3>Add New Virtual Host</h3>
                <form onSubmit={createVHost} style={{display: 'flex', gap: '12px', marginTop: '16px'}}>
                    <input 
                        type="text" 
                        placeholder="example.com" 
                        value={newDomain} 
                        onChange={e => setNewDomain(e.target.value)} 
                        className="input-group" 
                        style={{flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.2)', color: 'white'}}
                        required 
                    />
                    <button type="submit" className="btn btn-primary"><Plus size={18}/> Create</button>
                </form>
            </div>
            
            <div className="glass-panel">
                <table style={{width: '100%', textAlign: 'left', borderCollapse: 'collapse'}}>
                    <thead>
                        <tr style={{borderBottom: '1px solid var(--panel-border)'}}>
                            <th style={{padding: '12px'}}>Domain</th>
                            <th style={{padding: '12px'}}>Document Root</th>
                            <th style={{padding: '12px'}}>SSL</th>
                            <th style={{padding: '12px'}}>Status</th>
                            <th style={{padding: '12px'}}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {vhosts.length === 0 && <tr><td colSpan={5} style={{padding: '12px', textAlign: 'center'}}>No Virtual Hosts found.</td></tr>}
                        {vhosts.map(vh => (
                            <tr key={vh.domain} style={{borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                                <td style={{padding: '12px', fontWeight: 'bold'}}>{vh.domain}</td>
                                <td style={{padding: '12px', color: 'var(--text-secondary)'}}>{vh.root}</td>
                                <td style={{padding: '12px'}}>{vh.ssl ? 'Yes' : 'No'}</td>
                                <td style={{padding: '12px'}}><span style={{color: vh.status === 'active' ? 'var(--success-color)' : 'var(--danger-color)'}}>{vh.status}</span></td>
                                <td style={{padding: '12px'}}>
                                    <button className="btn btn-danger" onClick={() => deleteVHost(vh.domain)} style={{padding: '6px 10px'}}><Trash size={16}/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const FileManager = () => {
    const [currentPath, setCurrentPath] = useState('');
    const [items, setItems] = useState<any[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    const fetchFiles = async (path: string = '') => {
        try {
            const res = await axios.get(`${API_BASE}/files?path=${encodeURIComponent(path)}`);
            setCurrentPath(res.data.path);
            setItems(res.data.items);
        } catch (e) { console.error(e); }
    };

    useEffect(() => { fetchFiles(); }, []);

    const handleUpload = async () => {
        if (!selectedFile) return;
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('path', currentPath);
        
        setUploading(true);
        try {
            await axios.post(`${API_BASE}/files/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setSelectedFile(null);
            fetchFiles(currentPath);
        } catch (e) { alert('Upload failed'); }
        setUploading(false);
    };

    const handleUnzip = async (fileName: string) => {
        try {
            await axios.post(`${API_BASE}/files/unzip`, { path: currentPath, file: fileName });
            fetchFiles(currentPath);
        } catch (e) { alert('Unzip failed'); }
    };
    
    const goUp = () => {
        const parts = currentPath.split('/');
        parts.pop();
        fetchFiles(parts.join('/'));
    };

    return (
        <div className="page-container">
            <header className="page-header">
                <h1>File Manager</h1>
                <p>Path: {currentPath}</p>
            </header>

            <div className="glass-panel" style={{marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center'}}>
                <button className="btn" style={{background: 'rgba(255,255,255,0.1)', color: 'white'}} onClick={goUp}>
                    <ArrowLeft size={18}/> Up Directory
                </button>
                <div style={{flex: 1}}></div>
                <input type="file" onChange={e => setSelectedFile(e.target.files ? e.target.files[0] : null)} style={{color: 'var(--text-secondary)'}} />
                <button className="btn btn-primary" onClick={handleUpload} disabled={!selectedFile || uploading}>
                    <Upload size={18}/> {uploading ? 'Uploading...' : 'Upload'}
                </button>
            </div>

            <div className="glass-panel">
                <table style={{width: '100%', textAlign: 'left', borderCollapse: 'collapse'}}>
                    <thead>
                        <tr style={{borderBottom: '1px solid var(--panel-border)'}}>
                            <th style={{padding: '12px'}}>Name</th>
                            <th style={{padding: '12px'}}>Size</th>
                            <th style={{padding: '12px'}}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 && <tr><td colSpan={3} style={{padding: '12px', textAlign: 'center'}}>Directory is empty.</td></tr>}
                        {items.map(item => (
                            <tr key={item.name} style={{borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
                                <td style={{padding: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: item.isDirectory ? 'pointer' : 'default'}} onClick={() => item.isDirectory && fetchFiles(currentPath + '/' + item.name)}>
                                    {item.isDirectory ? <FolderOpen size={18} className="text-blue"/> : (item.name.endsWith('.zip') ? <FileArchive size={18} className="text-warning"/> : <File size={18} className="text-secondary"/>)}
                                    <span style={{fontWeight: item.isDirectory ? 'bold' : 'normal'}}>{item.name}</span>
                                </td>
                                <td style={{padding: '12px', color: 'var(--text-secondary)'}}>{item.isDirectory ? '-' : (item.size / 1024).toFixed(1) + ' KB'}</td>
                                <td style={{padding: '12px'}}>
                                    {item.name.endsWith('.zip') && (
                                        <button className="btn btn-primary" onClick={() => handleUnzip(item.name)} style={{padding: '4px 8px', fontSize: '0.8rem'}}>Extract</button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
const Sidebar = ({ setAuthenticated }: { setAuthenticated: (val: boolean) => void }) => {
    const location = useLocation();
    
    const navItems = [
        { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={20}/> },
        { path: '/vhosts', label: 'Virtual Hosts', icon: <Globe size={20}/> },
        { path: '/nginx', label: 'Nginx Config', icon: <Settings size={20}/> },
        { path: '/php', label: 'PHP Config', icon: <Settings size={20}/> },
        { path: '/database', label: 'MariaDB / pMA', icon: <Database size={20}/> },
        { path: '/files', label: 'File Manager', icon: <FolderOpen size={20}/> },
        { path: '/firewall', label: 'Firewall', icon: <Shield size={20}/> },
    ];

    const handleLogout = () => {
        localStorage.removeItem('sangatta_token');
        setAuthenticated(false);
    };

    return (
        <aside className="sidebar glass-panel">
            <div className="sidebar-brand">
                <div className="logo-circle">S</div>
                <h2>Sangatta</h2>
            </div>
            
            <nav className="sidebar-nav">
                {navItems.map(item => (
                    <Link 
                        key={item.path} 
                        to={item.path} 
                        className={`nav-link ${location.pathname === item.path ? 'active' : ''}`}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </Link>
                ))}
            </nav>

            <div className="sidebar-footer">
                <button className="btn btn-danger nav-link" onClick={handleLogout} style={{width: '100%', justifyContent: 'flex-start'}}>
                    <LogOut size={20}/>
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
};

const Placeholder = ({ title }: { title: string }) => (
    <div className="page-container">
        <header className="page-header">
            <h1>{title}</h1>
        </header>
        <div className="glass-panel">
            <p>This module is currently under construction in the Sangatta preview.</p>
        </div>
    </div>
);

// Main App Component
function App() {
    const [authenticated, setAuthenticated] = useState(!!localStorage.getItem('sangatta_token'));

    return (
        <Router>
            {authenticated ? (
                <div className="app-layout">
                    <Sidebar setAuthenticated={setAuthenticated} />
                    <main className="main-content">
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/vhosts" element={<VHostManager />} />
                            <Route path="/nginx" element={<Placeholder title="Nginx Configuration" />} />
                            <Route path="/php" element={<Placeholder title="PHP Configuration" />} />
                            <Route path="/database" element={<Placeholder title="Database Management" />} />
                            <Route path="/files" element={<FileManager />} />
                            <Route path="/firewall" element={<Placeholder title="Firewall & Security" />} />
                        </Routes>
                    </main>
                </div>
            ) : (
                <Routes>
                    <Route path="*" element={<Login setAuthenticated={setAuthenticated} />} />
                </Routes>
            )}
        </Router>
    );
}

export default App;

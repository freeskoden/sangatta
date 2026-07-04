const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const si = require('systeminformation');
const { exec } = require('child_process');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Load environment variables (or set defaults)
const PORT = process.env.PORT || 8006;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const NGINX_DIR = IS_PRODUCTION ? '/etc/nginx/sites-available' : path.join(__dirname, 'mock/nginx/sites-available');
const NGINX_ENABLED_DIR = IS_PRODUCTION ? '/etc/nginx/sites-enabled' : path.join(__dirname, 'mock/nginx/sites-enabled');
const WWW_DIR = IS_PRODUCTION ? '/var/www' : path.join(__dirname, 'mock/www');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // 50GB max
}));

// Mock Database (SQLite would go here)
// For simplicity in this demo, hardcode admin user (in a real app, hash password in DB)
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'sangatta';

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// API: Auth
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// API: System Metrics
app.get('/api/system/metrics', authenticateToken, async (req, res) => {
    try {
        const [cpu, mem, fsSize, os] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize(),
            si.osInfo()
        ]);

        const mainDisk = fsSize.find(d => d.mount === '/') || fsSize[0];

        res.json({
            cpu: {
                load: cpu.currentLoad,
                cores: cpu.cpus.length
            },
            memory: {
                total: mem.total,
                used: mem.active,
                free: mem.available
            },
            disk: {
                total: mainDisk.size,
                used: mainDisk.used,
                available: mainDisk.size - mainDisk.used,
                usePercent: mainDisk.use
            },
            os: {
                platform: os.platform,
                distro: os.distro,
                release: os.release
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Helper for Mock vs Real execution
const executeCommand = (cmd) => {
    return new Promise((resolve, reject) => {
        if (!IS_PRODUCTION) {
            console.log(`[MOCK EXEC]: ${cmd}`);
            return resolve(`Mock execution successful for: ${cmd}`);
        }
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(stderr || error.message);
            } else {
                resolve(stdout);
            }
        });
    });
};

// API: Virtual Hosts (Nginx Configs)
app.get('/api/vhosts', authenticateToken, (req, res) => {
    try {
        if (!fs.existsSync(NGINX_DIR)) return res.json([]);
        const files = fs.readdirSync(NGINX_DIR);
        const vhosts = files.map(file => {
            const configPath = path.join(NGINX_DIR, file);
            const content = fs.readFileSync(configPath, 'utf8');
            const isActive = fs.existsSync(path.join(NGINX_ENABLED_DIR, file));
            const rootMatch = content.match(/root\s+([^;]+);/);
            const ssl = content.includes('ssl_certificate');
            return {
                domain: file,
                root: rootMatch ? rootMatch[1] : '',
                ssl,
                status: isActive ? 'active' : 'inactive'
            };
        });
        res.json(vhosts);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/vhosts', authenticateToken, async (req, res) => {
    const { domain, root, enableSsl } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain required' });
    
    const docRoot = root || path.join(WWW_DIR, domain);
    try {
        // Create docroot if not exists
        if (!fs.existsSync(docRoot)) {
            fs.mkdirSync(docRoot, { recursive: true });
            fs.writeFileSync(path.join(docRoot, 'index.php'), `<?php echo "Hello from ${domain} on Sangatta!"; ?>`);
        }

        const configContent = `
server {
    listen 80;
    server_name ${domain} www.${domain};
    root ${docRoot};
    index index.php index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php-fpm.sock;
    }
}
`;
        fs.writeFileSync(path.join(NGINX_DIR, domain), configContent.trim());
        
        // Enable it
        try {
            fs.symlinkSync(path.join(NGINX_DIR, domain), path.join(NGINX_ENABLED_DIR, domain));
        } catch(e) { /* might already exist */ }
        
        await executeCommand('systemctl reload nginx');
        res.json({ message: 'Virtual host created' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/vhosts/:domain', authenticateToken, async (req, res) => {
    const { domain } = req.params;
    try {
        if (fs.existsSync(path.join(NGINX_ENABLED_DIR, domain))) {
            fs.unlinkSync(path.join(NGINX_ENABLED_DIR, domain));
        }
        if (fs.existsSync(path.join(NGINX_DIR, domain))) {
            fs.unlinkSync(path.join(NGINX_DIR, domain));
        }
        await executeCommand('systemctl reload nginx');
        res.json({ message: 'Virtual host deleted' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: File Manager
app.get('/api/files', authenticateToken, (req, res) => {
    const targetPath = req.query.path || WWW_DIR;
    // Prevent directory traversal
    const resolvedPath = path.resolve(targetPath);
    if (!resolvedPath.startsWith(WWW_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    
    try {
        const items = fs.readdirSync(resolvedPath, { withFileTypes: true });
        const result = items.map(item => {
            const stat = fs.statSync(path.join(resolvedPath, item.name));
            return {
                name: item.name,
                isDirectory: item.isDirectory(),
                size: stat.size,
                mtime: stat.mtime
            };
        });
        res.json({ path: resolvedPath, items: result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/files/upload', authenticateToken, (req, res) => {
    const targetPath = req.body.path || WWW_DIR;
    const resolvedPath = path.resolve(targetPath);
    if (!resolvedPath.startsWith(WWW_DIR)) return res.status(403).json({ error: 'Access denied' });

    if (!req.files || Object.keys(req.files).length === 0) {
        return res.status(400).json({ error: 'No files were uploaded.' });
    }

    const file = req.files.file;
    file.mv(path.join(resolvedPath, file.name), err => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'File uploaded successfully' });
    });
});

app.post('/api/files/zip', authenticateToken, async (req, res) => {
    const { path: dirPath, items, outputName } = req.body;
    const resolvedPath = path.resolve(dirPath);
    if (!resolvedPath.startsWith(WWW_DIR)) return res.status(403).json({ error: 'Access denied' });
    
    try {
        const itemNames = items.map(i => `"${i}"`).join(' ');
        await executeCommand(`cd "${resolvedPath}" && zip -r "${outputName}" ${itemNames}`);
        res.json({ message: 'Zip created' });
    } catch(e) {
        res.status(500).json({ error: e.toString() });
    }
});

app.post('/api/files/unzip', authenticateToken, async (req, res) => {
    const { path: dirPath, file } = req.body;
    const resolvedPath = path.resolve(dirPath);
    if (!resolvedPath.startsWith(WWW_DIR)) return res.status(403).json({ error: 'Access denied' });
    
    try {
        await executeCommand(`cd "${resolvedPath}" && unzip -o "${file}"`);
        res.json({ message: 'Unzipped successfully' });
    } catch(e) {
        res.status(500).json({ error: e.toString() });
    }
});

app.post('/api/services/restart', authenticateToken, async (req, res) => {
    const { service } = req.body;
    const allowedServices = ['nginx', 'php-fpm', 'mariadb', 'vsftpd', 'firewalld', 'ufw'];
    
    if (!allowedServices.includes(service)) {
        return res.status(400).json({ error: 'Invalid service' });
    }

    try {
        const result = await executeCommand(`systemctl restart ${service}`);
        res.json({ message: `${service} restarted`, details: result });
    } catch (e) {
        res.status(500).json({ error: e });
    }
});

// Serve Frontend Static Files
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Start Server
if (process.env.SSL_CERT && process.env.SSL_KEY) {
    try {
        const privateKey  = fs.readFileSync(process.env.SSL_KEY, 'utf8');
        const certificate = fs.readFileSync(process.env.SSL_CERT, 'utf8');
        const credentials = { key: privateKey, cert: certificate };
        
        const httpsServer = https.createServer(credentials, app);
        httpsServer.listen(PORT, () => {
            console.log(`Sangatta Secure API running on port ${PORT}`);
        });
    } catch (e) {
        console.error("Failed to start HTTPS, falling back to HTTP:", e.message);
        app.listen(PORT, () => {
            console.log(`Sangatta API running on port ${PORT} (HTTP Fallback)`);
        });
    }
} else {
    app.listen(PORT, () => {
        console.log(`Sangatta API running on port ${PORT} (HTTP Mode)`);
    });
}

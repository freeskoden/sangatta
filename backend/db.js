const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.NODE_ENV === 'production' ? '/opt/sangatta/data' : path.join(__dirname, 'mock/data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const VHOSTS_FILE = path.join(DATA_DIR, 'vhosts.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize users.json with default admin if it doesn't exist
if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = {
        'admin': {
            password: crypto.createHash('sha256').update('sangatta').digest('hex'), // In a real app use bcrypt
            role: 'admin'
        }
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 4));
}

// Initialize vhosts.json if it doesn't exist
if (!fs.existsSync(VHOSTS_FILE)) {
    fs.writeFileSync(VHOSTS_FILE, JSON.stringify({}, null, 4));
}

const getUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
const saveUsers = (users) => fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 4));

const getVHosts = () => JSON.parse(fs.readFileSync(VHOSTS_FILE, 'utf8'));
const saveVHosts = (vhosts) => fs.writeFileSync(VHOSTS_FILE, JSON.stringify(vhosts, null, 4));

const hashPassword = (password) => crypto.createHash('sha256').update(password).digest('hex');

module.exports = {
    getUsers,
    saveUsers,
    getVHosts,
    saveVHosts,
    hashPassword
};

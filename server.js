const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'data.json');

// Token admin depuis variable d'environnement (obligatoire en prod)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Rate limiting simple pour éviter le brute force
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_ATTEMPTS = 5;

function checkRateLimit(ip) {
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || [];
    const recentAttempts = attempts.filter(t => now - t < RATE_LIMIT_WINDOW);
    loginAttempts.set(ip, recentAttempts);
    return recentAttempts.length < MAX_ATTEMPTS;
}

function recordAttempt(ip) {
    const attempts = loginAttempts.get(ip) || [];
    attempts.push(Date.now());
    loginAttempts.set(ip, attempts);
}

// Middleware d'authentification admin
function requireAdmin(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Token requis' });
    }

    // Comparaison timing-safe pour éviter les timing attacks
    try {
        const tokenBuffer = Buffer.from(token);
        const adminBuffer = Buffer.from(ADMIN_TOKEN);

        if (tokenBuffer.length !== adminBuffer.length ||
            !crypto.timingSafeEqual(tokenBuffer, adminBuffer)) {
            return res.status(403).json({ error: 'Token invalide' });
        }
    } catch {
        return res.status(403).json({ error: 'Token invalide' });
    }

    next();
}

// S'assurer que le dossier data existe
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialiser le fichier de données s'il n'existe pas
function initDataFile() {
    if (!fs.existsSync(DATA_FILE)) {
        const initialData = {
            lapCount: 0,
            cagnotte: 0,
            lastUpdated: new Date().toISOString()
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
    }
}

initDataFile();

// Lire les données
function readData() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Erreur lecture data:', error);
        return { lapCount: 0, cagnotte: 0 };
    }
}

// Sauvegarder les données
function saveData(data) {
    try {
        data.lastUpdated = new Date().toISOString();
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Erreur sauvegarde data:', error);
        return false;
    }
}

// ============ API PUBLIQUES (lecture seule) ============

// GET - Récupérer toutes les données
app.get('/api/data', (req, res) => {
    const data = readData();
    res.json(data);
});

// ============ API ADMIN (authentifiées) ============

// POST - Vérifier le token admin
app.post('/api/admin/verify', (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;

    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Trop de tentatives, réessayez dans 1 minute' });
    }

    const { token } = req.body;

    if (!token) {
        recordAttempt(ip);
        return res.status(400).json({ error: 'Token requis' });
    }

    try {
        const tokenBuffer = Buffer.from(token);
        const adminBuffer = Buffer.from(ADMIN_TOKEN);

        if (tokenBuffer.length !== adminBuffer.length ||
            !crypto.timingSafeEqual(tokenBuffer, adminBuffer)) {
            recordAttempt(ip);
            return res.status(403).json({ error: 'Token invalide' });
        }
    } catch {
        recordAttempt(ip);
        return res.status(403).json({ error: 'Token invalide' });
    }

    res.json({ success: true });
});

// POST - Mettre à jour les données (admin)
app.post('/api/admin/data', requireAdmin, (req, res) => {
    const currentData = readData();
    const { lapCount, cagnotte } = req.body;

    if (lapCount !== undefined) {
        currentData.lapCount = Math.max(0, parseInt(lapCount) || 0);
    }
    if (cagnotte !== undefined) {
        currentData.cagnotte = Math.max(0, parseFloat(cagnotte) || 0);
    }

    if (saveData(currentData)) {
        res.json({ success: true, data: currentData });
    } else {
        res.status(500).json({ error: 'Erreur sauvegarde' });
    }
});

// POST - Incrémenter les longueurs (admin)
app.post('/api/admin/lap/add', requireAdmin, (req, res) => {
    const data = readData();
    const count = parseInt(req.body.count) || 1;
    data.lapCount = (data.lapCount || 0) + count;

    if (saveData(data)) {
        res.json({ success: true, lapCount: data.lapCount });
    } else {
        res.status(500).json({ error: 'Erreur sauvegarde' });
    }
});

// POST - Décrémenter les longueurs (admin)
app.post('/api/admin/lap/remove', requireAdmin, (req, res) => {
    const data = readData();
    const count = parseInt(req.body.count) || 1;
    data.lapCount = Math.max(0, (data.lapCount || 0) - count);

    if (saveData(data)) {
        res.json({ success: true, lapCount: data.lapCount });
    } else {
        res.status(500).json({ error: 'Erreur sauvegarde' });
    }
});

// POST - Set les longueurs (admin)
app.post('/api/admin/lap/set', requireAdmin, (req, res) => {
    const data = readData();
    data.lapCount = Math.max(0, parseInt(req.body.count) || 0);

    if (saveData(data)) {
        res.json({ success: true, lapCount: data.lapCount });
    } else {
        res.status(500).json({ error: 'Erreur sauvegarde' });
    }
});

// POST - Mettre à jour la cagnotte (admin)
app.post('/api/admin/cagnotte', requireAdmin, (req, res) => {
    const { amount } = req.body;
    const data = readData();
    data.cagnotte = Math.max(0, parseFloat(amount) || 0);

    if (saveData(data)) {
        res.json({ success: true, cagnotte: data.cagnotte });
    } else {
        res.status(500).json({ error: 'Erreur sauvegarde' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur démarré sur http://0.0.0.0:${PORT}`);
    if (ADMIN_TOKEN === 'changeme-in-production') {
        console.warn('⚠️  ATTENTION: Définissez ADMIN_TOKEN en production!');
    }
});

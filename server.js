const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'data.json');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changeme-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Index route -> donation-goals.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'donation-goals.html'));
});

// Rate limiting
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 60000;
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

// Middleware auth admin
function requireAdmin(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requis' });

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

// Data directory
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Donnees par defaut
const DEFAULT_DATA = {
    lapCount: 0,
    lapsDone: 0,
    cagnotte: 0,
    donations: [
        { id: 1, amount: 50, icon: "🍔", description: "Video degustation a regarder (1 minute) - Je regarde sans pouvoir manger !", special: false },
        { id: 2, amount: 100, icon: "🏊", description: "10 longueurs de piscine a faire !", special: false },
        { id: 3, amount: 200, icon: "🏊‍♂️", description: "20 longueurs de piscine - Double dose !", special: false },
        { id: 4, amount: 300, icon: "🚶", description: "500 metres de marche obligatoire", special: false },
        { id: 5, amount: 400, icon: "💪", description: "Gainage jusqu'a tomber ! Pas de limite !", special: false },
        { id: 6, amount: 500, icon: "💪", description: "TREND TIK-TOK a 3 nulle ! Pas de limite !", special: false },
        { id: 7, amount: 1000, icon: "🤝", description: "Je double la mise ! Je donne aussi 1000 EUR !", special: true }
    ],
    goals: [
        { id: 1, amount: 5000, icon: "🍕", description: "Je paie une ENORME pizza, je la sens et la regarde pendant 10 minutes... puis je la donne a la regie" },
        { id: 2, amount: 10000, icon: "🍽️", description: "Je paie le resto a un random et je le regarde manger devant moi" },
        { id: 3, amount: 15000, icon: "🍟", description: "Je commande un truc bien gras, je le sens... et je le donne a la regie" },
        { id: 4, amount: 20000, icon: "🚭", description: "Pas de clope pendant 24H ! Le defi commence..." },
        { id: 5, amount: 25000, icon: "🚫", description: "PAS DE CLOPE + PAS DE PUFF ! Le sevrage total !" }
    ],
    lastUpdated: new Date().toISOString()
};

function initDataFile() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
    } else {
        // Migration: ajouter champs manquants
        const data = readData();
        let updated = false;
        if (!data.donations) {
            data.donations = DEFAULT_DATA.donations;
            updated = true;
        }
        if (!data.goals) {
            data.goals = DEFAULT_DATA.goals;
            updated = true;
        }
        if (data.lapsDone === undefined) {
            data.lapsDone = 0;
            updated = true;
        }
        if (updated) saveData(data);
    }
}

initDataFile();

function readData() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
        return { ...DEFAULT_DATA };
    }
}

function saveData(data) {
    try {
        data.lastUpdated = new Date().toISOString();
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch {
        return false;
    }
}

function getNextId(items) {
    if (!items || items.length === 0) return 1;
    return Math.max(...items.map(i => i.id)) + 1;
}

// ============ API PUBLIQUES ============

app.get('/api/data', (req, res) => {
    const data = readData();
    res.json({
        lapCount: data.lapCount,
        lapsDone: data.lapsDone || 0,
        cagnotte: data.cagnotte,
        donations: data.donations,
        goals: data.goals,
        lastUpdated: data.lastUpdated
    });
});

// ============ AUTH ============

app.post('/api/admin/verify', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress;
    if (!checkRateLimit(ip)) {
        return res.status(429).json({ error: 'Trop de tentatives, reessayez dans 1 minute' });
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

// ============ ADMIN: LONGUEURS ============

app.post('/api/admin/lap/add', requireAdmin, (req, res) => {
    const data = readData();
    const count = parseInt(req.body.count) || 1;
    data.lapCount = (data.lapCount || 0) + count;
    if (saveData(data)) res.json({ success: true, lapCount: data.lapCount });
    else res.status(500).json({ error: 'Erreur sauvegarde' });
});

app.post('/api/admin/lap/remove', requireAdmin, (req, res) => {
    const data = readData();
    const count = parseInt(req.body.count) || 1;
    data.lapCount = Math.max(0, (data.lapCount || 0) - count);
    if (saveData(data)) res.json({ success: true, lapCount: data.lapCount });
    else res.status(500).json({ error: 'Erreur sauvegarde' });
});

app.post('/api/admin/lap/set', requireAdmin, (req, res) => {
    const data = readData();
    data.lapCount = Math.max(0, parseInt(req.body.count) || 0);
    if (saveData(data)) res.json({ success: true, lapCount: data.lapCount });
    else res.status(500).json({ error: 'Erreur sauvegarde' });
});

// ============ ADMIN: LONGUEURS FAITES ============

app.post('/api/admin/lapsdone/add', requireAdmin, (req, res) => {
    const data = readData();
    const count = parseInt(req.body.count) || 1;
    data.lapsDone = (data.lapsDone || 0) + count;
    if (saveData(data)) res.json({ success: true, lapsDone: data.lapsDone });
    else res.status(500).json({ error: 'Erreur sauvegarde' });
});

app.post('/api/admin/lapsdone/remove', requireAdmin, (req, res) => {
    const data = readData();
    const count = parseInt(req.body.count) || 1;
    data.lapsDone = Math.max(0, (data.lapsDone || 0) - count);
    if (saveData(data)) res.json({ success: true, lapsDone: data.lapsDone });
    else res.status(500).json({ error: 'Erreur sauvegarde' });
});

app.post('/api/admin/lapsdone/set', requireAdmin, (req, res) => {
    const data = readData();
    data.lapsDone = Math.max(0, parseInt(req.body.count) || 0);
    if (saveData(data)) res.json({ success: true, lapsDone: data.lapsDone });
    else res.status(500).json({ error: 'Erreur sauvegarde' });
});

// ============ ADMIN: CAGNOTTE ============

app.post('/api/admin/cagnotte', requireAdmin, (req, res) => {
    const data = readData();
    data.cagnotte = Math.max(0, parseFloat(req.body.amount) || 0);
    if (saveData(data)) res.json({ success: true, cagnotte: data.cagnotte });
    else res.status(500).json({ error: 'Erreur sauvegarde' });
});

// ============ ADMIN: DONATIONS ============

app.post('/api/admin/donations', requireAdmin, (req, res) => {
    const data = readData();
    const { amount, icon, description, special } = req.body;

    if (!amount || !description) {
        return res.status(400).json({ error: 'Montant et description requis' });
    }

    const newDonation = {
        id: getNextId(data.donations),
        amount: parseFloat(amount),
        icon: icon || "🎁",
        description,
        special: !!special
    };

    data.donations.push(newDonation);
    data.donations.sort((a, b) => a.amount - b.amount);

    if (saveData(data)) res.json({ success: true, donation: newDonation, donations: data.donations });
    else res.status(500).json({ error: 'Erreur sauvegarde' });
});

app.put('/api/admin/donations/:id', requireAdmin, (req, res) => {
    const data = readData();
    const id = parseInt(req.params.id);
    const index = data.donations.findIndex(d => d.id === id);

    if (index === -1) {
        return res.status(404).json({ error: 'Palier non trouve' });
    }

    const { amount, icon, description, special } = req.body;
    if (amount !== undefined) data.donations[index].amount = parseFloat(amount);
    if (icon !== undefined) data.donations[index].icon = icon;
    if (description !== undefined) data.donations[index].description = description;
    if (special !== undefined) data.donations[index].special = !!special;

    data.donations.sort((a, b) => a.amount - b.amount);

    if (saveData(data)) res.json({ success: true, donation: data.donations.find(d => d.id === id), donations: data.donations });
    else res.status(500).json({ error: 'Erreur sauvegarde' });
});

app.delete('/api/admin/donations/:id', requireAdmin, (req, res) => {
    const data = readData();
    const id = parseInt(req.params.id);
    const index = data.donations.findIndex(d => d.id === id);

    if (index === -1) {
        return res.status(404).json({ error: 'Palier non trouve' });
    }

    data.donations.splice(index, 1);

    if (saveData(data)) res.json({ success: true, donations: data.donations });
    else res.status(500).json({ error: 'Erreur sauvegarde' });
});

// ============ ADMIN: GOALS ============

app.post('/api/admin/goals', requireAdmin, (req, res) => {
    const data = readData();
    const { amount, icon, description } = req.body;

    if (!amount || !description) {
        return res.status(400).json({ error: 'Montant et description requis' });
    }

    const newGoal = {
        id: getNextId(data.goals),
        amount: parseFloat(amount),
        icon: icon || "🎯",
        description
    };

    data.goals.push(newGoal);
    data.goals.sort((a, b) => a.amount - b.amount);

    if (saveData(data)) res.json({ success: true, goal: newGoal, goals: data.goals });
    else res.status(500).json({ error: 'Erreur sauvegarde' });
});

app.put('/api/admin/goals/:id', requireAdmin, (req, res) => {
    const data = readData();
    const id = parseInt(req.params.id);
    const index = data.goals.findIndex(g => g.id === id);

    if (index === -1) {
        return res.status(404).json({ error: 'Objectif non trouve' });
    }

    const { amount, icon, description } = req.body;
    if (amount !== undefined) data.goals[index].amount = parseFloat(amount);
    if (icon !== undefined) data.goals[index].icon = icon;
    if (description !== undefined) data.goals[index].description = description;

    data.goals.sort((a, b) => a.amount - b.amount);

    if (saveData(data)) res.json({ success: true, goal: data.goals.find(g => g.id === id), goals: data.goals });
    else res.status(500).json({ error: 'Erreur sauvegarde' });
});

app.delete('/api/admin/goals/:id', requireAdmin, (req, res) => {
    const data = readData();
    const id = parseInt(req.params.id);
    const index = data.goals.findIndex(g => g.id === id);

    if (index === -1) {
        return res.status(404).json({ error: 'Objectif non trouve' });
    }

    data.goals.splice(index, 1);

    if (saveData(data)) res.json({ success: true, goals: data.goals });
    else res.status(500).json({ error: 'Erreur sauvegarde' });
});

// ============ START ============

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur demarre sur http://0.0.0.0:${PORT}`);
    if (ADMIN_TOKEN === 'changeme-in-production') {
        console.warn('ATTENTION: Definissez ADMIN_TOKEN en production!');
    }
});

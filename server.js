const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'data.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

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

// API Endpoints

// GET - Récupérer toutes les données
app.get('/api/data', (req, res) => {
    const data = readData();
    res.json(data);
});

// POST - Mettre à jour les données
app.post('/api/data', (req, res) => {
    const currentData = readData();
    const newData = { ...currentData, ...req.body };

    if (saveData(newData)) {
        res.json({ success: true, data: newData });
    } else {
        res.status(500).json({ success: false, error: 'Erreur sauvegarde' });
    }
});

// POST - Incrémenter les longueurs
app.post('/api/lap/add', (req, res) => {
    const data = readData();
    data.lapCount = (data.lapCount || 0) + 1;

    if (saveData(data)) {
        res.json({ success: true, lapCount: data.lapCount });
    } else {
        res.status(500).json({ success: false });
    }
});

// POST - Décrémenter les longueurs
app.post('/api/lap/remove', (req, res) => {
    const data = readData();
    if (data.lapCount > 0) {
        data.lapCount--;
    }

    if (saveData(data)) {
        res.json({ success: true, lapCount: data.lapCount });
    } else {
        res.status(500).json({ success: false });
    }
});

// POST - Reset les longueurs
app.post('/api/lap/reset', (req, res) => {
    const data = readData();
    data.lapCount = 0;

    if (saveData(data)) {
        res.json({ success: true, lapCount: 0 });
    } else {
        res.status(500).json({ success: false });
    }
});

// POST - Mettre à jour la cagnotte
app.post('/api/cagnotte', (req, res) => {
    const { amount } = req.body;
    const data = readData();
    data.cagnotte = amount;

    if (saveData(data)) {
        res.json({ success: true, cagnotte: data.cagnotte });
    } else {
        res.status(500).json({ success: false });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur démarré sur http://0.0.0.0:${PORT}`);
});

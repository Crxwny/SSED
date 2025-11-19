const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Upload-Verzeichnis erstellen falls nicht vorhanden
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ============================================
// SICHERHEITSKONFIGURATION
// ============================================

// Erlaubte MIME-Typen
const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'application/pdf',
    'text/plain'
];

// Erlaubte Dateiendungen
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.txt'];

// Maximale Dateigröße (5 MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB in Bytes

// Rate Limiting (einfache Implementierung)
const uploadAttempts = new Map();
const MAX_UPLOADS_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 Minute

// ============================================
// HELPER-FUNKTIONEN FÜR SICHERHEIT
// ============================================

/**
 * Prüft ob der Dateiname sicher ist (kein Path Traversal)
 */
function sanitizeFileName(fileName) {
    // Entferne gefährliche Zeichen und Path Traversal
    let sanitized = fileName
        .replace(/[^a-zA-Z0-9._-]/g, '_') // Ersetze ungültige Zeichen
        .replace(/\.\./g, '') // Entferne Path Traversal
        .replace(/^\.+/, '') // Entferne führende Punkte
        .trim();
    
    // Füge einen zufälligen Hash hinzu um Kollisionen zu vermeiden
    const hash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(sanitized);
    const nameWithoutExt = path.basename(sanitized, ext);
    
    return `${nameWithoutExt}_${hash}${ext}`;
}

/**
 * Prüft ob der MIME-Type erlaubt ist
 */
function isAllowedMimeType(mimetype) {
    return ALLOWED_MIME_TYPES.includes(mimetype);
}

/**
 * Prüft ob die Dateiendung erlaubt ist
 */
function isAllowedExtension(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
}

/**
 * Rate Limiting Prüfung
 */
function checkRateLimit(ip) {
    const now = Date.now();
    const userAttempts = uploadAttempts.get(ip) || [];
    
    // Entferne alte Einträge außerhalb des Zeitfensters
    const recentAttempts = userAttempts.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    
    if (recentAttempts.length >= MAX_UPLOADS_PER_MINUTE) {
        return false; // Rate Limit überschritten
    }
    
    // Füge neuen Versuch hinzu
    recentAttempts.push(now);
    uploadAttempts.set(ip, recentAttempts);
    
    return true; // OK
}

/**
 * Prüft die Dateigröße
 */
function checkFileSize(file) {
    return file.size <= MAX_FILE_SIZE;
}

// ============================================
// MULTER KONFIGURATION
// ============================================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Sichere Dateinamen-Generierung
        const sanitized = sanitizeFileName(file.originalname);
        cb(null, sanitized);
    }
});

// Multer Upload Middleware mit Validierung
const upload = multer({
    storage: storage,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1 // Nur eine Datei pro Request
    },
    fileFilter: function (req, file, cb) {
        // Prüfe Dateiendung
        if (!isAllowedExtension(file.originalname)) {
            return cb(new Error(`Dateityp nicht erlaubt. Erlaubte Typen: ${ALLOWED_EXTENSIONS.join(', ')}`));
        }
        
        // Prüfe MIME-Type
        if (!isAllowedMimeType(file.mimetype)) {
            return cb(new Error(`MIME-Type nicht erlaubt. Erlaubte Typen: ${ALLOWED_MIME_TYPES.join(', ')}`));
        }
        
        cb(null, true);
    }
});

// ============================================
// MIDDLEWARE
// ============================================

// Trust Proxy für korrekte IP-Erkennung hinter Proxy/Reverse Proxy
app.set('trust proxy', true);

// Body Parser für JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Extrahiert die Client-IP-Adresse aus dem Request
 */
function getClientIp(req) {
    return req.ip || 
           req.headers['x-forwarded-for']?.split(',')[0].trim() || 
           req.headers['x-real-ip'] || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress ||
           'unknown';
}

// Rate Limiting Middleware - nur für POST-Requests
app.use('/upload', (req, res, next) => {
    // Nur für POST-Requests Rate Limiting anwenden
    if (req.method !== 'POST') {
        return next();
    }
    
    const clientIp = getClientIp(req);
    
    if (!checkRateLimit(clientIp)) {
        return res.status(429).json({
            success: false,
            error: 'Zu viele Upload-Versuche. Bitte versuchen Sie es später erneut.'
        });
    }
    
    next();
});

// ============================================
// ROUTES
// ============================================

// Hauptseite
app.get('/', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'index.html'));
});

// Upload-Endpoint mit Error-Handling
app.post('/upload', (req, res, next) => {
    console.log('Upload Request received');
    // Stelle sicher, dass Content-Type für JSON-Antworten gesetzt ist
    res.setHeader('Content-Type', 'application/json');
    
    // Timeout-Handler - stelle sicher, dass immer eine Antwort gesendet wird
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            console.error('Upload timeout');
            res.status(500).json({
                success: false,
                error: 'Upload-Timeout: Die Anfrage hat zu lange gedauert'
            });
        }
    }, 30000); // 30 Sekunden Timeout
    
    // Timeout löschen wenn Antwort gesendet wird
    const originalEnd = res.end;
    res.end = function(...args) {
        clearTimeout(timeout);
        originalEnd.apply(this, args);
    };
    
    upload.single('file')(req, res, function(err) {
        if (err) {
            console.error('Multer Error:', err);
            // Multer-Fehler behandeln
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        success: false,
                        error: `Datei zu groß. Maximale Größe: ${MAX_FILE_SIZE / (1024 * 1024)} MB`
                    });
                }
                return res.status(400).json({
                    success: false,
                    error: 'Upload-Fehler: ' + err.message
                });
            }
            // fileFilter oder andere Fehler
            return res.status(400).json({
                success: false,
                error: err.message || 'Fehler beim Hochladen der Datei'
            });
        }
        // Kein Fehler, weiter zum nächsten Handler
        console.log('Multer success, file:', req.file ? req.file.originalname : 'no file');
        next();
    });
}, (req, res) => {
    console.log('Upload handler called, file:', req.file ? req.file.originalname : 'no file');
    // Stelle sicher, dass Content-Type für JSON-Antworten gesetzt ist
    res.setHeader('Content-Type', 'application/json');
    
    try {
        // Zusätzliche Validierung nach dem Upload
        if (!req.file) {
            console.log('No file in request');
            return res.status(400).json({
                success: false,
                error: 'Keine Datei hochgeladen'
            });
        }

        // Zusätzliche Größenprüfung
        if (!checkFileSize(req.file)) {
            // Datei löschen falls zu groß
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                error: `Datei zu groß. Maximale Größe: ${MAX_FILE_SIZE / (1024 * 1024)} MB`
            });
        }

        // Erfolgreiche Antwort
        console.log('Upload successful:', req.file.filename);
        res.json({
            success: true,
            message: 'Datei erfolgreich hochgeladen',
            file: {
                originalName: req.file.originalname,
                filename: req.file.filename,
                size: req.file.size,
                mimetype: req.file.mimetype,
                path: `/uploads/${req.file.filename}`
            }
        });
    } catch (error) {
        console.error('Upload-Fehler:', error);
        
        // Datei löschen bei Fehler
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({
            success: false,
            error: 'Fehler beim Hochladen der Datei: ' + error.message
        });
    }
});

// Dateien anzeigen (geschützt)
app.get('/uploads/:filename', (req, res) => {
    const filename = sanitizeFileName(req.params.filename);
    const filePath = path.join(uploadDir, filename);
    
    // Prüfe ob Datei existiert und im Upload-Verzeichnis liegt
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            error: 'Datei nicht gefunden'
        });
    }
    
    // Prüfe Path Traversal
    const resolvedPath = path.resolve(filePath);
    const resolvedDir = path.resolve(uploadDir);
    if (!resolvedPath.startsWith(resolvedDir)) {
        return res.status(403).json({
            success: false,
            error: 'Zugriff verweigert'
        });
    }
    
    res.sendFile(path.resolve(filePath));
});

// Liste der hochgeladenen Dateien (optional, für Demo)
app.get('/api/files', (req, res) => {
    try {
        const files = fs.readdirSync(uploadDir)
            .map(filename => {
                const filePath = path.join(uploadDir, filename);
                const stats = fs.statSync(filePath);
                return {
                    filename: filename,
                    size: stats.size,
                    uploaded: stats.mtime
                };
            });
        
        res.json({
            success: true,
            files: files
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Fehler beim Lesen der Dateien'
        });
    }
});

// Statische Dateien werden nicht benötigt, da index.html bereits über die Route serviert wird
// Die statische Middleware könnte die /upload Route blockieren

// Globaler Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Interner Serverfehler'
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route nicht gefunden'
    });
});

// Server starten
app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
    console.log(`Upload-Verzeichnis: ${uploadDir}`);
    console.log(`Erlaubte Dateitypen: ${ALLOWED_EXTENSIONS.join(', ')}`);
    console.log(`Maximale Dateigröße: ${MAX_FILE_SIZE / (1024 * 1024)} MB`);
});


# Datei-Upload Server mit Sicherheitsmaßnahmen

Ein sicherer Node.js File-Upload Server mit umfassenden Sicherheitsmaßnahmen auf Client- und Server-Seite.

## Installation

1. Dependencies installieren:
```bash
npm install
```

## Server starten

```bash
npm start
```

Der Server läuft dann auf `http://localhost:3000`

## Funktionen

### Client-seitige Sicherheitsmaßnahmen:
- ✅ Dateityp-Validierung (nur JPG, PNG, GIF, PDF, TXT)
- ✅ Dateigrößen-Prüfung (max. 5 MB)
- ✅ Parsley.js Validierung
- ✅ HTML-Escape für sichere Anzeige
- ✅ Drag & Drop Support
- ✅ Upload-Progress Anzeige

### Server-seitige Sicherheitsmaßnahmen:
- ✅ MIME-Type Validierung
- ✅ Dateiendungs-Prüfung
- ✅ Dateigrößen-Limit (5 MB)
- ✅ Path Traversal Schutz
- ✅ Dateinamen-Sanitization
- ✅ Rate Limiting (10 Uploads pro Minute)
- ✅ Sichere Dateispeicherung
- ✅ Fehlerbehandlung und Cleanup

## Erlaubte Dateitypen

- Bilder: JPG, PNG, GIF
- Dokumente: PDF, TXT

## Maximale Dateigröße

5 MB pro Datei

## API Endpoints

- `GET /` - Hauptseite mit Upload-Formular
- `POST /upload` - Datei hochladen
- `GET /uploads/:filename` - Hochgeladene Datei anzeigen
- `GET /api/files` - Liste aller hochgeladenen Dateien

## Sicherheitshinweise

- Alle hochgeladenen Dateien werden im `uploads/` Verzeichnis gespeichert
- Dateinamen werden automatisch sanitized und mit einem Hash versehen
- Path Traversal Angriffe werden verhindert
- Rate Limiting schützt vor DDoS-Angriffen


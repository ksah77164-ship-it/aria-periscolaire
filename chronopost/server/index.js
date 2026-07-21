// ==========================================================================
//  index.js — Serveur d'expédition Chronopost (zéro dépendance externe).
//
//  Expose : POST /api/shipping  -> génère l'étiquette + le n° de suivi
//           GET  /health        -> état du serveur (mode démo/réel)
//
//  Le mot de passe API reste ici (serveur) et n'est jamais exposé au navigateur.
//  Lancement :  node index.js   (Node >= 18)
// ==========================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSoapEnvelope, parseSoapResponse, normalizePayload } from './chronopost.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Chargement minimal du .env (pas de dépendance dotenv) ---
function loadEnv() {
  const env = { ...process.env };
  const f = path.join(__dirname, '.env');
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) {
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (env[m[1]] === undefined) env[m[1]] = v;
      }
    }
  }
  return env;
}
const env = loadEnv();
const MOCK = String(env.MOCK_MODE ?? 'true').toLowerCase() !== 'false';
const PORT = parseInt(env.PORT || '8787', 10);
const ORIGIN = env.ALLOWED_ORIGIN || '*';

// Compteur de démo (n° de suivi factice, déterministe)
let mockSeq = 1000;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function sendJSON(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function callChronopost(payload) {
  const soap = buildSoapEnvelope(payload);
  const resp = await fetch(env.CHRONO_WS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': '' },
    body: soap,
  });
  const text = await resp.text();
  if (!resp.ok && !text.includes('Envelope')) {
    return { ok: false, errorCode: 'HTTP_' + resp.status, errorMessage: text.slice(0, 300) };
  }
  return parseSoapResponse(text);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && req.url === '/health') {
    return sendJSON(res, 200, { ok: true, mode: MOCK ? 'demo' : 'reel', configured: !!env.CHRONO_ACCOUNT });
  }

  if (req.method === 'POST' && req.url === '/api/shipping') {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', async () => {
      let body;
      try { body = JSON.parse(raw || '{}'); }
      catch { return sendJSON(res, 400, { ok: false, error: 'JSON invalide' }); }

      const norm = normalizePayload(body, env);
      if (norm.errors) return sendJSON(res, 422, { ok: false, error: 'Champs manquants', missing: norm.errors });

      // --- Mode démo : pas d'appel réel ---
      if (MOCK) {
        mockSeq++;
        const tracking = 'XX' + String(mockSeq).padStart(11, '0') + 'FR';
        return sendJSON(res, 200, {
          ok: true, mode: 'demo', tracking,
          labelBase64: null,
          message: 'Mode DÉMO : numéro simulé. Passez MOCK_MODE=false avec vos identifiants pour l\'étiquette réelle.'
        });
      }

      // --- Mode réel ---
      if (!env.CHRONO_ACCOUNT || !env.CHRONO_PASSWORD) {
        return sendJSON(res, 500, { ok: false, error: 'Identifiants Chronopost manquants dans .env' });
      }
      try {
        const result = await callChronopost(norm.data);
        if (!result.ok) return sendJSON(res, 502, { ok: false, error: result.errorMessage, code: result.errorCode });
        return sendJSON(res, 200, { ok: true, mode: 'reel', tracking: result.tracking, labelBase64: result.labelBase64 || null });
      } catch (e) {
        return sendJSON(res, 502, { ok: false, error: 'Appel Chronopost impossible : ' + e.message });
      }
    });
    return;
  }

  sendJSON(res, 404, { ok: false, error: 'Route inconnue' });
});

server.listen(PORT, () => {
  console.log(`Serveur d'expédition Chronopost sur http://localhost:${PORT}`);
  console.log(`Mode : ${MOCK ? 'DÉMO (aucun appel réel)' : 'RÉEL (API Chronopost)'}`);
});

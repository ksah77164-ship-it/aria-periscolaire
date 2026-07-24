// ==========================================================================
//  index.js — Serveur de l'application "Bordereaux Chronopost" (multi-utilisateurs).
//
//  - Comptes (connexion identifiant / mot de passe)
//  - Base de données partagée (store.js) : tout le monde voit la même chose
//  - Commandes rangées par jour
//  - Génération étiquette + n° de suivi via l'API Chronopost (chronopost.js)
//  - Sert aussi l'interface web (dossier ../app)
//
//  Node >= 18.  Lancement : node index.js
// ==========================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, save, nextId } from './store.js';
import { hashPassword, verifyPassword, newToken } from './auth.js';
import { buildSoapEnvelope, parseSoapResponse, normalizePayload } from './chronopost.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, '..', 'app');

// --- .env minimal ---
function loadEnv() {
  const env = { ...process.env };
  const f = path.join(__dirname, '.env');
  if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (env[m[1]] === undefined) env[m[1]] = v;
    }
  }
  return env;
}
const env = loadEnv();
const MOCK = String(env.MOCK_MODE ?? 'true').toLowerCase() !== 'false';
const PORT = parseInt(env.PORT || '8787', 10);
const ORIGIN = env.ALLOWED_ORIGIN || '*';

// --- Premier lancement : crée le compte administrateur ---
function seed() {
  const d = db();
  if (d.users.length === 0) {
    const username = env.ADMIN_USER || 'admin';
    const password = env.ADMIN_PASSWORD || 'alber2026';
    d.users.push({ id: nextId('u'), username, name: 'Administrateur', role: 'admin', pass: hashPassword(password) });
    if (!d.sender) d.sender = { nom: 'Alber Alber', soc: '', adr: '', adr2: '', cp: '', ville: '', tel: '', mail: '' };
    save();
    console.log(`Compte admin créé → identifiant: "${username}"  mot de passe: "${password}"  (à changer)`);
  }
}
seed();

const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

// ---------- utilitaires HTTP ----------
function cors(res){ res.setHeader('Access-Control-Allow-Origin',ORIGIN); res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization'); }
function json(res,code,obj){ cors(res); res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(obj)); }
function body(req){ return new Promise((ok)=>{ let r=''; req.on('data',c=>{ r+=c; if(r.length>2e6) req.destroy(); }); req.on('end',()=>{ try{ ok(JSON.parse(r||'{}')); }catch{ ok(null); } }); }); }
function userFromReq(req){
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const sess = db().sessions[token];
  if(!sess) return null;
  return db().users.find(u=>u.id===sess.userId) || null;
}
const pub = u => u && ({ id:u.id, username:u.username, name:u.name, role:u.role });

// ---------- expédition Chronopost ----------
async function callChronopost(payload){
  const soap = buildSoapEnvelope(payload);
  const resp = await fetch(env.CHRONO_WS_URL, { method:'POST', headers:{'Content-Type':'text/xml; charset=utf-8','SOAPAction':''}, body:soap });
  const text = await resp.text();
  if(!resp.ok && !text.includes('Envelope')) return { ok:false, errorCode:'HTTP_'+resp.status, errorMessage:text.slice(0,300) };
  return parseSoapResponse(text);
}
let mockSeq = 1000;
async function shipOrder(order){
  const d = db();
  const payload = { sender:d.sender, dest:order.dest, poids:order.poids, valeur:order.valeur, ref:order.ref, contenu:order.contenu, service:order.service };
  if(MOCK){ mockSeq++; return { ok:true, mode:'demo', tracking:'XX'+String(mockSeq).padStart(11,'0')+'FR', labelBase64:null }; }
  if(!env.CHRONO_ACCOUNT || !env.CHRONO_PASSWORD) return { ok:false, error:'Identifiants Chronopost manquants (.env)' };
  const norm = normalizePayload(payload, env);
  if(norm.errors) return { ok:false, error:'Champs manquants', missing:norm.errors };
  const r = await callChronopost(norm.data);
  if(!r.ok) return { ok:false, error:r.errorMessage, code:r.errorCode };
  return { ok:true, mode:'reel', tracking:r.tracking, labelBase64:r.labelBase64||null };
}

// ---------- fichiers statiques (l'app) ----------
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
function serveStatic(req,res){
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if(rel==='/'||rel==='') rel='/index.html';
  const file = path.join(APP_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/,''));
  if(!file.startsWith(APP_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){
    // SPA fallback
    const idx = path.join(APP_DIR,'index.html');
    if(fs.existsSync(idx)){ res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}); return res.end(fs.readFileSync(idx)); }
    res.writeHead(404); return res.end('Not found');
  }
  res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});
  res.end(fs.readFileSync(file));
}

// ---------- routeur ----------
const server = http.createServer(async (req,res)=>{
  const url = req.url.split('?')[0];
  const q = new URLSearchParams(req.url.split('?')[1]||'');
  if(req.method==='OPTIONS'){ cors(res); res.writeHead(204); return res.end(); }

  // ----- API -----
  if(url.startsWith('/api/')){
    if(url==='/api/health' && req.method==='GET') return json(res,200,{ ok:true, mode:MOCK?'demo':'reel', configured:!!env.CHRONO_ACCOUNT });

    // connexion
    if(url==='/api/login' && req.method==='POST'){
      const b = await body(req); if(!b) return json(res,400,{ok:false,error:'JSON invalide'});
      const u = db().users.find(x=>x.username.toLowerCase()===String(b.username||'').toLowerCase());
      if(!u || !verifyPassword(b.password, u.pass)) return json(res,401,{ok:false,error:'Identifiant ou mot de passe incorrect'});
      const token = newToken(); db().sessions[token] = { userId:u.id, since:Date.now() }; await save();
      return json(res,200,{ ok:true, token, user:pub(u) });
    }

    // à partir d'ici : authentification requise
    const me = userFromReq(req);
    if(!me) return json(res,401,{ok:false,error:'Non connecté'});

    if(url==='/api/logout' && req.method==='POST'){
      const h=req.headers['authorization']||''; const t=h.startsWith('Bearer ')?h.slice(7):''; delete db().sessions[t]; await save();
      return json(res,200,{ok:true});
    }
    if(url==='/api/me' && req.method==='GET') return json(res,200,{ ok:true, user:pub(me) });

    // paramètres partagés (expéditeur + connexion API)
    if(url==='/api/settings' && req.method==='GET') return json(res,200,{ ok:true, sender:db().sender, config:db().config, mode:MOCK?'demo':'reel' });
    if(url==='/api/settings' && req.method==='PUT'){
      if(me.role!=='admin') return json(res,403,{ok:false,error:'Réservé à l\'administrateur'});
      const b = await body(req); if(!b) return json(res,400,{ok:false,error:'JSON invalide'});
      if(b.sender) db().sender = b.sender;
      if(b.config) db().config = { ...db().config, ...b.config };
      await save(); return json(res,200,{ ok:true, sender:db().sender, config:db().config });
    }

    // utilisateurs (admin)
    if(url==='/api/users' && req.method==='GET'){
      if(me.role!=='admin') return json(res,403,{ok:false,error:'Réservé à l\'administrateur'});
      return json(res,200,{ ok:true, users: db().users.map(pub) });
    }
    if(url==='/api/users' && req.method==='POST'){
      if(me.role!=='admin') return json(res,403,{ok:false,error:'Réservé à l\'administrateur'});
      const b = await body(req); if(!b||!b.username||!b.password) return json(res,422,{ok:false,error:'Identifiant et mot de passe requis'});
      if(db().users.some(u=>u.username.toLowerCase()===String(b.username).toLowerCase())) return json(res,409,{ok:false,error:'Cet identifiant existe déjà'});
      const u = { id:nextId('u'), username:String(b.username).trim(), name:(b.name||b.username).trim(), role:b.role==='admin'?'admin':'membre', pass:hashPassword(b.password) };
      db().users.push(u); await save(); return json(res,200,{ ok:true, user:pub(u) });
    }
    if(url.match(/^\/api\/users\/[^/]+$/) && req.method==='DELETE'){
      if(me.role!=='admin') return json(res,403,{ok:false,error:'Réservé à l\'administrateur'});
      const id = url.split('/').pop();
      if(id===me.id) return json(res,400,{ok:false,error:'Impossible de supprimer votre propre compte'});
      db().users = db().users.filter(u=>u.id!==id); await save(); return json(res,200,{ok:true});
    }

    // commandes (par jour)
    if(url==='/api/orders' && req.method==='GET'){
      const date = q.get('date') || todayStr();
      const list = db().orders.filter(o=>o.date===date).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      return json(res,200,{ ok:true, date, orders:list });
    }
    if(url==='/api/orders/days' && req.method==='GET'){
      const days = {};
      for(const o of db().orders){ days[o.date] ??= {date:o.date,total:0,expedie:0}; days[o.date].total++; if(o.status==='expedie') days[o.date].expedie++; }
      return json(res,200,{ ok:true, days:Object.values(days).sort((a,b)=>b.date.localeCompare(a.date)) });
    }
    if(url==='/api/contacts' && req.method==='GET'){
      const seen = new Map();
      for(const o of db().orders){
        const d=o.dest, key=((d.nom||'')+'|'+(d.cp||'')+'|'+(d.adr||'')).toLowerCase();
        if(d.nom && !seen.has(key)) seen.set(key, d);
      }
      return json(res,200,{ ok:true, contacts:[...seen.values()] });
    }
    if(url==='/api/orders' && req.method==='POST'){
      const b = await body(req); if(!b) return json(res,400,{ok:false,error:'JSON invalide'});
      const dest = b.dest||{};
      if(!dest.nom||!dest.adr||!dest.cp||!dest.ville) return json(res,422,{ok:false,error:'Destinataire : nom, adresse, CP, ville requis'});
      const o = {
        id:nextId('o'), date:b.date||todayStr(), createdAt:new Date().toISOString(), createdBy:me.name,
        dest:{ nom:dest.nom||'',soc:dest.soc||'',adr:dest.adr||'',adr2:dest.adr2||'',cp:dest.cp||'',ville:dest.ville||'',pays:dest.pays||'France',tel:dest.tel||'',mail:dest.mail||'' },
        poids:b.poids||'', contenu:b.contenu||'Vêtements', valeur:b.valeur||'', ref:b.ref||'', service:b.service||'Chrono 18', instr:b.instr||'',
        status:'a_preparer', tracking:null, labelB64:null
      };
      db().orders.push(o); await save(); return json(res,200,{ ok:true, order:o });
    }
    const om = url.match(/^\/api\/orders\/([^/]+)$/);
    if(om && req.method==='PUT'){
      const o = db().orders.find(x=>x.id===om[1]); if(!o) return json(res,404,{ok:false,error:'Commande introuvable'});
      const b = await body(req)||{};
      if(b.dest) o.dest = { ...o.dest, ...b.dest };
      for(const k of ['poids','contenu','valeur','ref','service','instr','date']) if(b[k]!==undefined) o[k]=b[k];
      if(b.tracking!==undefined){ o.tracking = b.tracking ? String(b.tracking).trim() : null; o.status = o.tracking ? 'expedie' : 'a_preparer'; }
      await save(); return json(res,200,{ ok:true, order:o });
    }
    if(om && req.method==='DELETE'){
      db().orders = db().orders.filter(x=>x.id!==om[1]); await save(); return json(res,200,{ok:true});
    }
    const sm = url.match(/^\/api\/orders\/([^/]+)\/ship$/);
    if(sm && req.method==='POST'){
      const o = db().orders.find(x=>x.id===sm[1]); if(!o) return json(res,404,{ok:false,error:'Commande introuvable'});
      if(!db().sender || !db().sender.nom) return json(res,400,{ok:false,error:'Configurez d\'abord l\'expéditeur (Réglages)'});
      const r = await shipOrder(o);
      if(!r.ok) return json(res,502,r);
      o.tracking = r.tracking; o.labelB64 = r.labelBase64||null; o.status='expedie'; o.shippedAt=new Date().toISOString();
      await save(); return json(res,200,{ ok:true, order:o, mode:r.mode });
    }

    return json(res,404,{ok:false,error:'Route API inconnue'});
  }

  // ----- interface web -----
  if(req.method==='GET') return serveStatic(req,res);
  res.writeHead(405); res.end();
});

server.listen(PORT, ()=>{
  console.log(`App Bordereaux Chronopost → http://localhost:${PORT}`);
  console.log(`Mode expédition : ${MOCK?'DÉMO (aucun appel réel)':'RÉEL (API Chronopost)'}`);
});

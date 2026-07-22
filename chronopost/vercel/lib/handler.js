// ==========================================================================
//  handler.js — Routeur de l'API, indépendant du serveur (testable seul).
//  handle(ctx) -> { status, json }
//  ctx = { method, path, query:URLSearchParams, headers, body }
// ==========================================================================
import { verifyPassword } from './auth.js';
import { buildSoapEnvelope, parseSoapResponse, normalizePayload } from './chronopost.js';
import * as db from './db.js';
import { kv } from './store.js';

const MOCK = () => String(process.env.MOCK_MODE ?? 'true').toLowerCase() !== 'false';
const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const ok  = (json) => ({ status:200, json:{ ok:true, ...json } });
const err = (status, error, extra={}) => ({ status, json:{ ok:false, error, ...extra } });

function bearer(headers){ const h=headers['authorization']||headers['Authorization']||''; return h.startsWith('Bearer ')?h.slice(7):''; }

async function shipOrder(order){
  const settings = await db.getSettings();
  const payload = { sender:settings.sender, dest:order.dest, poids:order.poids, valeur:order.valeur, ref:order.ref, contenu:order.contenu, service:order.service };
  if (MOCK()){ const n = await (await kv()).incr('cp:mockseq'); return { ok:true, mode:'demo', tracking:'XX'+String(1000+n).padStart(11,'0')+'FR', labelBase64:null }; }
  if (!process.env.CHRONO_ACCOUNT || !process.env.CHRONO_PASSWORD) return { ok:false, error:'Identifiants Chronopost manquants' };
  const norm = normalizePayload(payload, process.env);
  if (norm.errors) return { ok:false, error:'Champs manquants', missing:norm.errors };
  const soap = buildSoapEnvelope(norm.data);
  const resp = await fetch(process.env.CHRONO_WS_URL, { method:'POST', headers:{'Content-Type':'text/xml; charset=utf-8','SOAPAction':''}, body:soap });
  const text = await resp.text();
  const r = parseSoapResponse(text);
  if (!r.ok) return { ok:false, error:r.errorMessage, code:r.errorCode };
  return { ok:true, mode:'reel', tracking:r.tracking, labelBase64:r.labelBase64||null };
}

export async function handle(ctx){
  const { method, path, query, headers } = ctx;
  const body = ctx.body || {};
  await db.ensureSeed();

  if (path==='/api/health') return ok({ mode: MOCK()?'demo':'reel', configured: !!process.env.CHRONO_ACCOUNT });

  if (path==='/api/login' && method==='POST'){
    const u = await db.getUserByUsername(body.username||'');
    if (!u || !verifyPassword(body.password, u.pass)) return err(401, 'Identifiant ou mot de passe incorrect');
    const token = await db.createSession(u.id);
    return ok({ token, user: db.pubUser(u) });
  }

  // --- authentification requise ---
  const me = await db.getSessionUser(bearer(headers));
  if (!me) return err(401, 'Non connecté');

  if (path==='/api/logout' && method==='POST'){ await db.deleteSession(bearer(headers)); return ok({}); }
  if (path==='/api/me' && method==='GET') return ok({ user: db.pubUser(me) });

  if (path==='/api/settings' && method==='GET'){ const s=await db.getSettings(); return ok({ sender:s.sender, config:s.config, mode:MOCK()?'demo':'reel' }); }
  if (path==='/api/settings' && method==='PUT'){
    if (me.role!=='admin') return err(403, "Réservé à l'administrateur");
    const s = await db.setSettings({ sender:body.sender, config:body.config });
    return ok({ sender:s.sender, config:s.config });
  }

  if (path==='/api/users' && method==='GET'){
    if (me.role!=='admin') return err(403, "Réservé à l'administrateur");
    return ok({ users:(await db.listUsers()).map(db.pubUser) });
  }
  if (path==='/api/users' && method==='POST'){
    if (me.role!=='admin') return err(403, "Réservé à l'administrateur");
    if (!body.username || !body.password) return err(422, 'Identifiant et mot de passe requis');
    if (await db.getUserByUsername(body.username)) return err(409, 'Cet identifiant existe déjà');
    return ok({ user: db.pubUser(await db.addUser(body)) });
  }
  const um = path.match(/^\/api\/users\/([^/]+)$/);
  if (um && method==='DELETE'){
    if (me.role!=='admin') return err(403, "Réservé à l'administrateur");
    if (um[1]===me.id) return err(400, 'Impossible de supprimer votre propre compte');
    await db.deleteUser(um[1]); return ok({});
  }

  if (path==='/api/contacts' && method==='GET') return ok({ contacts: await db.contacts() });

  if (path==='/api/orders' && method==='GET'){
    const date = query.get('date') || todayStr();
    return ok({ date, orders: await db.ordersByDate(date) });
  }
  if (path==='/api/orders/days' && method==='GET') return ok({ days: await db.daysSummary() });

  if (path==='/api/orders' && method==='POST'){
    const d = body.dest||{};
    if (!d.nom||!d.adr||!d.cp||!d.ville) return err(422, 'Destinataire : nom, adresse, CP, ville requis');
    const o = {
      date: body.date||todayStr(), createdAt:new Date().toISOString(), createdBy: me.name,
      dest:{ nom:d.nom||'',soc:d.soc||'',adr:d.adr||'',adr2:d.adr2||'',cp:d.cp||'',ville:d.ville||'',pays:d.pays||'France',tel:d.tel||'',mail:d.mail||'' },
      poids:body.poids||'', contenu:body.contenu||'Vêtements', valeur:body.valeur||'', ref:body.ref||'', service:body.service||'Chrono 18', instr:body.instr||'',
      status:'a_preparer', tracking:null, labelB64:null
    };
    return ok({ order: await db.addOrder(o) });
  }
  const om = path.match(/^\/api\/orders\/([^/]+)$/);
  if (om && method==='PUT'){ const o=await db.updateOrder(om[1], body); return o?ok({order:o}):err(404,'Commande introuvable'); }
  if (om && method==='DELETE'){ await db.deleteOrder(om[1]); return ok({}); }

  const sm = path.match(/^\/api\/orders\/([^/]+)\/ship$/);
  if (sm && method==='POST'){
    const o = await db.getOrder(sm[1]); if (!o) return err(404, 'Commande introuvable');
    const s = await db.getSettings(); if (!s.sender || !s.sender.nom) return err(400, "Configurez d'abord l'expéditeur (Réglages)");
    const r = await shipOrder(o); if (!r.ok) return err(502, r.error, { code:r.code });
    const up = await db.shipOrderRecord(o.id, r.tracking, r.labelBase64);
    return ok({ order:up, mode:r.mode });
  }

  return err(404, 'Route API inconnue');
}

// ==========================================================================
//  db.js — Opérations métier au-dessus de la base clé-valeur (store.js).
//  Clés : cp:seq, cp:users(set), cp:user:<id>, cp:username:<login>,
//         cp:sess:<token>, cp:settings, cp:order:<id>, cp:day:<date>(set),
//         cp:days(set), cp:contacts(set), cp:contact:<key>
// ==========================================================================
import { kv } from './store.js';
import { hashPassword, newToken } from './auth.js';

const K = (s)=>'cp:'+s;
const lc = (s)=>String(s||'').toLowerCase();

async function nextId(prefix){ const db=await kv(); return prefix + (await db.incr(K('seq'))).toString(36); }

// ---------- Amorçage : crée le compte admin au premier appel ----------
export async function ensureSeed(){
  const db = await kv();
  if (await db.get(K('seeded'))) return;
  const users = await db.smembers(K('users'));
  if (users.length === 0) {
    const username = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'alber2026';
    await addUser({ username, name:'Administrateur', role:'admin', password });
    if (!(await getSettings()).sender) await setSettings({ sender:{ nom:'Alber Alber', soc:'', adr:'', adr2:'', cp:'', ville:'', tel:'', mail:'' } });
  }
  await db.set(K('seeded'), 1);
}

// ---------- Utilisateurs ----------
export const pubUser = u => u && ({ id:u.id, username:u.username, name:u.name, role:u.role });

export async function addUser({ username, name, role, password }){
  const db = await kv();
  const id = await nextId('u');
  const u = { id, username:String(username).trim(), name:(name||username).trim(), role:role==='admin'?'admin':'membre', pass:hashPassword(password) };
  await db.set(K('user:'+id), u);
  await db.set(K('username:'+lc(u.username)), id);
  await db.sadd(K('users'), id);
  return u;
}
export async function getUserById(id){ return (await kv()).get(K('user:'+id)); }
export async function getUserByUsername(username){
  const db = await kv();
  const id = await db.get(K('username:'+lc(username)));
  return id ? db.get(K('user:'+id)) : null;
}
export async function listUsers(){
  const db = await kv();
  const ids = await db.smembers(K('users'));
  return (await Promise.all(ids.map(id=>db.get(K('user:'+id))))).filter(Boolean);
}
export async function deleteUser(id){
  const db = await kv();
  const u = await db.get(K('user:'+id));
  if (u) await db.del(K('username:'+lc(u.username)));
  await db.del(K('user:'+id));
  await db.srem(K('users'), id);
}

// ---------- Sessions ----------
export async function createSession(userId){
  const db = await kv();
  const token = newToken();
  await db.set(K('sess:'+token), userId, { ex: 60*60*24*30 }); // 30 jours
  return token;
}
export async function getSessionUser(token){
  if (!token) return null;
  const db = await kv();
  const uid = await db.get(K('sess:'+token));
  return uid ? db.get(K('user:'+uid)) : null;
}
export async function deleteSession(token){ if(token) await (await kv()).del(K('sess:'+token)); }

// ---------- Réglages partagés ----------
export async function getSettings(){ return (await (await kv()).get(K('settings'))) || { sender:null, config:{ apiUrl:'' } }; }
export async function setSettings(patch){
  const db = await kv();
  const cur = await getSettings();
  const next = { sender: patch.sender!==undefined ? patch.sender : cur.sender, config: { ...cur.config, ...(patch.config||{}) } };
  await db.set(K('settings'), next);
  return next;
}

// ---------- Commandes (par jour) ----------
export async function addOrder(o){
  const db = await kv();
  o.id = await nextId('o');
  await db.set(K('order:'+o.id), o);
  await db.sadd(K('day:'+o.date), o.id);
  await db.sadd(K('days'), o.date);
  // carnet
  const key = lc(o.dest.nom+'|'+o.dest.cp+'|'+o.dest.adr);
  await db.set(K('contact:'+key), o.dest);
  await db.sadd(K('contacts'), key);
  return o;
}
export async function getOrder(id){ return (await kv()).get(K('order:'+id)); }
export async function updateOrder(id, patch){
  const db = await kv();
  const o = await db.get(K('order:'+id));
  if (!o) return null;
  if (patch.dest) o.dest = { ...o.dest, ...patch.dest };
  for (const k of ['poids','contenu','valeur','ref','service','instr']) if (patch[k]!==undefined) o[k]=patch[k];
  // Saisie / correction manuelle du n° de suivi Chronopost
  if (patch.tracking !== undefined){ o.tracking = patch.tracking ? String(patch.tracking).trim() : null; o.status = o.tracking ? 'expedie' : 'a_preparer'; }
  if (patch.date && patch.date!==o.date){ await db.srem(K('day:'+o.date), id); await db.sadd(K('day:'+patch.date), id); await db.sadd(K('days'), patch.date); o.date=patch.date; }
  await db.set(K('order:'+id), o);
  return o;
}
export async function shipOrderRecord(id, tracking, labelB64){
  const db = await kv();
  const o = await db.get(K('order:'+id));
  if (!o) return null;
  o.tracking = tracking; o.labelB64 = labelB64||null; o.status='expedie'; o.shippedAt = new Date().toISOString();
  await db.set(K('order:'+id), o);
  return o;
}
export async function deleteOrder(id){
  const db = await kv();
  const o = await db.get(K('order:'+id));
  if (o) await db.srem(K('day:'+o.date), id);
  await db.del(K('order:'+id));
}
export async function ordersByDate(date){
  const db = await kv();
  const ids = await db.smembers(K('day:'+date));
  const list = (await Promise.all(ids.map(id=>db.get(K('order:'+id))))).filter(Boolean);
  return list.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
}
export async function daysSummary(){
  const db = await kv();
  const dates = await db.smembers(K('days'));
  const out = [];
  for (const date of dates){
    const list = await ordersByDate(date);
    out.push({ date, total:list.length, expedie:list.filter(o=>o.status==='expedie').length });
  }
  return out.filter(d=>d.total>0).sort((a,b)=>b.date.localeCompare(a.date));
}
export async function contacts(){
  const db = await kv();
  const keys = await db.smembers(K('contacts'));
  return (await Promise.all(keys.map(k=>db.get(K('contact:'+k))))).filter(Boolean);
}

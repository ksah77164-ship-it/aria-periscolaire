// ==========================================================================
//  Entrée serverless Vercel : reçoit toutes les requêtes /api/* et les passe
//  au routeur (lib/handler.js).
// ==========================================================================
import { handle } from '../lib/handler.js';

function readBody(req){
  return new Promise((resolve)=>{
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'object') return resolve(req.body);
      try { return resolve(JSON.parse(req.body)); } catch { return resolve({}); }
    }
    let raw=''; req.on('data',c=>{ raw+=c; if(raw.length>2e6) req.destroy(); });
    req.on('end',()=>{ try{ resolve(raw?JSON.parse(raw):{}); }catch{ resolve({}); } });
    req.on('error',()=>resolve({}));
  });
}

export default async function handler(req, res){
  const u = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method==='OPTIONS'){ res.statusCode=204; return res.end(); }

  let body = {};
  if (req.method!=='GET') body = await readBody(req);

  let out;
  try {
    out = await handle({ method:req.method, path:u.pathname, query:u.searchParams, headers:req.headers, body });
  } catch (e) {
    out = { status:500, json:{ ok:false, error:'Erreur serveur : '+e.message } };
  }
  res.statusCode = out.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(out.json));
}

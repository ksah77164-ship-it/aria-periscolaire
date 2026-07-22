// ==========================================================================
//  store.js — Couche base de données.
//  En production (Vercel) : utilise Vercel KV (Upstash Redis) si les variables
//  d'environnement KV_* sont présentes.
//  En local / test : bascule automatiquement sur une base en mémoire.
// ==========================================================================
let backend = null;

function memoryBackend() {
  const m = new Map(), sets = new Map();
  return {
    async get(k){ return m.has(k) ? m.get(k) : null; },
    async set(k,v){ m.set(k, v); },
    async del(k){ m.delete(k); sets.delete(k); },
    async sadd(k,...mem){ const s = sets.get(k) || new Set(); mem.forEach(x=>s.add(x)); sets.set(k,s); },
    async srem(k,...mem){ const s = sets.get(k); if(s) mem.forEach(x=>s.delete(x)); },
    async smembers(k){ return [...(sets.get(k) || [])]; },
    async incr(k){ const v = (m.get(k) || 0) + 1; m.set(k, v); return v; },
  };
}

export async function kv() {
  if (backend) return backend;
  // Accepte les variables injectées par "Vercel KV" comme par l'intégration Upstash.
  const url   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const { createClient } = await import('@vercel/kv');
    backend = createClient({ url, token });
  } else {
    backend = memoryBackend(); // local / test
  }
  return backend;
}

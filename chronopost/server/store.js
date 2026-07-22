// ==========================================================================
//  store.js — Base de données partagée (fichier JSON, sans dépendance).
//  Toutes les écritures sont sérialisées pour éviter les conflits entre
//  utilisateurs (Node est mono-thread : un seul processus, écritures en file).
// ==========================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

let data;
function init() {
  if (fs.existsSync(FILE)) {
    try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
    catch { data = {}; }
  } else data = {};
  data.users    ??= [];          // {id, username, name, role, pass}
  data.sessions ??= {};          // token -> {userId, since}
  data.orders   ??= [];          // voir server: commande
  data.sender   ??= null;        // expéditeur partagé
  data.config   ??= { apiUrl: '' };
  data.seq      ??= 0;
}
init();

let queue = Promise.resolve();
export function save() {
  queue = queue.then(() => fs.promises.writeFile(FILE, JSON.stringify(data, null, 2)));
  return queue;
}

export const db = () => data;
export function nextId(prefix = 'o') { data.seq++; return prefix + data.seq.toString(36); }

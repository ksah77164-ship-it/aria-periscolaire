# Bordereaux Chronopost — application d'expédition

Application web **multi-utilisateurs** pour préparer les envois Chronopost
d'une boutique de vêtements, **sans ressaisie** et **organisée par journée**.

Pensée pour ce flux : on ajoute les commandes **au fil de la journée** (dès
qu'une commande tombe, on saisit le client), et **en fin de journée on édite
tous les bordereaux d'un coup** — au lieu de tout ressaisir au dernier moment.

## Ce que ça fait

- **Comptes (identifiant + mot de passe)** — plusieurs personnes se connectent
- **Données partagées** — tout le monde voit les mêmes commandes, mises à jour
  automatiquement (rafraîchissement toutes les ~8 s)
- **Vue « Aujourd'hui »** — les commandes s'accumulent, avec compteurs
  (à préparer / expédiées) ; navigation jour par jour
- **Carnet** — un client déjà servi se re-remplit en un clic
- **Bordereau imprimable** avec code-barre ; **« Éditer les bordereaux »**
  imprime toute la journée d'un coup
- **Génération du n° de suivi + étiquette Chronopost** via l'API (option)
- **Rôles** : `admin` (gère l'expéditeur, l'API et les comptes) et `membre`

> ⚠️ Le numéro de suivi et l'étiquette officielle (avec le code-barre du
> transporteur) sont générés par **Chronopost** lors de l'appel API. L'app les
> récupère et permet de les imprimer.

## Deux composants

| Dossier | Rôle |
|---|---|
| [`server/`](./server/) | Le serveur : comptes, base de données partagée, commandes, API Chronopost, et il **sert l'interface**. |
| [`app/`](./app/) | L'interface web (connexion + vue par jour), servie par le serveur. |

Il existe aussi `index.html` à la racine : une **version autonome** plus
simple (hors-ligne, mono-poste, sans comptes). L'application multi-utilisateurs
ci-dessus (server + app) est la version connectée.

## Démarrage (mode démo, sans compte Chronopost)

Node ≥ 18, aucune dépendance à installer :

```bash
cd chronopost/server
cp .env.example .env
node index.js
```

Ouvrez **http://localhost:8787**. Au premier lancement, un compte admin est créé
(par défaut `admin` / `alber2026` — à changer). Connectez-vous, allez dans
**Réglages** pour saisir l'adresse de la boutique et créer les comptes de
l'équipe.

En **mode démo** (`MOCK_MODE=true`), la génération de suivi renvoie un numéro
simulé — pratique pour tout tester sans compte Chronopost.

## Passer en mode réel (API Chronopost)

Renseignez dans `server/.env` : `MOCK_MODE=false`, `CHRONO_ACCOUNT`,
`CHRONO_PASSWORD` (identifiants du **web service d'expédition**, à demander à
Chronopost). Voir [`server/README.md`](./server/README.md).

## Hébergement

Pour que plusieurs personnes s'y connectent, le serveur doit tourner en ligne
(un petit VPS ou une plateforme type Render / Railway), de préférence en HTTPS.
Chaque personne ouvre alors l'adresse du serveur dans son navigateur et se
connecte avec son identifiant.

## Sécurité

- Mots de passe **hachés** (scrypt), jamais stockés en clair.
- Identifiants API Chronopost **côté serveur uniquement** (`.env`, ignoré par git).
- `data.json` (la base) est ignoré par git.
- En production : limitez `ALLOWED_ORIGIN` et servez en HTTPS.

## Pistes suivantes

- Import automatique des commandes depuis un canal de vente (Vinted, Shopify…).
- Mise à jour en direct (websocket) au lieu du rafraîchissement périodique.
- Étiquette thermique 10×15 pour imprimante d'étiquettes.

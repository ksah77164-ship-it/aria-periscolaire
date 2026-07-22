# Mettre l'application en ligne sur Vercel (gratuit)

Objectif : que plusieurs personnes se connectent à l'app depuis une adresse
web, gratuitement. Compter ~10 minutes. Tout le code est déjà prêt dans le
dossier `chronopost/vercel/`.

## 1. Importer le projet
1. Aller sur https://vercel.com → **Add New… → Project**.
2. Choisir le dépôt GitHub **aria-periscolaire**.
3. **Root Directory** : cliquer « Edit » et choisir **`chronopost/vercel`**
   (très important — c'est là que se trouve l'app Vercel).
4. Framework Preset : **Other** (laisser tel quel). Ne rien changer d'autre.
5. Ne pas déployer tout de suite → d'abord créer la base de données (étape 2).
   (Si vous avez déjà déployé, pas grave : faites l'étape 2 puis « Redeploy ».)

## 2. Créer la base de données (Vercel KV — gratuit)
1. Dans le projet Vercel → onglet **Storage** → **Create Database** → **KV**
   (Upstash Redis). Nom au choix, région proche (ex. Paris/Frankfurt).
2. **Connect** cette base **au projet**. Vercel ajoute automatiquement les
   variables d'environnement nécessaires (`KV_REST_API_URL`, `KV_REST_API_TOKEN`…).
   C'est ce qui permet de **conserver les commandes et les comptes**.

## 3. Variables d'environnement
Projet → **Settings → Environment Variables**, ajouter :
- `ADMIN_PASSWORD` = le mot de passe administrateur de votre choix
- `MOCK_MODE` = `true` (mode démo ; passez à `false` avec les identifiants
  Chronopost quand vous serez prêt)
- (optionnel) `ADMIN_USER` = `admin` (par défaut c'est déjà `admin`)

## 4. Déployer
**Deploy** (ou **Redeploy** si vous aviez déjà déployé). Au bout d'1-2 min,
vous obtenez une adresse type `https://votre-projet.vercel.app`.

## 5. Première connexion
Ouvrir l'adresse → identifiant **admin** + le mot de passe de l'étape 3.
Puis onglet **Réglages** :
- saisir l'adresse de la boutique (expéditeur),
- **créer les comptes** de l'équipe.

C'est en ligne ✅ et **gratuit**. Chaque personne ouvre l'adresse et se
connecte ; tout le monde voit les mêmes commandes.

## Redéploiement automatique
À chaque mise à jour du code sur GitHub, Vercel **redéploie tout seul**.

## Passer en mode réel (API Chronopost)
Settings → Environment Variables :
- `MOCK_MODE` = `false`
- `CHRONO_ACCOUNT` et `CHRONO_PASSWORD` (identifiants du web service Chronopost)
- **Redeploy**. La génération du vrai n° de suivi + étiquette est active.

## Notes
- Les mots de passe sont **hachés** ; les identifiants API restent côté serveur.
- La base **Vercel KV** a une offre gratuite largement suffisante pour une
  boutique (des milliers de commandes).

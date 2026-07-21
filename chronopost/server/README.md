# Serveur d'expédition Chronopost

Petit serveur (Node.js, **sans dépendance externe**) qui appelle l'API
d'expédition Chronopost pour générer le **numéro de suivi** et l'**étiquette
officielle**, et les renvoie à l'application Bordereaux.

Pourquoi un serveur ? Parce que l'API Chronopost **ne peut pas** être appelée
directement depuis une page web (blocage navigateur / CORS) et surtout parce
que le **mot de passe API ne doit jamais** se trouver dans une page publique.
Ce serveur garde les identifiants en sécurité côté serveur.

```
Navigateur (app)  ──►  ce serveur  ──►  API Chronopost
   données colis        + identifiants      n° suivi + étiquette
```

## Démarrage rapide (mode démo)

Aucune installation de paquet nécessaire (Node ≥ 18) :

```bash
cd chronopost/server
cp .env.example .env      # MOCK_MODE=true par défaut
npm start                 # ou : node index.js
```

Le serveur écoute sur `http://localhost:8787`. En mode démo il renvoie un
**faux numéro de suivi** : pratique pour tester tout le parcours sans compte.

Dans l'app (onglet **🏠 Vendeur → Connexion API**), mettez l'URL
`http://localhost:8787`, cliquez **Tester la connexion**, puis créez un envoi
et cliquez **Générer l'étiquette Chronopost**.

## Passer en mode réel

1. Obtenez les identifiants du **web service d'expédition** auprès de
   Chronopost (ce ne sont PAS vos identifiants du site chronopost.fr) :
   - numéro de compte / contrat (`accountNumber`)
   - mot de passe API (`password`)
   - éventuellement un sous-compte
2. Dans `.env` :
   ```
   MOCK_MODE=false
   CHRONO_ACCOUNT=votre_numero
   CHRONO_PASSWORD=votre_mot_de_passe
   ```
3. Relancez `node index.js`.

> ⚠️ **À vérifier avant production :** les **codes produit** (Chrono 13 / 18 /
> Relais…) et le format d'étiquette dépendent du contrat. Ils sont regroupés
> et commentés en haut de `chronopost.js` (`PRODUCT_CODES`) pour être ajustés
> facilement, puis testés avec un vrai colis.

## Points d'entrée

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/health` | État du serveur (mode démo/réel, identifiants présents) |
| `POST` | `/api/shipping` | Crée l'envoi → `{ ok, tracking, labelBase64 }` |

Exemple d'appel :

```bash
curl -X POST http://localhost:8787/api/shipping \
  -H "Content-Type: application/json" \
  -d '{"sender":{"nom":"Boutique Léa","adr":"8 av du Commerce","cp":"69002","ville":"Lyon"},
       "dest":{"nom":"Marie Dupont","adr":"12 rue des Lilas","cp":"75011","ville":"Paris","pays":"France"},
       "poids":"1.5","service":"Chrono 18","ref":"CMD-1042","contenu":"Vêtements"}'
```

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.js` | Serveur HTTP, routes, mode démo/réel, CORS |
| `chronopost.js` | Construction de la requête SOAP + lecture de la réponse |
| `.env.example` | Modèle de configuration (à copier en `.env`) |

## Sécurité

- `.env` (identifiants) est **ignoré par git** (`.gitignore`) — ne le commitez jamais.
- Limitez `ALLOWED_ORIGIN` à l'URL de votre app en production (pas `*`).
- Hébergez ce serveur en HTTPS (derrière un reverse proxy, ou sur une plateforme
  type Render / Railway / un petit VPS).

## Hébergement

Ce serveur tourne partout où Node ≥ 18 est disponible. Pour une mise en ligne
simple : une plateforme PaaS (Render, Railway, Fly…) ou un VPS avec un reverse
proxy HTTPS. Renseignez ensuite l'URL publique dans l'app (onglet Vendeur).

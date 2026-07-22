# Mettre l'application en ligne sur Render (guide simple)

Objectif : que plusieurs personnes puissent se connecter à l'app depuis une
adresse web. Compter ~10 minutes.

## Avant de commencer
- Le code est déjà prêt (fichier `render.yaml` inclus).
- Il faut un compte **GitHub** (le dépôt y est déjà) et un compte **Render**
  (gratuit à créer sur https://render.com).

## Étapes

1. **Créer un compte Render** → https://render.com → « Get Started » →
   se connecter **avec GitHub** (le plus simple).

2. **Nouveau Blueprint** : bouton **New +** (en haut à droite) → **Blueprint**.

3. **Choisir le dépôt** `aria-periscolaire` dans la liste, puis valider.
   Render lit tout seul le fichier `render.yaml` et prépare le service
   « bordereaux-chronopost ».

4. **Renseigner le mot de passe admin** : Render demande la valeur du secret
   `ADMIN_PASSWORD` → tapez le mot de passe administrateur de votre choix.

5. **Apply / Create** → Render construit et met en ligne. Au bout de 1–2 min,
   vous obtenez une adresse du type
   `https://bordereaux-chronopost.onrender.com`.

6. **Première connexion** : ouvrez cette adresse →
   identifiant `admin` + le mot de passe saisi à l'étape 4.
   Puis onglet **Réglages** : saisissez l'adresse de la boutique et
   **créez les comptes** de votre équipe.

C'est en ligne ✅ — chaque personne ouvre l'adresse et se connecte avec son
identifiant. Tout le monde voit les mêmes commandes.

## À savoir sur le coût (important, en toute transparence)

- Pour que **les données soient conservées** (les commandes, les comptes), il
  faut un **disque persistant**. Sur Render, cela nécessite le petit plan payant
  **Starter (~7 $/mois)** — déjà prévu dans `render.yaml`.
- Le plan **gratuit** existe, mais il **efface les données à chaque
  redémarrage** et « s'endort » après inactivité : bien pour **tester**, pas
  pour un usage quotidien réel.
- Alternative sans disque payant : brancher une **base de données externe
  gratuite** (Neon, Supabase). C'est un peu plus de travail côté code — je peux
  le faire si vous préférez éviter le plan payant.

## Redéploiement automatique

`autoDeploy` est activé : à chaque fois que le code est mis à jour sur GitHub,
Render **redéploie tout seul**. Rien à refaire.

## Passer en mode réel (API Chronopost)

Dans Render → votre service → **Environment** :
- passez `MOCK_MODE` à `false`
- ajoutez `CHRONO_ACCOUNT` et `CHRONO_PASSWORD` (vos identifiants du web service
  Chronopost)
- **Save** → Render redéploie. La génération du vrai n° de suivi est active.

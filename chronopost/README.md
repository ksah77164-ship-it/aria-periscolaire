# Bordereaux Chronopost — Préparation rapide

Petite application web **autonome** (PWA) pour préparer des envois Chronopost
**sans ressaisie**. Pensée pour un vendeur de vêtements qui expédie plusieurs
colis par jour et perd du temps à retaper les mêmes informations.

> ⚠️ Cet outil **ne remplace pas** l'espace client Chronopost : le bordereau
> officiel et le vrai numéro de suivi sont générés par Chronopost. Ici on
> supprime le travail répétitif **en amont** (la saisie), puis on exporte les
> données ou on imprime une fiche de préparation interne.

## Ce que ça fait

- **Vendeur enregistré une seule fois** → adresse d'expédition pré-remplie sur chaque envoi
- **Carnet de destinataires** : recherche instantanée, un clic pour tout re-remplir
- **Formats colis prédéfinis** (pochette / petit / moyen / grand) → poids auto
- **Historique + « Réexpédier »** : dupliquer un envoi identique en un clic
- **Bordereau imprimable** (impression / PDF) avec **code-barre Code128** de la référence commande
- **Export CSV** pour un import groupé dans l'espace client Chronopost
- **Fonctionne hors-ligne**, toutes les données restent **sur l'appareil** (rien n'est envoyé sur internet)

## Utilisation

Ouvrez `index.html` dans un navigateur.

1. Onglet **🏠 Vendeur** : saisissez l'adresse d'expédition (une seule fois).
2. Onglet **➕ Nouveau** : choisissez/saisissez un client, un format de colis, validez.
3. Le bordereau s'affiche → **Imprimer / PDF**.
4. Onglet **📋 Envois** : historique, réexpédition, **export CSV**.

### Installation sur téléphone
Ouvrez la page dans le navigateur, puis « Ajouter à l'écran d'accueil ».
L'application s'installe et fonctionne hors connexion.

## Technique

- HTML / CSS / JavaScript **sans dépendance**, tout est inline.
- Stockage : `localStorage` (aucun serveur, aucune donnée envoyée).
- Générateur de code-barre **Code128** (subset B) rendu en SVG, intégré.
- PWA : `manifest.json` + `service-worker.js` (cache réseau-d'abord).

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | L'application complète |
| `manifest.json` | Métadonnées PWA (installation) |
| `service-worker.js` | Cache hors-ligne |

## Pistes v2

- Génération du **vrai bordereau + n° de suivi** via l'API Chronopost (si contrat/API).
- **Import automatique des commandes** depuis un canal de vente (Vinted, Shopify, site, etc.).

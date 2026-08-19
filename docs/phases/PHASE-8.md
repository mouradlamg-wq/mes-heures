# Phase 8 — Sauvegarde, service worker, installation

`pnpm verify` vert. 312 tests. **Les huit phases du SPEC §14 sont livrées.**

## Fait

### La sauvegarde — la vraie priorité de cette phase

Il n'y a ni compte, ni serveur, ni synchronisation : un fichier JSON est le seul
moyen de changer d'appareil, et le seul filet contre la perte. La section
Sauvegarde des réglages porte donc **le seul usage d'alerte du rouge de toute
l'app** — et il porte sur la perte de données, jamais sur un calcul.

- **Export** : partage système d'abord, téléchargement en repli. Sur un
  téléphone, le partage laisse choisir la destination ; le téléchargement laisse
  le fichier sur l'appareil qu'on cherche justement à ne plus être seul à
  détenir.
- **Import** : le mode est **demandé**, jamais implicite — remplacer ou fusionner.
  Un fichier invalide est refusé avec le champ fautif nommé, et les données
  restent intactes.
- L'état affiche la date du dernier export, passe en rappel à 14 jours et en
  aplat d'alerte à 30. Un stockage non garanti par le navigateur **allonge** le
  message plutôt que de disparaître.

### Le service worker

`registerType: 'prompt'` : une nouvelle version ne s'installe **jamais sous les
doigts**. Un rechargement silencieux en pleine saisie ferait perdre la journée en
cours, et sur cette app une journée perdue est une journée à ressaisir de
mémoire. Le bandeau propose, l'utilisateur décide.

Rien n'est enregistré en développement : un service worker qui met en cache un
module chaud rend le rechargement imprévisible.

### L'installation

Le bandeau d'installation intercepte `beforeinstallprompt` pour garder la main,
et disparaît définitivement si on répond « plus tard ».

### Le bundle

Découpé : `luxon` (70 ko) et `dexie` (104 ko) sortent du bundle applicatif, qui
tombe à 353 ko. Ces deux-là changent bien moins souvent que l'app — les isoler
évite de refaire télécharger 300 ko à chaque mise à jour, ce qui compte quand
elle se fait sur un parking, en 4G.

## Un bug trouvé en vérifiant la sauvegarde

Après un export réussi, l'écran affichait toujours **« tu n'as jamais exporté »**.

Cause : `formatInstant` conservait les millisecondes de l'horloge, alors que
`lireInstant` refuse tout ce qui dépasse la minute (SPEC §10). **L'app produisait
donc un instant qu'elle refusait ensuite de relire** — la date de sauvegarde
était écrite, puis relue comme absente.

`formatInstant` tronque désormais à la minute, et `TPS-23` verrouille la
propriété qui manquait : *tout instant produit par le moteur est relisible par le
moteur*. C'est le genre d'incohérence qu'aucun test de calcul n'attrape, parce
que les deux fonctions étaient justes prises séparément.

## Supposé

1. **Le mode d'import passe par un `confirm()` du navigateur.** C'est laid au
   regard du DESIGN, mais c'est un choix irréversible sur des données : le
   dialogue natif est bloquant et sans ambiguïté. À remplacer par un `.dialog`
   si tu préfères.
2. **L'invite d'installation ne réapparaît pas après un refus** dans la même
   session. Insister serait le meilleur moyen de faire désinstaller l'app.
3. **`navigator.share` est tenté avant le téléchargement**, et un partage annulé
   retombe silencieusement sur le téléchargement — l'utilisateur obtient son
   fichier dans tous les cas.

## Ambigu

**Le rappel de sauvegarde ne s'affiche que dans les réglages.** Un conducteur qui
n'y va jamais ne verra jamais l'alerte des 30 jours. Faut-il la remonter sur
l'écran « Ma journée » passé ce délai ? Ça contredirait « un seul compteur par
écran », mais la perte de données est le seul risque irréversible de l'app.

## Dette

- **`ARC-16`** reste la seule ligne de la table déclarée sans test : le contrôle
  mécanique des signatures publiques du moteur.
- **Aucun test de bout en bout sur les écrans montés.** Les quatre parcours ont
  été vérifiés à la main dans le navigateur ; la logique, elle, est testée sans
  DOM.
- **Le service worker n'a pas été testé en conditions réelles** : il ne
  s'enregistre qu'en production, et je n'ai pas servi le `dist` hors ligne.
- **`DESIGN.md` décrit encore le bouton `Valider la journée`** (§7, §8) et
  interdit le sélecteur d'heure (§8, §14), tous deux modifiés sur ta demande.

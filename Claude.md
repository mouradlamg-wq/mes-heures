# CLAUDE.md — Mes Heures

> Règles de travail pour Claude Code. À déposer à la racine du dépôt, à côté de `SPEC.md`.
>
> **`SPEC.md` est la vérité métier. Ce fichier dit comment travailler.** En cas de contradiction entre les deux, `SPEC.md` gagne : signale le conflit, ne le tranche pas seul.

---

## 1. Le produit en une phrase

PWA locale, hors ligne, sans compte ni backend : un conducteur d'autocar saisit sa journée en quinze secondes le soir, et vérifie sa fiche de paie ligne par ligne.

Public : une personne, sur son téléphone, fatiguée, le soir. Pas un logiciel de gestion RH.

---

## 2. Invariants non négociables

1. **Juste ou absent.** Mieux vaut « je ne peux pas calculer ça » qu'un chiffre plausible et faux. Tout résultat porte un statut.
2. **Le moteur produit des preuves, pas des nombres.** Chaque valeur affichée doit pouvoir être dépliée jusqu'aux saisies et aux réglages qui la produisent.
3. **Aucune valeur réglementaire ou tarifaire en dur.** Réglage absent = donnée absente, jamais zéro, jamais de défaut silencieux.
4. **Aucun calcul hors du moteur.** Ni dans React, ni dans le générateur PDF, ni dans un `useMemo`. Les deux consomment la même sortie.
5. **Ambiguïté métier = question, pas décision.** Tu ne tranches pas sur du droit du travail ni sur une convention collective. Voir §11.

---

## 3. Stack

| Rôle | Choix | Note |
|---|---|---|
| Build | Vite + TypeScript `strict` | pas de Next, pas de SSR : il n'y a pas de serveur |
| UI | React (dernière stable) | fonctions + hooks uniquement |
| Temps | Luxon | **seule** lib de date autorisée |
| Stockage | Dexie (IndexedDB) + `dexie-react-hooks` (`useLiveQuery`) | pas d'autre state manager |
| Validation d'import | Zod | refus propre d'un JSON corrompu |
| Tests | Vitest (+ Testing Library pour l'UI) | |
| PWA | `vite-plugin-pwa` (Workbox) | precache complet, app-shell |
| Paquets | pnpm | |

**Vérifie les versions réelles au moment de l'init, ne les invente pas.**

Interdits : backend, compte utilisateur, analytics, télémétrie, appel réseau au runtime, CDN, `date-fns`/`moment`/`dayjs` en plus de Luxon, lib de calendrier ou de time-picker, UI kit lourd, lib de calcul financier, `any` non justifié.

Commandes attendues :

```
pnpm dev · pnpm test · pnpm test:watch · pnpm typecheck · pnpm lint · pnpm build · pnpm preview
pnpm verify   # typecheck + lint + test + build — doit passer avant toute fin de phase
```

---

## 4. Arborescence et règle des dépendances

```
src/
  engine/        # 100 % pur. Aucun import de react, dexie, du DOM, de window.
    primitives/  # Cents, Minutes, roundingPolicy, CalculationResult, format
    time/        # ISO ↔ Luxon, LocalTimeResolution, journée de service
    qualify/     # chevauchements, trous, range
    pay/         # temps rémunéré, périodes, heures sup
    indemnites/
    index.ts     # seule surface publique du moteur
  db/            # Dexie, schéma, migrations versionnées, export/import
  ui/            # écrans, composants — zéro arithmétique métier
  pdf/           # gabarit du relevé — consomme la sortie moteur, ne recalcule rien
  app/           # routing, providers, bootstrap PWA
tests/
  cases/         # la table de cas limites (§13 du SPEC), un fichier par domaine
docs/phases/     # rapports de fin de phase
```

Sens des dépendances : `ui → engine`, `ui → db`, `pdf → engine`, `db → engine` (types seulement). **Jamais l'inverse.**

Écris un **test d'architecture** qui scanne `src/engine/**` et échoue s'il y trouve un import de `react`, `dexie`, `./db`, `./ui`, ou une référence à `window`/`document`/`localStorage`/`Date.now`. Ce test est aussi important que les tests de calcul : c'est lui qui garde le moteur testable.

---

## 5. Le pipeline est l'architecture

Ordre imposé par `SPEC.md` §2, un module et un test par étage, chaque étage pur :

```
saisie brute
→ normalizeTimes()      # local → instant, DST
→ qualify()             # chevauchements, trous, complétude
→ tempsRemunere()
→ splitIntoPayPeriods()
→ heuresSup()
→ indemnites()
→ CalculationResult + preuves → écran « Vérifier ma paie » | relevé PDF
```

Un étage ne saute jamais par-dessus le précédent. Si l'étage N a produit un `partial`, l'étage N+1 propage le statut et le `range` : il ne les efface pas et ne les « résout » pas.

---

## 6. Conventions de code

- **Vocabulaire métier en français** dans les types et les identifiants (`tempsRemunere`, `priseService`, `indemnites`), plomberie technique en anglais (`parse`, `format`, `repository`). Ne traduis pas les noms du SPEC.
- `tsconfig` : `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`.
- **Types nominaux** pour `Cents` et `Minutes` (`number & { readonly __brand: 'Cents' }`) avec constructeurs `cents()` / `minutes()` validant l'entier. C'est un renforcement des alias du SPEC §9, pas un changement de modèle.
- **Argent : centimes entiers.** Aucun flottant ne franchit la frontière du moteur. Aucun `toFixed` dans le moteur.
- **Un seul point d'arrondi**, en sortie, via `roundingPolicy` exportée et testée. Toute conversion arrondie est un `CalculationStep` visible.
- Interdits en dur : `?? 0`, `|| 0`, `?? 'Europe/Paris'` ailleurs que dans le défaut de `Settings`, tout montant, tout taux, tout seuil de majoration, tout `debutSemaine = 1` implicite.
- `new Date()`, `Date.now()`, `Intl` implicite : interdits dans `engine`. Le temps courant est **passé en paramètre**.
- `switch` sur union = exhaustif, avec `assertNever(x)` dans le `default`.
- Un cas métier non calculable **retourne** `status: 'unknown'` avec un message ; il ne `throw` pas. Les exceptions sont réservées aux bugs de programmation.
- Pas de `catch` silencieux. Pas de `console.log` laissé en place.
- Aucun résultat de calcul persisté. La complétude d'une journée est dérivée.

---

## 7. Le contrat `CalculationResult`

- Aucune fonction publique du moteur ne retourne un `number` nu. Elle retourne `CalculationResult<T>`.
- Helpers uniques : `complete(value, {inputs, steps, sources})`, `partial(range, …)`, `unknown(raison, …)`. Personne ne construit l'objet à la main.
- `steps` est ordonné et lisible par un humain non technique : c'est ce qui s'affiche dans le dépliant de l'écran « Vérifier ma paie ». Chaque step permet de remonter aux `dayId`.
- `sources` **obligatoire** pour tout résultat financier ou dépendant d'un réglage ; **absent** pour une durée brute (`fin − début`). Un test vérifie les deux sens : pas de source manquante, pas de source bidon.
- Valeur modifiée par l'utilisateur → `kind: 'personnalise'`, et l'UI cesse de la présenter comme légale.
- Brut mensuel d'un mois comportant une absence : `partial`/`unknown` assumé, tandis que heures sup et indemnités restent `complete`. Ce sont ces deux-là qui portent la valeur pour l'utilisateur.

---

## 8. Temps et fuseau

- Stockage Dexie : **chaînes ISO 8601 complètes avec offset**. Jamais un objet Luxon, jamais un timestamp nu.
- La zone vient toujours de `Settings.timeZoneReference`, jamais du navigateur. Semaine, période et journée sont définies dans cette zone.
- Le parseur `date + HH:mm → instant` retourne `LocalTimeResolution`. `ambiguous` → l'UI demande (et seulement là). `invalid` → refus en langage humain. **Jamais de correction silencieuse.**
- Journée de service ≠ jour calendaire : rattachement au jour de la prise de service.
- **Les tests tournent avec un `TZ` volontairement différent** de `Europe/Paris` (par ex. `TZ=America/New_York` dans le setup Vitest) pour faire tomber toute fuite de fuseau navigateur.

---

## 9. Affichage

- Un seul module de formatage, dans `engine/primitives/format`. Aucune mise en forme ad hoc dans un composant.
- Double affichage systématique des durées : `7 h 30` **et** `7,50 h`. Espaces insécables, virgule décimale française.
- Tout `unknown` s'affiche comme une phrase + la cause + un lien direct vers le réglage à remplir. Jamais un tiret, jamais `0`, jamais un champ vide.

---

## 10. UI — règles de rédaction et de saisie

- Français, tutoiement (le SPEC dit « ton employeur »). Pas d'i18n en v1.
- Vocabulaire : **écart**, jamais **erreur**.
- Deux mentions obligatoires, au mot près :
  - Écrans de durées : « Ces durées sont indicatives. Cette version ne vérifie pas la conformité au règlement européen. »
  - Écran Vérifier ma paie : « Un écart n'est pas forcément une erreur. Compare avec ton contrat, puis vois avec ton employeur ou tes représentants du personnel. »
- Saisie : champs numériques (`inputmode="numeric"`), **aucun sélecteur d'heure à faire défiler**. `Dupliquer hier` et modèles en tête d'écran. Cible : une journée saisie en quinze secondes, hors ligne, à une main.
- Zone non qualifiée : signalée en ligne et qualifiable **en un appui**, ce qui doit faire basculer le résultat en `complete` sans rechargement.
- Phase 5 (saisie) est la phase qui décide de l'adoption : c'est celle qu'on soigne le plus, pas celle qu'on finit vite.

---

## 11. Quand tu t'arrêtes et tu demandes

Tu poses la question et tu attends, au lieu de choisir, dès que la réponse relève du droit, de la convention ou de l'entreprise :

- valeur d'une indemnité, d'un taux, d'une majoration, d'un seuil ;
- valorisation d'une absence (hors périmètre v1 — ne l'implémente pas « en attendant ») ;
- règle d'arrondi conventionnelle ;
- rattachement d'une semaine à cheval : c'est un **réglage**, et en son absence le moteur affiche les deux hypothèses — ce n'est pas à toi de trancher, ni au code de choisir un défaut ;
- toute interprétation du règlement européen (module RSE = v2, annexe du SPEC, **ne pas implémenter**).

Tu peux décider seul de tout ce qui est technique : nommage, découpage de fichiers, structure de tests, forme d'un composant.

---

## 12. Hors périmètre v1 — ne pas « améliorer »

Alertes de conformité RSE · valorisation des absences (l'app compte les jours par type, rien de plus) · notifications programmées (aucune promesse à l'écran) · multi-utilisateur, compte, synchronisation, partage · export vers un service tiers.

Si tu penses qu'un de ces points est nécessaire, écris-le dans le rapport de phase. Ne l'ajoute pas.

---

## 13. Tests

- **La table de cas limites s'écrit avant le code**, dans `tests/cases/*.md`, à partir du §13 du SPEC — puis **un test par ligne**, référencé par son identifiant de ligne. Complète la table quand tu découvres une frontière ; ne supprime jamais une ligne.
- Couverture obligatoire des six familles du SPEC §13 : temps/DST, périodes, qualification, paie, indemnités, nombres, preuves, données.
- Le moteur se teste sans DOM ni Dexie, avec des builders de fixtures (`aWorkDay({…})`), pas des littéraux copiés-collés.
- Minutes → centièmes : les **60** valeurs, exhaustivement. Calcul en trois étapes = calcul en une (preuve d'absence d'arrondi en cascade).
- Pas de test snapshot sur un montant ou une durée : l'assertion est explicite.
- Export/import : aller-retour identique ; import corrompu → refus propre, données intactes ; migration Dexie → aucune perte.
- Quelques centaines de tests moteur sont normaux. Le nombre importe moins que la couverture des frontières.

---

## 14. Rythme de travail

Les huit phases du SPEC §14 sont l'ordre de livraison. Une branche par phase, commits petits et lisibles.

**À la fin de chaque phase : `pnpm verify` vert, puis tu t'arrêtes et tu écris `docs/phases/PHASE-N.md`** :

```md
# Phase N — <titre>
## Fait          — ce qui marche, avec les tests qui le prouvent
## Supposé       — chaque hypothèse prise, et ce qu'elle casse si elle est fausse
## Ambigu        — les questions ouvertes, formulées pour un conducteur, pas pour un dev
## Dette         — ce qui est volontairement provisoire
```

Tu ne démarres pas la phase N+1 sans validation de ce rapport.

**Definition of done, pour chaque PR :** tests de la table à jour · `pnpm verify` vert · aucun calcul ajouté hors `engine` · aucune constante métier ajoutée · tout nouveau résultat public retourne un `CalculationResult` avec `steps` lisibles · les `unknown` sont affichés avec leur cause · rapport de phase à jour si la phase se termine.

---

## 15. Glossaire FR → code

| Métier | Code |
|---|---|
| journée de service | `WorkDay.dateRattachement` (≠ jour calendaire) |
| prise / fin de service | `priseService` / `finService` |
| amplitude | `finService − priseService`, information brute, sans source |
| temps rémunéré | `tempsRemunere` — seule notion qui alimente la paie en v1 |
| temps de conduite | `tempsConduite` — brut, pour le futur module RSE |
| coupure | `Segment.type = 'coupure'` |
| découcher | `WorkDay.decouche` → une ou plusieurs `IndemniteConfig` distinctes |
| période de paie | `PayPeriod` — générée depuis les réglages, jamais déduite d'un `YYYY-MM` |
| écart | ligne de l'écran Vérifier ma paie (jamais « erreur ») |

---

## 16. Décisions à confirmer avant la phase 1

Réponds à ces points dans le rapport de phase 1 ou avant de commencer ; ma recommandation entre parenthèses.

1. **Relevé PDF** : gabarit HTML + `window.print()` (zéro dépendance, hors ligne, « Enregistrer en PDF » du système) ou vrai fichier généré (`pdf-lib`) ? *(recommandé : print en v1)*
2. **Types nominaux `Cents`/`Minutes`** : on accepte le renforcement du §6 ? *(recommandé : oui)*
3. **Nom et périmètre de la première release** : les 8 phases avant toute mise sur l'écran d'accueil, ou une bascule utilisable dès la phase 5 ?
4. **Liste des codes d'indemnités** livrée vide en v1 : la liste du SPEC §8 suffit-elle, ou en manque-t-il dans ta convention ?
5. **Rappel de sauvegarde** : toutes les deux semaines + alerte à 30 jours, tel quel ? Et où va l'export (partage système / fichier) ?

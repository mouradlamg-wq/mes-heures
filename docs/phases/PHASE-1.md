# Phase 1 — Types et primitives

`pnpm verify` vert. 90 tests.

## Décisions du CLAUDE.md §16

Répondues avant de commencer, comme demandé.

1. **Relevé PDF** → gabarit HTML + `window.print()`. Zéro dépendance, hors ligne,
   « Enregistrer en PDF » du système. À faire en phase 7.
2. **Types nominaux `Cents` / `Minutes`** → oui, adoptés. Voir
   `src/engine/primitives/brands.ts`.
3. **Rythme de livraison** → phases 1 à 4 d'affilée (le socle technique, sans
   décision métier), rapport écrit à chaque étape, **arrêt franc avant la
   phase 5**. La saisie est la phase qui décide de l'adoption : elle mérite un
   avis avant d'être écrite.
4. **Liste des codes d'indemnités** → celle du SPEC §8, livrée **sans aucun
   montant** (`CODES_INDEMNITES_COURANTS`, vérifié par `IND-33`). Question
   ouverte : en manque-t-il dans ta convention ?
5. **Rappel de sauvegarde** → 14 jours puis alerte à 30, tel quel. Destination de
   l'export : question ouverte, voir `PHASE-4.md`.
6. **Design system « Modernist »** → le fichier n'était pas fourni ; il sera
   reconstruit depuis `DESIGN.md` en phase 5, et restera remplaçable : aucune
   valeur visuelle ne sera écrite ailleurs que dans ses variables.

## Fait

**Échafaudage** — Vite 8 + React 19 + TypeScript 5.9 en `strict`, avec
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
`noUnusedLocals/Parameters`, `verbatimModuleSyntax`. Vitest 4, ESLint 10 à plat,
`vite-plugin-pwa`. Arborescence du CLAUDE.md §4 en place.

**Le fuseau de test est forcé hors `Europe/Paris`** (`America/New_York`, posé dans
`vite.config.ts`) et `vitest.setup.ts` refuse de démarrer si le processus se
retrouvait dans la zone de référence. `TPS-02` le vérifie sur un cas réel : si la
zone du navigateur fuyait dans le moteur, l'offset produit serait `−04:00` au
lieu de `+01:00`.

**Types nominaux `Cents` et `Minutes`** (`src/engine/primitives/brands.ts`).
`cents()` refuse un non-entier ; `minutes()` refuse en plus une valeur négative —
une durée négative n'est pas un cas métier, c'est une fin de service qui précède
sa prise, et c'est à la qualification de le dire. Un montant négatif reste
accepté : une régularisation existe sur une fiche de paie. → `NUM-01` à `NUM-06`.

**`roundingPolicy`** — un seul point d'arrondi, exporté et testé. Règle unique :
demi vers le haut **en valeur absolue**, donc symétrique (`−0,5 → −1`, là où
`Math.round` de JavaScript donne `0`). Une correction d'erreur binaire évite que
`1,005 × 100` s'arrondisse vers le bas une fois sur deux. `valoriserMajore()`
existe pour que durée × taux × majoration n'arrondisse qu'une fois. → `NUM-09` à
`NUM-13`.

**Conversion minutes → centièmes exhaustive sur les 60 valeurs**, contre une table
écrite à la main dans le test (`NUM-07`). La recalculer avec la fonction testée
n'aurait rien prouvé. `NUM-09` matérialise l'arrondi en cascade que le SPEC §10
interdit : `3 × 0,33 = 0,99` contre `1,00`.

**`CalculationResult`** avec ses trois helpers. `partial()` refuse un intervalle
inversé (bug de programmation) et **normalise `min === max` en `complete`**.
`sommer()` propage strictement : un seul `unknown` rend le total `unknown` — on ne
borne pas ce qu'on ignore. → `PRV-01` à `PRV-21`.

**Formatage centralisé** — aucun `toFixed`, aucun flottant : le double affichage
se construit par découpage d'un entier de centièmes, donc le formateur ne peut
pas introduire un arrondi que le moteur n'aurait pas décidé. Espaces insécables,
virgule décimale, signe moins typographique `−`, tiret demi-cadratin pour les
intervalles. `MENTIONS` porte les deux phrases obligatoires au mot près.

**`parseHeureLocale`** — l'algorithme n'interroge pas Luxon sur « la bonne
réponse » : il énumère les offsets plausibles autour de l'heure murale et garde
ceux qui sont cohérents avec eux-mêmes. Zéro candidat = l'heure n'existe pas ;
deux = elle existe deux fois. C'est la seule façon de distinguer les deux cas sans
se faire corriger silencieusement. Le message de refus calcule les heures réelles
du saut (« les horloges passent de 02:00 à 03:00 ») par recherche dichotomique
dans la base IANA, au lieu de les écrire en dur. → `TPS-03` à `TPS-09`, `TPS-22`.

**Test d'architecture** (`tests/architecture.test.ts`) — 12 contrôles actifs :
pas de React, Dexie, `window`, `Date.now()`, `?? 0`, `'Europe/Paris'`, `toFixed`,
`Math.round` hors `roundingPolicy`, `fetch`, `console.log`, ni montant en dur.

**Méta-test de couverture** (`tests/cases.test.ts`) — relie mécaniquement les
185 lignes de `tests/cases/*.md` aux titres de tests, dans les deux sens. Les
lignes non encore couvertes sont déclarées explicitement avec la phase qui les
prendra, et un test interdit d'oublier une entrée dans cette liste une fois le
test écrit.

## Supposé

1. **`TZ` posé dans `vite.config.ts` plutôt que dans le script npm.** Node
   applique le changement à chaud, y compris sous Windows — vérifié. Si un jour
   ce n'était plus vrai sur une plateforme, `vitest.setup.ts` planterait au
   démarrage plutôt que de laisser passer des tests faussement verts.
2. **Les secondes sont refusées à la lecture d'un instant.** La saisie est à la
   minute (SPEC §10) ; un ISO portant `:30` en secondes vient forcément d'ailleurs.
   Si un import légitime en contenait, il serait rejeté — le refus est visible,
   pas silencieux.
3. **`partial` avec `min === max` devient `complete`.** C'est une normalisation
   de représentation, pas une décision métier : la valeur et le statut disent la
   même chose. Si tu préfères voir passer un `partial` de largeur nulle, dis-le.
4. **Ordre des choix d'une heure ambiguë : du plus tôt au plus tard.** L'UI
   étiquettera le premier « avant le changement d'heure ». C'est l'ordre naturel,
   mais il est porté par le code, pas par le SPEC.
5. **TypeScript reste en 5.9** alors que la 7.0 est sortie : `typescript-eslint`
   plafonne à `<6.1`. À reprendre quand l'outillage suivra.

## Ambigu

Rien qui bloque la phase 2. Deux points restent ouverts et te reviennent :

1. **L'arrondi conventionnel.** Le moteur applique « demi vers le haut ». Si ta
   convention arrondit autrement (au quart d'heure supérieur, à la minute
   inférieure, à l'heure), ce n'est pas le même calcul et ça change ta paie.
   Regarde une de tes fiches : quand tu as fait 7 h 37, elle affiche quoi ?
2. **La liste des codes d'indemnités** (§16.4 du CLAUDE.md) est livrée telle que
   le SPEC §8 la donne : repas, repas unique, casse-croûte, spéciale, découcher,
   repas découcher — **sans aucun montant**. Est-ce qu'il en manque dans ta
   convention ?

## Dette

- **Les icônes PWA n'existent pas.** `vite.config.ts` déclare `icon-192.png`,
  `icon-512.png` et `icon-512-maskable.png` ; `public/` est vide. L'installation
  sur l'écran d'accueil échouera tant que ce n'est pas fait — c'est la phase 8, mais
  c'est déjà écrit dans le manifeste.
- **`src/app/main.tsx` est un écran d'attente**, remplacé en phase 5.
- **`ARC-08`, `ARC-09`, `ARC-16` sont déclarés mais pas implémentés** : ils
  portent sur `src/ui` et `src/pdf`, qui n'existent pas encore.
- **La liste `A_COUVRIR_PLUS_TARD`** de `tests/cases.test.ts` doit être vide à la
  fin de la phase 4, hors lignes marquées phase 5 et au-delà. Elle est relue à
  chaque rapport.

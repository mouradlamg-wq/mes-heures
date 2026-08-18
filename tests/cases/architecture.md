# ARC — Pureté du moteur, règle des dépendances

Source : CLAUDE.md §4. « Ce test est aussi important que les tests de calcul : c'est lui qui
garde le moteur testable. »

| Id | Cas | Attendu |
|---|---|---|
| ARC-01 | Aucun fichier de `src/engine/**` n'importe `react` | échec du test sinon |
| ARC-02 | Aucun fichier de `src/engine/**` n'importe `dexie` ou `dexie-react-hooks` | idem |
| ARC-03 | Aucun fichier de `src/engine/**` n'importe `src/db`, `src/ui`, `src/pdf` ou `src/app` | idem |
| ARC-04 | Aucun fichier de `src/engine/**` ne référence `window`, `document`, `localStorage`, `navigator` | idem |
| ARC-05 | Aucun fichier de `src/engine/**` n'appelle `Date.now()` ni `new Date()` sans argument | le temps courant est un paramètre |
| ARC-06 | Aucun fichier de `src/engine/**` hors `format` n'utilise `Intl` implicitement | le formatage est centralisé |
| ARC-07 | `src/db/**` n'importe de `src/engine` que des **types** | pas d'appel de calcul depuis la persistance |
| ARC-08 | `src/pdf/**` ne contient aucune arithmétique métier | pas de `*`, `/`, `+` sur des durées ou des montants |
| ARC-09 | `src/ui/**` ne contient aucune arithmétique métier | idem, contrôlé sur les identifiants métier du glossaire |
| ARC-10 | Aucun import de `date-fns`, `moment`, `dayjs` nulle part | Luxon est la seule lib de date |
| ARC-11 | Aucun `?? 0` ni `|| 0` dans `src/engine/**` | un réglage absent ne devient jamais zéro |
| ARC-12 | Aucun littéral `'Europe/Paris'` hors du défaut de `Settings` | la zone vient toujours des réglages |
| ARC-13 | La surface publique du moteur est `src/engine/index.ts` | l'UI n'importe aucun chemin profond du moteur |
| ARC-14 | Aucun `toFixed` dans `src/engine/**` | un seul point d'arrondi, `roundingPolicy` |
| ARC-15 | Aucun `console.log` laissé en place | `warn` et `error` tolérés hors du moteur |
| ARC-16 | Aucune fonction publique du moteur ne retourne un `number` nu | contrôlé sur les signatures exportées par `index.ts` |
| ARC-17 | Aucun appel réseau (`fetch`, `XMLHttpRequest`, `WebSocket`) dans tout `src/**` | l'app est hors ligne par construction |
| ARC-18 | Aucun montant, taux ni seuil en dur dans `src/**` | pas de nombre à deux décimales suivi de `€`, pas de `35`/`2100` isolé dans un calcul |

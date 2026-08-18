# Table de cas limites

Cette table s'écrit **avant** le code (CLAUDE.md §13). Chaque ligne porte un identifiant
stable ; chaque identifiant est référencé dans le titre d'un test, sous la forme :

```ts
it('TPS-04 — heure locale inexistante → invalid, jamais de correction', () => { … })
```

Règles d'entretien :

- On **complète** la table quand on découvre une frontière. On ne **supprime** jamais une ligne.
- Si une ligne devient non pertinente, on la marque `ABANDONNÉ` avec la raison, et on garde l'identifiant.
- Un identifiant n'est jamais réattribué.
- Une ligne sans test est une dette : elle apparaît dans le rapport de phase.

Un test `tests/cases.test.ts` vérifie mécaniquement que **chaque identifiant de la table a au
moins un test** et que **chaque identifiant cité par un test existe dans la table**.

| Fichier | Domaine | Préfixe | Phase |
|---|---|---|---|
| [temps-dst.md](temps-dst.md) | Temps, fuseau, DST, journée de service | `TPS` | 1 |
| [nombres.md](nombres.md) | Centimes, minutes, centièmes, arrondi | `NUM` | 1 |
| [preuves.md](preuves.md) | `CalculationResult`, `steps`, `sources` | `PRV` | 1 → 3 |
| [qualification.md](qualification.md) | Chevauchements, trous, `range` | `QUA` | 2 |
| [periodes.md](periodes.md) | Périodes de paie, semaines, rattachement | `PER` | 3 |
| [paie.md](paie.md) | Temps rémunéré, heures supplémentaires | `PAI` | 3 |
| [indemnites.md](indemnites.md) | Déclencheurs, incompatibilités | `IND` | 3 |
| [donnees.md](donnees.md) | Dexie, migrations, export / import | `DON` | 4 |
| [architecture.md](architecture.md) | Pureté du moteur, règle des dépendances | `ARC` | 1 |

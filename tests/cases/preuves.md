# PRV — CalculationResult, steps, sources

Source : SPEC §4, §13 « Preuves ». Le moteur produit des preuves, pas des nombres.

| Id | Cas | Attendu |
|---|---|---|
| PRV-01 | `complete(valeur, …)` | `status: 'complete'`, `value` défini, `range` absent |
| PRV-02 | `partial(range, …)` | `status: 'partial'`, `range` défini, `value` absent — jamais les deux |
| PRV-03 | `unknown(raison, …)` | `status: 'unknown'`, ni `value` ni `range`, `warnings` contient la raison en français |
| PRV-04 | `partial` avec `min > max` | rejet : un intervalle inversé est un bug de programmation |
| PRV-05 | `partial` avec `min === max` | accepté mais signalé : c'est en réalité un `complete`, un helper le normalise |
| PRV-06 | Tout résultat financier porte au moins une `RuleSource` | balayage de toutes les fonctions publiques retournant des `Cents` |
| PRV-07 | Tout résultat dépendant d'un réglage porte au moins une `RuleSource` | idem, y compris les résultats `unknown` (la source dit *quel* réglage manque) |
| PRV-08 | Une amplitude brute (`fin − début`) ne porte **aucune** `RuleSource` | `sources` vide — pas de source bidon |
| PRV-09 | Un temps de conduite brut ne porte aucune `RuleSource` | idem PRV-08 |
| PRV-10 | Valeur issue d'un texte, modifiée par l'utilisateur | `kind: 'personnalise'` avec `base` renseignée sur la source d'origine |
| PRV-11 | Une source `personnalise` n'est jamais présentée comme `legal` | l'étiquette de restitution diffère, testée sur le formateur de source |
| PRV-12 | `steps` est ordonné | l'ordre de production est l'ordre de lecture, stable entre deux appels identiques |
| PRV-13 | Chaque `step` d'un calcul multi-jours permet de remonter aux `dayId` | tous les `dayId` d'entrée se retrouvent dans les `inputs` |
| PRV-14 | `inputs` distingue `saisie_utilisateur`, `reglage` et `derive` | une valeur saisie n'est jamais étiquetée `reglage` |
| PRV-15 | Propagation : étage N `partial` → étage N+1 `partial` | le statut et le `range` ne sont ni effacés ni « résolus » |
| PRV-16 | Propagation : étage N `unknown` → étage N+1 `unknown` | la raison d'origine reste lisible en fin de chaîne |
| PRV-17 | Combinaison de deux résultats `complete` | `complete`, `steps` et `sources` fusionnés sans doublon |
| PRV-18 | Combinaison `complete` + `partial` | `partial`, `range` = somme des bornes |
| PRV-19 | Combinaison `partial` + `unknown` | `unknown` l'emporte : on ne borne pas ce qu'on ignore |
| PRV-20 | Un cas métier non calculable ne lève jamais d'exception | retourne `unknown` ; les `throw` sont réservés aux bugs de programmation |
| PRV-21 | Les `steps` sont lisibles par un non-technicien | aucun identifiant technique nu dans `label` (contrôle : pas de `camelCase`, pas d'UUID) |
| PRV-22 | Brut mensuel d'un mois comportant une absence | brut `partial` ou `unknown`, tandis que heures sup et indemnités restent `complete` |

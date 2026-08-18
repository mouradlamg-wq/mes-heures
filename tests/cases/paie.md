# PAI — Temps rémunéré, heures supplémentaires

Source : SPEC §3, §7, §13 « Paie ». Seul `tempsRemunere` alimente la paie en v1.

## Temps rémunéré

| Id | Cas | Attendu |
|---|---|---|
| PAI-01 | Journée de conduite pleine, sans coupure | temps rémunéré = somme des segments `conduite` + `autre_travail` |
| PAI-02 | `fractionDisponibiliteRemuneree = 0.5`, 2 h de disponibilité | 1 h rémunérée, la fraction apparaît dans les `steps` avec sa source |
| PAI-03 | `fractionDisponibiliteRemuneree` absent, disponibilité présente | `unknown` sur le temps rémunéré — jamais compté à 0 ni à 100 % |
| PAI-04 | `fractionDisponibiliteRemuneree` absent, **aucune** disponibilité dans la journée | `complete` : un réglage manquant ne pénalise que les journées concernées |
| PAI-05 | `fractionDisponibiliteRemuneree = 0` explicitement saisi | 0 min rémunérée, `complete` — un zéro **choisi** est une donnée |
| PAI-06 | `coupuresRemunerees = [{ auDelaDeMinutes: 30, fraction: 0.5 }]`, coupure de 90 min | 60 min au-delà du seuil, 30 min rémunérées |
| PAI-07 | Coupure exactement égale au seuil (30 min) | rien au-delà, 0 min rémunérée, `complete` |
| PAI-08 | Plusieurs tranches de `coupuresRemunerees` | tranches appliquées dans l'ordre, aucun double comptage |
| PAI-09 | `coupuresRemunerees` absent, coupure présente | coupure non rémunérée mais **signalée** : le réglage vide est nommé dans les `warnings` |
| PAI-10 | Zone non qualifiée dans la journée (QUA-07) | `partial` + `range` propagés jusqu'au temps rémunéré |
| PAI-11 | Temps rémunéré d'une journée à cheval sur le passage à l'heure d'hiver | durée réelle, 25 h possibles dans la journée |
| PAI-12 | `tempsConduite` et `amplitude` ne portent aucune source | information brute (voir PRV-08) |
| PAI-13 | `tempsRemunere` porte au moins une source dès qu'un réglage l'a modifié | source `convention` ou `personnalise` |

## Heures supplémentaires

| Id | Cas | Attendu |
|---|---|---|
| PAI-20 | `modeDecompteHS = 'hebdomadaire'`, `dureeReferenceMinutes = 2100` (35 h), semaine à 39 h | 4 h supplémentaires |
| PAI-21 | Semaine à 35 h pile | 0 h sup, `complete` |
| PAI-22 | Semaine sous la durée de référence | 0 h sup, jamais de valeur négative |
| PAI-23 | `modeDecompteHS = 'mensuel'` | seuil mensuel appliqué une fois, pas une somme de seuils hebdomadaires |
| PAI-24 | `modeDecompteHS = 'periode_reference'` avec ancrage (PER-19) | seuil appliqué sur le bloc, pas sur la période de paie |
| PAI-25 | Les trois modes sur le même jeu de journées | trois résultats distincts, chacun cohérent, aucun ne se déguise en l'autre |
| PAI-26 | `dureeReferenceMinutes` absent | `unknown`, aucun 35 h en dur |
| PAI-27 | `modeDecompteHS` absent | `unknown` |
| PAI-28 | `estForfaitJours = true` | aucune heure supplémentaire, `complete` à 0, message expliquant pourquoi |
| PAI-29 | Tranches de majoration `[0→8 h : 25 %], [8 h→null : 50 %]`, 6 h sup | tout à 25 % |
| PAI-30 | Mêmes tranches, 12 h sup | 8 h à 25 % puis 4 h à 50 %, les deux lignes visibles dans les `steps` |
| PAI-31 | Mêmes tranches, 8 h sup exactement | tout à 25 %, la borne haute d'une tranche est exclusive |
| PAI-32 | `tranchesHS` absent | heures sup en **durée** `complete`, valorisation en **euros** `unknown` |
| PAI-33 | `tauxHoraireBaseCents` absent | valorisation `unknown`, la durée reste `complete` |
| PAI-34 | Tranches non contiguës ou qui se chevauchent (réglage incohérent) | refus explicite du réglage, pas de calcul silencieux |
| PAI-35 | Semaine `partial` (zone non qualifiée) | heures sup `partial` avec `range`, jamais une valeur unique |
| PAI-36 | Semaine à cheval, réglage de rattachement absent (PER-15) | deux jeux d'heures sup, un par hypothèse |
| PAI-37 | Valorisation : 4 h sup à 13,00 €/h majorées de 25 % | 65,00 € — un seul arrondi, en sortie |
| PAI-38 | Mois comportant une absence | brut global `partial`/`unknown`, heures sup et indemnités `complete` (PRV-22) |
| PAI-39 | Mois sans aucune absence, tous réglages présents | brut global `complete` |
| PAI-40 | Comparaison avec un `PayCheck` saisi | écart signé, en heures et en euros, chaque ligne dépliable sur ses `steps` |
| PAI-41 | Écart nul | ligne affichée quand même, avec la mention d'égalité — l'absence d'écart est une information |
| PAI-42 | Écart contenu dans le `range` d'un résultat `partial` | signalé comme compatible avec l'incertitude, pas comme un écart avéré |

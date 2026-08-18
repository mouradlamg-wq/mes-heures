# NUM — Centimes, minutes, centièmes, arrondi

Source : SPEC §10, §13 « Nombres ». Argent en centimes entiers, durées en minutes entières,
un seul point d'arrondi en sortie.

| Id | Cas | Attendu |
|---|---|---|
| NUM-01 | `cents(1250)` | valeur nominale acceptée |
| NUM-02 | `cents(12.5)`, `cents(NaN)`, `cents(Infinity)` | rejet — un non-entier ne franchit pas la frontière du moteur |
| NUM-03 | `cents(-500)` | accepté : une régularisation négative existe sur une fiche de paie |
| NUM-04 | `minutes(90)` | valeur nominale acceptée |
| NUM-05 | `minutes(90.5)`, `minutes(NaN)` | rejet |
| NUM-06 | `minutes(-30)` | rejet — une durée négative est un bug de programmation, pas un cas métier |
| NUM-07 | Minutes → centièmes, **les 60 valeurs** de `0` à `59` | table exhaustive, arrondi au centième, `30 → 0,50` `20 → 0,33` `40 → 0,67` `10 → 0,17` |
| NUM-08 | `7 h 30` → `7,50` ; `8 h 20` → `8,33` ; `18 h 15` → `18,25` | conversions de référence du SPEC et du DESIGN |
| NUM-09 | Absence d'arrondi en cascade : `(a + b + c)` converti une fois = `a`, `b`, `c` convertis puis sommés, sur un jeu de triplets choisis pour maximiser l'erreur (`00:20` × 3) | égalité stricte |
| NUM-10 | Un calcul en trois étapes donne le même centime qu'en une étape | égalité stricte |
| NUM-11 | `roundingPolicy` sur un demi exact (`0,005 €`, `0,5 min`) | règle unique et documentée : demi vers le haut en valeur absolue, symétrique pour les négatifs |
| NUM-12 | Application d'un taux : 10 h 20 à 13,45 €/h (`minutes(620)` × `cents(1345)` / 60) | un seul arrondi, en centimes, en sortie ; l'intermédiaire reste exact (138,98 €) |
| NUM-13 | Majoration en pourcentage (25 %) appliquée à un montant en centimes | pas de flottant résiduel, résultat entier |
| NUM-14 | Formatage d'une durée : `formatDuree(minutes(500))` | `8 h 20` **et** `8,33 h`, espaces insécables, virgule décimale |
| NUM-15 | Formatage d'une durée nulle | `0 h 00` et `0,00 h` — un zéro **calculé** s'affiche, contrairement à un `unknown` |
| NUM-16 | Formatage d'un montant : `formatMontant(cents(14820))` | `148,20 €`, espace insécable avant `€`, virgule décimale |
| NUM-17 | Formatage d'un montant négatif | signe `−` (moins typographique) et non `-` |
| NUM-18 | Formatage d'une durée supérieure à 24 h (`minutes(2000)`) | `33 h 20`, jamais de remise à zéro modulo 24 |
| NUM-19 | Écart signé, en euros et en heures | `+` explicite au-dessus de zéro, `−` typographique en dessous, aucun signe à zéro (l'absence d'écart est une information, pas un vide) |
| NUM-20 | Conversion centièmes → minutes (comparaison avec une fiche de paie en `18,25`) | `18,25 h` → `1095 min`, aller-retour stable avec NUM-07 |

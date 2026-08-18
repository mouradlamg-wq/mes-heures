# TPS — Temps, fuseau, DST, journée de service

Source : SPEC §5, §13 « Temps et DST ». Zone de référence par défaut `Europe/Paris`,
tests exécutés sous `TZ=America/New_York` (CLAUDE.md §8).

| Id | Cas | Attendu |
|---|---|---|
| TPS-01 | `parseHeureLocale('2027-03-16', '08:00', 'Europe/Paris')` un jour ordinaire | `ok`, instant `2027-03-16T08:00:00+01:00` |
| TPS-02 | Le même appel sous `TZ=America/New_York` | résultat identique à TPS-01 : la zone vient des réglages, pas du navigateur |
| TPS-03 | Heure locale ambiguë — `2027-10-31 02:30` `Europe/Paris` (recul des horloges) | `ambiguous` avec exactement deux choix, `+02:00` puis `+01:00`, dans cet ordre |
| TPS-04 | Heure locale inexistante — `2027-03-28 02:30` `Europe/Paris` (avance des horloges) | `invalid`, `reason` en français mentionnant le saut 02:00 → 03:00, aucun instant produit |
| TPS-05 | `2027-03-28 03:00`, première heure existante après le saut | `ok` |
| TPS-06 | `2027-10-31 02:00` et `03:00`, bornes de la plage ambiguë | 02:00 `ambiguous`, 03:00 `ok` |
| TPS-07 | Heure syntaxiquement invalide (`25:00`, `08:60`, `8h`, vide) | `invalid`, message explicite, jamais de correction |
| TPS-08 | Date syntaxiquement invalide (`2027-02-30`) | `invalid` |
| TPS-09 | Zone de référence inconnue (`'Europe/Atlantide'`) | `invalid`, message nommant la zone |
| TPS-10 | Durée entre deux instants encadrant le passage à l'heure d'été | durée réelle en minutes, l'heure sautée n'est pas comptée |
| TPS-11 | Durée entre deux instants encadrant le passage à l'heure d'hiver | durée réelle, l'heure doublée est comptée une fois de plus |
| TPS-12 | Journée de service lundi 22:00 → mardi 06:00 | `dateRattachement` = le lundi, durée 8 h |
| TPS-13 | Journée entièrement dans un jour calendaire | rattachement au même jour, aucun cas particulier |
| TPS-14 | Journée du jour d'avance des horloges, 00:00 → 08:00 local | amplitude 7 h et non 8 h |
| TPS-15 | Journée du jour de recul des horloges, 00:00 → 08:00 local | amplitude 9 h et non 8 h |
| TPS-16 | Sérialisation : instant → ISO → instant | aller-retour strictement identique, offset conservé |
| TPS-17 | ISO sans offset stocké en base (donnée corrompue) | refus explicite, pas d'interprétation dans la zone locale |
| TPS-18 | `finService` antérieure à `priseService` | `invalid` métier signalé, aucune amplitude négative produite |
| TPS-19 | `finService` égale à `priseService` | amplitude 0, `complete` (une journée annulée sur place est un cas réel) |
| TPS-20 | Deux instants identiques exprimés avec des offsets différents (`+01:00` / `+02:00` pointant le même moment) | reconnus égaux, la comparaison porte sur l'instant absolu |
| TPS-21 | `jourDeService(instant, zone)` sur un instant à `00:00` pile | rattaché au jour qui commence, jamais au précédent |
| TPS-22 | Zone de référence autre qu'`Europe/Paris` (`'Indian/Reunion'`, sans DST) | aucun cas ambigu ni invalide sur l'année |

## Non couvert volontairement

- Les secondes : la saisie est à la minute (SPEC §10). Un ISO portant des secondes non nulles est refusé (TPS-17 le couvre par la même porte d'entrée).
- Les calendriers non grégoriens : hors périmètre.

# PER — Périodes de paie, semaines, rattachement

Source : SPEC §7, §13 « Périodes ». Le mois civil n'est pas la période de paie.

| Id | Cas | Attendu |
|---|---|---|
| PER-01 | `payPeriodConfig.jourDebut = 1` | période = mois civil, `debut` 01, `fin` dernier jour du mois |
| PER-02 | `payPeriodConfig.jourDebut = 26` | période du 26 au 25 du mois suivant, libellé portant le mois de fin |
| PER-03 | `jourDebut = 31` sur un mois de 30 jours | la période commence au dernier jour existant, jamais un débordement silencieux sur le mois suivant |
| PER-04 | `jourDebut = 29` en février d'une année non bissextile | même règle que PER-03, testée sur février 2027 |
| PER-05 | `payPeriodConfig` absent | `unknown` avec message nommant le réglage manquant — **pas** de repli sur le mois civil |
| PER-06 | Périodes consécutives | aucun jour en double, aucun jour manquant, sur douze mois consécutifs |
| PER-07 | Période contenant le passage à l'heure d'été | les bornes restent des dates, la durée réelle des jours varie |
| PER-08 | `debutSemaine = 1` (lundi, régime supplétif) | semaine du lundi au dimanche |
| PER-09 | `debutSemaine = 4` (jeudi) | semaine du jeudi au mercredi, aucune hypothèse lundi cachée |
| PER-10 | `debutSemaine` absent alors que `modeDecompteHS = 'hebdomadaire'` | `unknown` explicite ; le lundi n'est **pas** appliqué en douce |
| PER-11 | Semaine entièrement contenue dans une période | rattachement trivial, aucune hypothèse produite |
| PER-12 | Semaine à cheval (29 janv. → 4 févr.) avec `rattachementSemaineChevauchante = 'periode_de_fin'` | heures sup entières sur la période de février |
| PER-13 | Idem avec `'periode_de_debut'` | heures sup entières sur la période de janvier |
| PER-14 | Idem avec `'prorata'` | répartition au prorata des jours, arrondi unique, somme des deux parts = total |
| PER-15 | Idem, réglage **absent** | deux hypothèses produites, aucune choisie, mention « selon la règle appliquée par ton employeur » |
| PER-16 | Le jeu d'hypothèses de PER-15 est stable et nommé | chaque hypothèse porte un libellé lisible et le réglage qu'elle suppose |
| PER-17 | `modeDecompteHS = 'periode_reference'` sans `periodeReferenceDebut` | `unknown`, message expliquant que « 4 semaines » ne veut rien dire sans point d'ancrage |
| PER-18 | `modeDecompteHS = 'periode_reference'` sans `periodeReferenceSemaines` | `unknown` |
| PER-19 | `periodeReferenceSemaines = 4`, ancrage donné | découpage en blocs de 4 semaines depuis l'ancrage, y compris en remontant avant l'ancrage |
| PER-20 | Une journée de service commencée le dernier jour d'une période et finie le premier de la suivante | rattachée à la période de sa **prise de service** (règle du rattachement, SPEC §5) |
| PER-21 | Période exprimée dans une zone de référence autre que celle du navigateur | bornes calculées dans `timeZoneReference` |
| PER-22 | Un `PayPeriod` n'est jamais déduit d'une chaîne `YYYY-MM` | contrôle d'API : la fonction de calcul de paie n'accepte pas de mois |
| PER-23 | Semaine à cheval sur deux **années** (déc. → janv.) | même traitement que PER-12 à PER-15, pas de cas particulier de fin d'année |
| PER-24 | `prorata` sur une semaine dont un seul jour tombe dans la période | part correcte, aucune division par zéro |

# QUA — Chevauchements, trous, range

Source : SPEC §6, §13 « Qualification ». Le moteur ne fabrique jamais une qualification
qu'il ne peut pas déduire.

| Id | Cas | Attendu |
|---|---|---|
| QUA-01 | Journée nominale : prise 06:00, segments jointifs, fin 14:00 | `complete`, aucune zone non qualifiée |
| QUA-02 | Chevauchement de **types identiques** — `08:00–10:00 conduite` et `09:00–11:00 conduite` | fusion en `08:00–11:00`, un seul intervalle, durée 3 h et non 4 h |
| QUA-03 | Segments identiques adjacents (`08:00–10:00` puis `10:00–11:00`, même type) | fusionnés en un intervalle |
| QUA-04 | Chevauchement de **types différents** — `08:00–10:00 conduite` et `09:00–11:00 disponibilité` | `09:00–10:00` indéterminée ; `partial` + `range` ; aucun arbitrage |
| QUA-05 | Chevauchement partiel de trois types différents sur la même minute | zone indéterminée unique couvrant l'intersection, les trois types cités dans le message |
| QUA-06 | Segment strictement inclus dans un autre, type différent | l'inclusion entière devient indéterminée, le reste du segment englobant reste qualifié |
| QUA-07 | Trou non qualifié — prise 06:00, `06:00–10:00`, `14:00–18:00`, fin 18:00 | `partial`, certain 8 h, non qualifié 4 h, `range` 8 h → 12 h |
| QUA-08 | Trou en début de journée — prise 06:00, premier segment à 07:00 | trou `06:00–07:00` signalé, non inventé |
| QUA-09 | Trou en fin de journée — dernier segment à 17:00, fin 18:00 | trou `17:00–18:00` signalé |
| QUA-10 | Journée sans `finService` | `partial` — la borne haute est ouverte, explicitement signalée |
| QUA-11 | Journée sans `priseService` mais avec des segments | `partial`, borne basse ouverte |
| QUA-12 | Journée sans aucun segment mais avec prise et fin | amplitude `complete`, temps rémunéré `partial` avec `range` 0 → amplitude |
| QUA-13 | Journée entièrement vide | `unknown` — rien à borner |
| QUA-14 | Segment sans `fin` | `partial`, le segment ouvert est signalé, sa durée n'est pas devinée |
| QUA-15 | Segment sans `debut` ni `fin` | ignoré du calcul de durée mais signalé dans les `warnings`, jamais compté à zéro |
| QUA-16 | Segment débordant hors de l'amplitude (avant la prise ou après la fin) | signalé, la partie hors amplitude n'est pas silencieusement rognée |
| QUA-17 | Qualification manuelle d'une zone | bascule en `complete`, `range` disparaît, `value` = borne correspondante |
| QUA-18 | Qualification manuelle d'une **partie** de la zone | reste `partial`, `range` resserré |
| QUA-19 | Journée à cheval sur minuit avec trou après minuit | trou correctement situé sur la journée de service, pas coupé au jour calendaire |
| QUA-20 | Segment de durée nulle (`10:00–10:00`) | accepté, durée 0, n'ouvre aucun trou |
| QUA-21 | Segments donnés dans le désordre chronologique | résultat identique au même jeu trié |
| QUA-22 | Deux zones non qualifiées disjointes | deux zones distinctes, `range` cumulant les deux |
| QUA-23 | Le `range` d'un trou est borné par le **type le plus favorable et le moins favorable** disponibles | min = zone comptée pour 0, max = zone comptée pleine ; jamais un milieu arbitraire |
| QUA-24 | Chevauchement de types identiques **et** trou dans la même journée | les deux traitements coexistent sans interférence |
| QUA-25 | Une journée `partial` reste `partial` après ajout d'un segment qui ne comble pas le trou | pas de bascule prématurée en `complete` |

# SEM — Écran « Ma semaine / Ma période »

Source : SPEC §11, DESIGN.md §9 et la maquette `docs/aperçu`. Famille ajoutée en
phase 6.

Le tableau montre des **durées brutes**, jour par jour. La v1 ne qualifie
aucune conformité : ni durée maximale, ni repos minimal, ni feu tricolore.

| Id | Cas | Attendu |
|---|---|---|
| SEM-01 | Une ligne par jour du calendrier | y compris les jours sans rien : c'est ce qui distingue un repos d'un oubli de saisie |
| SEM-02 | Jour sans journée ni absence | ligne `repos`, aucun chiffre |
| SEM-03 | Jour couvert par une absence | ligne `absence` portant son type, aucune valorisation |
| SEM-04 | Une absence de plusieurs jours couvre chacun de ses jours | une ligne `absence` par jour, pas une seule |
| SEM-05 | Jour travaillé | amplitude, conduite et temps rémunéré, chacun avec son statut |
| SEM-06 | Le total additionne les journées **calculables** | une journée incalculable en est exclue et comptée à part, sinon elle masquerait toutes les autres |
| SEM-07 | Le total porte l'avertissement des journées écartées | le chiffre ne circule jamais sans son décompte |
| SEM-08 | Une journée partielle rend le total `partial` | intervalle `min – max`, jamais une valeur seule |
| SEM-09 | Statut de lecture du total | `partial` dès qu'une journée est écartée, même si les journées retenues sont toutes certaines |
| SEM-10 | Aucune journée calculable | `unknown` avec sa cause, aucun chiffre |
| SEM-11 | Décomptes | jours certains, partiels, incalculables, d'absence et de repos, sans recouvrement |
| SEM-12 | Bornes de période issues des réglages | jamais un mois déduit — sans `payPeriodConfig`, l'écran refuse et renvoie au réglage |
| SEM-13 | Bornes de semaine issues des réglages | sans `debutSemaine`, l'écran refuse : le lundi n'est pas supposé |
| SEM-14 | Intervalle inversé | aucune ligne, aucun total inventé |

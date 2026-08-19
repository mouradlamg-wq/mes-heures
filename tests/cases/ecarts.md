# ECA — Écran « Vérifier ma paie »

Source : SPEC §11, DESIGN.md §11 et la maquette `docs/aperçu`. Famille ajoutée en
phase 7. Complète `PAI-40` à `PAI-42`.

Le vocabulaire est **écart**, jamais erreur. Un écart peut venir des deux côtés :
d'une saisie oubliée comme d'une ligne manquante sur la fiche.

| Id | Cas | Attendu |
|---|---|---|
| ECA-01 | Ligne calculée et fiche saisie | écart signé, positif quand l'app compte plus que la fiche |
| ECA-02 | Ligne calculée, fiche **non** saisie | **aucun écart** — une ligne non comparée n'est pas un écart de zéro |
| ECA-03 | Ligne incalculable, fiche saisie | aucun écart, la ligne reste visible avec sa cause |
| ECA-04 | Résultat `partial`, fiche **dans** l'intervalle | écart nul marqué « compatible avec l'incertitude », pas un écart avéré |
| ECA-05 | Résultat `partial`, fiche **hors** de l'intervalle | écart mesuré depuis la borne la plus proche |
| ECA-06 | Heures de la fiche lues en centièmes | `17,00` sur la fiche vaut 17 h 00, pas 17 minutes |
| ECA-07 | Le compteur ne mélange jamais heures et euros | deux valeurs distinctes : l'écart d'heures sup, et celui des indemnités |
| ECA-08 | Cumul des indemnités | somme des écarts **en euros** des seules lignes d'indemnités, ni le brut ni le temps rémunéré |
| ECA-09 | Indemnité relevée en quantité | comparaison en quantité |
| ECA-10 | Indemnité relevée en montant | comparaison en montant — c'est ce qui se retrouve sur le net |
| ECA-11 | Aucune fiche saisie | toutes les lignes visibles, aucune comparée, aucun écart inventé |
| ECA-12 | Décomptes de lignes | lignes comparées et lignes incalculables, cohérents avec le contenu |
| ECA-13 | Statut d'ensemble | `complete` si tout est certain, `partial` si une ligne ne l'est pas, `unknown` si aucune ne l'est |
| ECA-14 | Le brut n'apparaît que s'il a été relevé | sinon la ligne est absente, pas vide |
| ECA-15 | Chaque ligne permet de remonter aux journées | les `dayId` de la période sont portés par la ligne |

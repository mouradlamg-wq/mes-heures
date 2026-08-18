# INT — Interface

Source : DESIGN.md §4, §6, §8, §14 et CLAUDE.md §9, §10. Famille ajoutée en
phase 5, quand les premiers écrans sont apparus.

L'UI ne calcule rien : ce qui est testé ici, c'est **la restitution** — qu'un
`unknown` ne montre aucun chiffre, qu'une durée sorte toujours dans ses deux
notations, et qu'une zone non qualifiée reste atteignable en un appui.

| Id | Cas | Attendu |
|---|---|---|
| INT-01 | Mention obligatoire des écrans de durées | présente **au mot près**, ni raccourcie ni en accordéon |
| INT-02 | Mention obligatoire de l'écran Vérifier ma paie | idem, au mot près |
| INT-03 | Rendu d'un résultat `unknown` | aucun chiffre, aucun `0`, aucun `—` : une phrase, sa cause, un lien vers le réglage |
| INT-04 | Rendu d'un résultat `partial` | l'intervalle `min – max`, jamais une valeur seule |
| INT-05 | Rendu d'un résultat `complete` | la valeur, dans les **deux** notations |
| INT-06 | Statut affiché en toutes lettres | `CERTAIN` / `PARTIEL` / `INCALCULABLE`, jamais une icône seule |
| INT-07 | Saisie d'une heure : quatre chiffres | les deux points s'écrivent seuls, `0540` → `05:40` |
| INT-08 | Saisie d'une heure hors plage (`25:00`) | refus en une phrase sous le champ, **aucune correction** |
| INT-09 | Aucun sélecteur d'heure à faire défiler | les champs d'heure sont `inputmode="numeric"`, jamais un `<select>` ni un `type="time"` |
| INT-10 | La liste de la journée montre les zones **du moteur** | deux coupures qui se suivent forment une seule ligne, la qualification manuelle y prend sa place |
| INT-11 | Une zone non qualifiée est une ligne à part | signalée, hachurée, et cliquable sur toute sa largeur |
| INT-12 | Un segment sans borne reste visible | listé en fin de journée, éditable, sans durée inventée |
| INT-13 | Cible tactile minimale | 44 px sur tout élément actionnable, 46 px sur une ligne de segment |
| INT-14 | Rayon 0 et aucune ombre hors dialogue | contrôlé sur la feuille de styles |
| INT-15 | Le rouge n'est pas une couleur d'erreur | aucune règle ne colore un écart ou un échec en accent |
| INT-16 | Saisie d'une durée de référence, chiffre par chiffre | **chaque frappe est visible**, y compris les deux premières qui ne forment pas encore une durée lisible ; la valeur n'est enregistrée qu'à partir de trois chiffres |
| INT-17 | La saisie en cours est relue à l'écran | `15140` → « se lit 151 h 40, soit 151,67 h sur ta fiche » — les centièmes servent à comparer avec la fiche de paie |
| INT-18 | Sortie du champ de durée | l'affichage reprend la forme canonique `151:40` |

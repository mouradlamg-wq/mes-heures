# DON — Dexie, migrations, export / import

Source : SPEC §12, §13 « Données ». Aucun backend, aucun compte, aucun résultat de calcul persisté.

| Id | Cas | Attendu |
|---|---|---|
| DON-01 | Écriture puis relecture d'un `WorkDay` | identique au champ près, instants conservés avec leur offset |
| DON-02 | Les instants sont stockés en **chaînes ISO 8601 avec offset** | contrôle du contenu brut en base : aucun objet Luxon, aucun timestamp nu |
| DON-03 | Aucun résultat de calcul n'est persisté | aucune table ne porte de temps rémunéré, d'heures sup ni de montant calculé |
| DON-04 | La complétude d'une journée est dérivée, jamais stockée | aucun champ `statut` sur `WorkDay` |
| DON-05 | Export JSON puis import dans une base vide | aller-retour strictement identique |
| DON-06 | L'export porte un numéro de version de schéma et une date | présents et lisibles |
| DON-07 | Import d'un JSON syntaxiquement invalide | refus propre, message en français, **données existantes intactes** |
| DON-08 | Import d'un JSON valide mais au schéma incorrect (champ manquant, type faux) | refus par Zod, message nommant le champ, données intactes |
| DON-09 | Import d'un export d'une version **plus récente** que l'app | refus explicite, pas de lecture partielle |
| DON-10 | Import d'un export d'une version **plus ancienne** | migré à la lecture, aucune perte |
| DON-11 | L'import est atomique | une erreur en milieu d'import ne laisse pas la base à moitié écrasée |
| DON-12 | Import sur une base non vide | le mode est explicite (remplacement ou fusion), jamais implicite |
| DON-13 | Migration de schéma v1 → v2 | aucune perte, testée sur un jeu peuplé |
| DON-14 | `navigator.storage.persist()` refusé | le retour est **lu** et l'app renforce ses rappels de sauvegarde |
| DON-15 | `navigator.storage.persist()` indisponible (API absente) | pas de crash, traité comme un refus |
| DON-16 | Rappel de sauvegarde après 14 jours | proposé |
| DON-17 | Alerte après 30 jours sans sauvegarde | affichée, et c'est le seul usage d'alerte du rouge dans l'app (DESIGN §10) |
| DON-18 | Date du dernier export conservée après un import | l'import ne se fait pas passer pour une sauvegarde |
| DON-19 | `Settings` : seul `timeZoneReference` est requis | un `Settings` sans aucun autre champ est valide et persistable |
| DON-20 | Suppression d'un `WorkDay` | ses segments partent avec lui, aucun orphelin |
| DON-21 | Deux `WorkDay` sur la même `dateRattachement` | refus : une journée de service par jour de rattachement |
| DON-22 | Volume : 3 ans de journées (≈ 800) | export, import et lecture d'une période restent utilisables |
| DON-23 | Un `PayCheck` saisi n'écrase jamais une donnée calculée | les deux coexistent, la comparaison est dérivée |
| DON-24 | Le fichier d'export ne contient aucune donnée nominative non saisie par l'utilisateur | pas d'identifiant d'appareil, pas d'horodatage de navigation |

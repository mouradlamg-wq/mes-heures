# IND — Déclencheurs, incompatibilités

Source : SPEC §8, §13 « Indemnités ». Règles à implémenter littéralement.
Aucune indemnité pré-configurée avec un montant.

| Id | Cas | Attendu |
|---|---|---|
| IND-01 | `plage_horaire` `11:30–14:30`, coupure `11:00–15:00` | recouvrement intégral → déclenchée |
| IND-02 | Même plage, coupure `12:00–15:00` | recouvrement partiel → **non** déclenchée |
| IND-03 | Même plage, coupure `11:30–14:30` exactement | bornes incluses → déclenchée |
| IND-04 | Même plage, coupure `11:31–14:30` | non déclenchée, à la minute près |
| IND-05 | `dureeMinMinutes = 45`, coupure recouvrant la plage mais durant 30 min | non déclenchée |
| IND-06 | `dureeMinMinutes = 45`, coupure de 45 min pile | déclenchée, le seuil est inclusif |
| IND-07 | `typesSegmentEligibles` par défaut (`['coupure']`), plage recouverte par une `disponibilite` | non déclenchée |
| IND-08 | `typesSegmentEligibles = ['coupure', 'disponibilite']` | déclenchée sur l'un ou l'autre |
| IND-09 | Deux segments recouvrant ensemble la plage, mais aucun seul | **non** déclenchée — le recouvrement s'apprécie segment par segment |
| IND-10 | Plage traversant minuit `22:00–02:00`, journée rattachée au lundi, segment lundi 21:30 → mardi 02:30 | déclenchée, plage évaluée sur la **journée de service** |
| IND-11 | Même plage, segment mardi 22:00 → mercredi 02:30 sur une journée rattachée au lundi | non déclenchée : la plage a été évaluée sur le lundi |
| IND-12 | Plage traversant minuit un jour de changement d'heure | la plage est construite sur des **instants réels** ; si une de ses bornes tombe dans l'heure ambiguë ou inexistante, la ligne passe en `unknown` plutôt que d'arbitrer |
| IND-13 | `decouche` : `WorkDay.decouche = true`, deux `IndemniteConfig` distinctes (repos, repas) | les deux déclenchées, jamais une indemnité composite |
| IND-14 | `decouche = false` ou absent | aucune indemnité de découcher |
| IND-15 | `duree_service` `amplitudeMinMinutes = 720`, amplitude 11 h | non déclenchée |
| IND-16 | Même config, amplitude 12 h pile | déclenchée, seuil inclusif |
| IND-17 | `duree_service` sur une journée dont l'amplitude est inconnue (fin de service non saisie) | `unknown` — le déclenchement n'est pas deviné |
| IND-18 | `quantite_manuelle` | quantité saisie utilisée telle quelle, étiquetée `saisie_utilisateur` |
| IND-19 | `quantiteMaxParJour` par défaut (1), deux déclenchements le même jour | une seule indemnité |
| IND-20 | `quantiteMaxParJour = 2`, trois déclenchements | deux indemnités, le plafond apparaît dans les `steps` |
| IND-21 | Deux indemnités incompatibles éligibles (repas 15,00 € et repas unique 18,00 €) | retenue : la plus élevée ; l'arbitrage figure dans les `steps` avec les deux montants |
| IND-22 | Incompatibilité déclarée d'un seul côté (`A.incompatibleAvec = ['B']`, B muette) | l'incompatibilité s'applique quand même, elle est symétrique |
| IND-23 | Trois indemnités mutuellement incompatibles | une seule retenue, la plus élevée |
| IND-24 | Deux incompatibles dont l'une a un `montantCents` absent | l'arbitrage est `unknown` : on ne peut pas comparer à un montant qu'on n'a pas |
| IND-25 | `montantCents` absent sur une indemnité éligible | ligne `unknown`, jamais `0,00 €`, message nommant le réglage à remplir |
| IND-26 | `montantCents = 0` explicitement saisi | 0,00 € `complete` — un zéro choisi est une donnée (cf. PAI-05) |
| IND-27 | Aucune `IndemniteConfig` configurée | liste vide `complete`, pas `unknown` : ne rien avoir configuré est un état légitime |
| IND-28 | Chaque indemnité déclenchée porte sa `RuleSource` | `convention` ou `personnalise`, jamais `legal` sans texte |
| IND-29 | Cumul sur une période de paie | somme en centimes, un seul arrondi, chaque jour traçable via `dayId` |
| IND-30 | Une indemnité éligible sur une journée dont les données sont `partial` | signalée, le total de la période devient `partial` |
| IND-31 | `plageFin === plageDebut` (réglage incohérent) | refus explicite du réglage |
| IND-32 | Deux `IndemniteConfig` portant le même `code` | refus explicite : le code identifie la ligne de fiche de paie |
| IND-33 | La liste de codes proposée (repas, repas unique, casse-croûte, spéciale, découcher, repas découcher) est livrée **sans montant** | aucune valeur tarifaire dans le code source |

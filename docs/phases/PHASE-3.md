# Phase 3 — Moteur

`pnpm verify` vert. 212 tests (+94).

## Fait

### Temps rémunéré

Conduite et autre travail comptent en entier. La disponibilité compte pour la
fraction réglée — **absente, elle rend la journée `unknown`**, ni 0 ni 100 %
(`PAI-03`). Mais un réglage manquant ne pénalise que les journées qui en
dépendent : une journée sans disponibilité reste `complete` (`PAI-04`).

Une fraction saisie **à 0** donne `complete` (`PAI-05`) : un zéro choisi est une
donnée, un zéro absent est une ignorance. Toute l'app tient sur cette distinction.

Les coupures suivent des paliers cumulatifs, appliqués du seuil le plus haut au
plus bas pour qu'une minute ne soit comptée qu'une fois (`PAI-08`). Sans palier
réglé, la coupure n'est pas comptée — **mais c'est dit** (`PAI-09`), le réglage
vide est nommé dans les avertissements au lieu de disparaître dans un total.

### Périodes

`periodePour` refuse un `YYYY-MM` à l'entrée (`PER-22`) : c'est ce qui empêche le
mois civil de rentrer par la fenêtre. `jourDebut = 31` sur un mois de 30 jours
démarre au dernier jour existant, jamais un débordement qui décalerait toute la
série (`PER-03`, `PER-04`). Sans `payPeriodConfig`, `unknown` — pas de repli sur
le mois civil (`PER-05`), avec un message qui souffle la piste : « beaucoup
d'entreprises décomptent du 26 au 25, regarde ta fiche ».

`debutSemaine` absent en mode hebdomadaire donne `unknown` en rappelant que le
lundi est le régime supplétif, pas une constante (`PER-10`).

### Semaine à cheval — le cas où l'ignorance devient une fonctionnalité

Quand une semaine déborde de la période et que `rattachementSemaineChevauchante`
n'est pas réglé, `heuresSup` retourne `status: 'unknown'` **et** deux hypothèses
nommées, chacune portant le réglage qu'elle suppose (`PER-15`, `PER-16`,
`PAI-36`). Ni valeur, ni `range` : le conducteur regarde sa fiche, reconnaît la
sienne, et l'app proposera d'enregistrer le choix.

Le prorata est calculé **toujours depuis le début** : la part de la période de
début est arrondie, celle de la période de fin est le complément. Les deux parts
somment donc exactement au total quelle que soit la coupure (`PER-14` : 171 + 129
= 300 min).

### Heures supplémentaires

Les trois modes donnent trois résultats distincts sur le même jeu de journées
(`PAI-25`) — aucun ne se déguise en l'autre. Forfait jours → 0 h sup avec
l'explication (`PAI-28`). Tranches de majoration à borne haute **exclusive**
(`PAI-31`), validées : un trou, un chevauchement ou une dernière tranche fermée
sont refusés au lieu d'être calculés approximativement (`PAI-34`).

**Durée et montant sont dissociés** : tranches ou taux manquants laissent la
durée `complete` et rendent seulement la valorisation `unknown` (`PAI-32`,
`PAI-33`). C'est ce qui permet à un conducteur sans réglages de voir quand même
ses 18 heures sup.

### Indemnités

Les règles du SPEC §8 sont implémentées littéralement. Le recouvrement s'apprécie
**segment par segment** : deux coupures séparées par de la conduite ne cumulent
pas leur couverture (`IND-09`). Une plage traversant minuit est construite sur la
journée de service (`IND-10`), et la même coupure un jour plus tard ne déclenche
rien (`IND-11`).

L'incompatibilité est **symétrique** — la déclarer d'un seul côté suffit
(`IND-22`) — et se résout par composantes connexes, ce qui traite trois
indemnités en chaîne sans code particulier (`IND-23`). Si une concurrente n'a pas
de montant, personne ne gagne par forfait : l'arbitrage devient indécidable
(`IND-24`).

**Trois formes d'incertitude produisent un `partial` {0, montant}** plutôt qu'un
oui ou un non inventé : plage tombant dans une zone non qualifiée (`IND-30`),
amplitude inconnue (`IND-17`), et borne de plage tombant dans l'heure ambiguë du
changement d'heure (`IND-12`).

### Synthèse de période

Un mois comportant une absence rend le **brut** `unknown`, tandis que heures sup
et indemnités restent `complete` (`PAI-38`, `PRV-22`). Ce sont ces deux-là qui
portent la valeur : un conducteur veut savoir si ses 12 repas et ses 18 heures
sup sont là, pas retrouver son net au centime.

## Supposé

Cinq hypothèses, dont **trois relèvent du métier** et te reviennent :

1. **Conduite et autre travail comptent à 100 % du temps rémunéré.** Seules la
   disponibilité et les coupures sont paramétrables. Aucune convention ne paie la
   conduite à moins de 100 %, mais c'est bien une hypothèse et non une lecture de
   ta convention. **Si elle est fausse, tous les montants sont faux.**
2. **`dureeReferenceMinutes` est la référence de la période de décompte
   elle-même** : hebdomadaire en mode hebdomadaire, mensuelle en mode mensuel,
   celle du bloc entier en mode période de référence. Aucune multiplication par
   le nombre de semaines n'est faite — l'app ne la déduit pas.
3. **Le libellé d'une période porte le mois de fin** : du 26 décembre au
   25 janvier s'appelle « Janvier ». C'est l'usage, mais c'est un affichage, pas
   un calcul.
4. **Sans réglage de rattachement, deux hypothèses sont proposées — pas trois.**
   Le prorata reste implémenté et disponible en réglage, mais n'est pas proposé
   comme hypothèse : le SPEC §7 dit « affiche les deux », et les deux extrêmes
   encadrent le prorata.
5. **Un arrondi par tranche de majoration** dans la valorisation. Ce n'est pas un
   arrondi en cascade : une tranche est une ligne de bulletin, donc la
   granularité réelle du calcul de paie.

## Ambigu

Les questions qui restent sont celles que je ne peux pas trancher, et elles se
lisent toutes sur une de tes fiches de paie :

1. **Ta disponibilité (l'attente entre deux services), elle est payée combien ?**
   Une fraction de l'heure — 50 %, 75 % — ou en entier ? Tant que ce n'est pas
   renseigné, toute journée qui en contient est incalculable.
2. **Tes coupures sont-elles payées au-delà d'une certaine durée ?** Si oui, à
   partir de combien et à quelle fraction ?
3. **Ton décompte des heures sup est hebdomadaire, mensuel, ou sur un cycle ?**
   Et quelle est la durée de référence exacte : 35 h, 151,67 h, autre ?
4. **Tes tranches de majoration** : 25 % puis 50 %, et à partir de combien
   bascule-t-on ?
5. **Quand une semaine est à cheval sur deux paies, ton employeur la met où ?**
   L'app te posera la question à l'écran, mais si tu le sais déjà, on l'enregistre
   comme réglage.
6. **`estForfaitJours`** : es-tu concerné ? Si oui, tout le décompte horaire
   devient décoratif et il faudra revoir l'écran principal.

## Dette

- **`PAI-40` à `PAI-42` (écarts avec la fiche de paie) ne sont pas implémentés** :
  ils appartiennent à l'écran « Vérifier ma paie », phase 7. La brique
  `contient()` est prête et testée pour dire si un écart tombe dans la zone
  d'incertitude.
- **`ARC-16` (aucune fonction publique ne retourne un `number` nu)** reste
  déclaré sans test mécanique. Aujourd'hui c'est vrai par construction et vérifié
  à la relecture, pas par un contrôle automatique.
- **`sommerParts` renvoie le premier `unknown` rencontré** et perd les preuves des
  autres termes. La cause reste lisible, mais le dépliant de l'écran « Vérifier ma
  paie » voudra sans doute voir tous les termes, y compris ceux qui étaient
  calculables.
- **`indemnitesDuJour` revalide toute la liste d'indemnités à chaque journée.**
  Sur une période de 30 jours c'est 30 validations identiques. À sortir de la
  boucle si la synthèse de période rame en phase 6.

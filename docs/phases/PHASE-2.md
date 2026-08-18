# Phase 2 — Qualification

`pnpm verify` vert. 118 tests (+28).

## Fait

**Un seul algorithme pour les trois cas.** Plutôt qu'un code de fusion, un code
de détection de trous et un code d'arbitrage de chevauchements, `qualifierJournee`
fait un **balayage** : il découpe la journée aux frontières de tous les segments,
puis compte les **types distincts** qui couvrent chaque tranche élémentaire.

- 1 type → tranche qualifiée. Deux segments « conduite » qui se chevauchent n'en
  font qu'un, sans traitement dédié : c'est le même type, donc un seul. → `QUA-02`,
  `QUA-03`, `QUA-24`.
- 0 type à l'intérieur de l'amplitude → trou. → `QUA-07` à `QUA-09`, `QUA-22`.
- ≥ 2 types → indéterminé, avec les types en conflit nommés. → `QUA-04` à `QUA-06`.

`QUA-07` reprend l'exemple du SPEC §6 au chiffre près : 8 h certaines, 4 h non
qualifiées, `range` 8 h → 12 h.

**Les bornes du `range` sont « rien » et « tout ».** Une zone non qualifiée compte
pour 0 dans le minimum et pour sa durée entière dans le maximum, pour chaque type.
`QUA-23` vérifie explicitement que le milieu (180 min sur un cas 120–240) n'apparaît
nulle part : un milieu serait un chiffre plausible et faux.

**La qualification manuelle entre par la même porte** que les segments — c'est un
intervalle de plus dans le balayage, marqué `origine: 'manuelle'`. D'où `QUA-17` :
le résultat bascule en `complete` et le `range` disparaît, sans code de
« résolution » séparé. `QUA-18` : une qualification partielle resserre le `range`
au lieu de le supprimer.

**Journée à cheval sur minuit** (`QUA-19`) : tout le calcul se fait en instants
absolus, donc rien à découper au jour calendaire. Le builder de fixtures écrit
`'+1 02:30'` pour le lendemain, ce qui rend les journées de nuit lisibles dans les
tests.

**Changement d'heure** (`TPS-15`) : une journée `00:00 → 08:00` le jour du recul
des horloges donne 9 h, pas 8. C'est la durée réelle qui alimente la paie.

**`complete` est dérivé, jamais stocké** (SPEC §9) : une journée est complète
quand rien n'est indéterminé, que l'amplitude est connue, et qu'aucun
avertissement « ouvrant » (prise ou fin absente, segment ouvert, instant
illisible) n'est levé.

**Fin de service antérieure à la prise** (`TPS-18`) : `amplitude` passe en
`unknown` avec un message qui suggère la cause la plus fréquente — « vérifie si la
journée passe minuit ». Le moteur ne corrige pas la saisie.

**Une durée brute ne porte aucune `RuleSource`** (`PRV-09`) : ni l'amplitude, ni le
temps de conduite. Il n'y a pas de règle derrière `fin − début`, et en inventer
une produirait des sources bidon.

## Supposé

1. **Un segment qui déborde de l'amplitude est compté, pas rogné** (`QUA-16`), et
   l'avertissement le signale. L'alternative — ne compter que la partie interne —
   ferait disparaître du temps travaillé sans le dire. Mais le segment fusionné
   porte alors un seul drapeau `horsAmplitude` pour toute sa longueur, sans
   séparer la part interne de la part externe. Si l'écran a besoin de les
   distinguer, il faudra scinder.
2. **Un segment sans fin est écarté du calcul**, pas prolongé jusqu'à la fin de
   service. Conséquence visible dans `QUA-14` : toute l'amplitude devient un trou
   et le résultat est `range` 0 → 8 h. C'est plus honnête qu'une durée devinée,
   mais c'est brutal à l'écran ; à revoir en phase 5 si c'est illisible.
3. **Le tri des types en conflit est alphabétique** (`autre_travail`, `conduite`,
   `disponibilite`). Purement technique : ça rend les tests déterministes. Aucun
   ordre de priorité métier n'est impliqué.
4. **Un segment de durée nulle est accepté** (`QUA-20`) et n'ouvre aucun trou. Une
   saisie `10:00–10:00` est probablement une erreur de frappe, mais la refuser
   perdrait la saisie ; elle est simplement sans effet.

## Ambigu

Une seule question, et elle est pour toi :

**Quand tu as un trou entre deux services — disons 10 h 00 à 14 h 00 — est-ce
qu'il y a un cas où ce trou est *par défaut* quelque chose de précis chez toi ?**
Aujourd'hui le moteur refuse de choisir et te demande. Si dans ton entreprise un
trou entre deux conduites est toujours une coupure, on pourrait te le proposer en
un appui plutôt qu'en un choix à trois options — mais **ce serait une proposition
pré-cochée, jamais un calcul silencieux**.

## Dette

- **Les avertissements ne portent pas encore de lien vers la zone à qualifier.**
  Le message dit « Appuie pour le dire », mais rien dans le `CalculationWarning` ne
  désigne la `ZoneIndeterminee` concernée. L'écran de la phase 5 en aura besoin :
  il faudra ajouter un identifiant de zone.
- **`dureeParType` recalcule le total de chaque type indépendamment.** Sur une
  journée à cinq segments c'est sans conséquence ; sur une période de paie
  complète, c'est quatre balayages de la liste des zones par journée. À mesurer
  en phase 6 si la liste de période rame.

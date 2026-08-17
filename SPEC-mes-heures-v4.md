# SPEC.md v4 — Mes Heures (outil personnel du conducteur d'autocar)

> Version finale. Remplace toutes les précédentes. Prête pour la phase 1.

---

## 0. Instructions à l'IA génératrice

PWA installable permettant à un conducteur d'autocar de suivre ses heures et ses indemnités, et de **vérifier sa fiche de paie**.

Trois règles qui ne bougent pas :

1. **Le calcul doit être juste ou absent.** Mieux vaut afficher « je ne peux pas calculer ça » qu'un chiffre plausible mais faux. Tout résultat porte un statut.
2. **Le moteur produit des preuves, pas des nombres.**
3. **Aucune valeur réglementaire ni tarifaire en dur.** Absence de configuration = absence de donnée, jamais zéro.

Si une exigence est ambiguë, tu poses la question. Tu ne tranches pas sur du métier.

---

## 1. Périmètre

**Dans la v1** : suivi du temps, indemnités, heures supplémentaires, vérification de fiche de paie, relevé PDF.

**Hors v1, décisions assumées :**

- **Aucune alerte de conformité RSE.** L'app affiche des durées brutes (conduite, amplitude, repos entre services) sans les qualifier. Mention à l'écran : *« Ces durées sont indicatives. Cette version ne vérifie pas la conformité au règlement européen. »* Motifs et notes de reprise en annexe.
- **Aucune valorisation des absences.** Maladie, IJSS, subrogation, maintien conventionnel, congés en maintien ou en dixième : hors périmètre. L'app compte les jours par type. Conséquence directe, §4.
- **Aucune notification programmée.** Pas de moyen fiable de déclencher une notification locale à heure fixe quand une PWA est fermée. Ne promets rien.

---

## 2. Pipeline

Ordre imposé. Chaque étage est une fonction pure, testée indépendamment.

```
Saisie brute
  → Normalisation temporelle        (local → instant, gestion DST)
  → Qualification des données       (chevauchements, trous, complétude)
  → Temps rémunéré
  → Découpage en périodes de décompte
  → Heures supplémentaires
  → Indemnités
  → CalculationResult + preuves
      ├── écran Vérifier ma paie
      └── relevé PDF
```

**Aucun calcul dans React. Aucun calcul dans le générateur PDF.** Les deux consomment exactement la même sortie du moteur. Si une valeur doit apparaître dans le PDF, elle sort du moteur, elle n'est pas recalculée.

---

## 3. Trois notions de temps, jamais confondues

| Notion | Contenu | Sert à |
|---|---|---|
| `tempsConduite` | segments `conduite` | affichage brut, futur module RSE |
| `tempsTravailReglementaire` | selon régime applicable | futur module RSE — **non calculé en v1** |
| `tempsRemunere` | selon les règles conventionnelles saisies | paie, heures sup, comparaison de fiche |

Pas de fonction `tempsTravailEffectif()` unique utilisée partout. En v1, seul `tempsRemunere` alimente la paie ; `tempsConduite` et `amplitude` sont des informations brutes.

---

## 4. Le moteur retourne des preuves

```ts
type CalculationResult<T> = {
  value?: T
  range?: { min: T; max: T }      // incertitude bornée — voir §6
  status: 'complete' | 'partial' | 'unknown'
  inputs: CalculationInput[]
  steps: CalculationStep[]
  warnings: CalculationWarning[]
  sources: RuleSource[]
}

type CalculationInput = {
  label: string
  value: number | string
  origin: 'saisie_utilisateur' | 'reglage' | 'derive'
  dayId?: string
}

type CalculationStep = { label: string; detail: string; value: number }

type RuleSource =
  | { kind: 'legal'; texte: string; article: string }
  | { kind: 'convention'; libelle: string; saisiPar: 'utilisateur' }
  | { kind: 'personnalise'; base?: RuleSource }
```

**`sources` obligatoire uniquement pour les résultats financiers ou dépendant d'un réglage.** Une amplitude brute est `fin − début` : elle n'a ni source légale ni source conventionnelle, et exiger une `RuleSource` y produirait des sources bidon.

Dès qu'un utilisateur modifie une valeur issue d'un texte, la source devient `personnalise` et l'app cesse de la présenter comme légale.

**Le brut mensuel global est presque toujours `partial`.** Puisque les absences ne sont pas valorisées, un mois comportant un jour de maladie ou de congé ne peut pas produire un brut fiable. Dans ce cas : brut global en `partial` ou `unknown`, mais heures supplémentaires et indemnités restent `complete`. Ce sont ces deux dernières qui portent la valeur — un conducteur veut savoir si ses 12 repas et ses 18 heures sup sont là, pas retrouver son net au centime.

---

## 5. Temps et fuseau

- `Settings.timeZoneReference: string`, défaut `'Europe/Paris'`.
- **Stockage Dexie : chaînes ISO 8601 complètes avec offset.** Luxon `DateTime` n'est pas sérialisable. Le moteur reconstruit via `DateTime.fromISO(s, { zone })`.
- Semaine, période et journée sont définies dans `timeZoneReference`, jamais dans le fuseau du navigateur.
- Toute durée se calcule sur des instants absolus.
- **Journée de service ≠ jour calendaire.** Une journée commençant lundi 22 h et finissant mardi 6 h est une seule journée, rattachée au lundi.

### Heures locales ambiguës et inexistantes

Le parseur `date + HH:mm → instant` retourne :

```ts
type LocalTimeResolution =
  | { status: 'ok'; instant: ISODateTime }
  | { status: 'ambiguous'; choices: ISODateTime[] }   // heure d'hiver : 02:30 existe deux fois
  | { status: 'invalid'; reason: string }             // heure d'été : 02:30 n'existe pas
```

- `ambiguous` → l'UI demande, **et uniquement dans ce cas** : « 02:30 avant le changement d'heure » / « 02:30 après le changement d'heure ». Aucun dialogue de désambiguïsation le reste de l'année.
- `invalid` → refus explicite en langage humain (« cette heure n'existe pas cette nuit-là, les horloges passent de 02:00 à 03:00 »). **Jamais de correction silencieuse.**

Ça concerne deux nuits par an et une plage d'une heure. C'est rare, mais un service de nuit y tombe, et une correction silencieuse fausserait durablement un mois de paie.

---

## 6. Qualification des données — le principe « juste ou absent »

Le moteur ne fabrique jamais une qualification qu'il ne peut pas déduire.

**Chevauchement de segments**
- Types identiques → fusion, un seul intervalle.
- **Types différents → jamais d'arbitrage automatique.** `08:00–10:00 conduite` et `09:00–11:00 disponibilité` : l'heure `09:00–10:00` est indéterminée. Le moteur la signale et exclut la zone du calcul certain.

**Trou non qualifié**
`priseService 06:00`, segments `06:00–10:00` et `14:00–18:00`, `finService 18:00` : le moteur ne sait pas ce qu'était `10:00–14:00` — coupure, disponibilité ou autre travail. Il ne choisit pas.

**Sortie attendue dans ces deux cas** : `status: 'partial'` avec `range` renseigné.

```
Temps rémunéré : 6 h 00 certaines
                 + 4 h 00 non qualifiées (10:00 → 14:00)
                 → entre 6 h 00 et 10 h 00
```

Le `range` est plus utile qu'un simple `partial` : il borne l'incertitude et permet au conducteur de voir immédiatement si l'écart avec sa fiche entre dans la zone d'incertitude ou non. L'UI propose de qualifier la zone en un appui, ce qui bascule le résultat en `complete`.

---

## 7. Périodes de décompte — le piège principal

Le mois civil n'est pas la période de paie. Beaucoup d'entreprises décomptent du 26 au 25, et le décompte des heures sup peut suivre un aménagement supérieur à la semaine.

```ts
PayPeriod {
  id: string
  label: string          // « Janvier 2027 »
  debut: string          // 'YYYY-MM-DD'
  fin: string
}
```

Les périodes sont générées depuis les réglages, pas déduites de `YYYY-MM`. Tout calcul de paie prend une `PayPeriod` en entrée, jamais un mois.

### Ancrage des périodes

```ts
modeDecompteHS?: 'hebdomadaire' | 'mensuel' | 'periode_reference'
debutSemaine?: 1|2|3|4|5|6|7          // 1 = lundi, régime supplétif
periodeReferenceSemaines?: number
periodeReferenceDebut?: string         // 'YYYY-MM-DD' — sans ça, « 4 semaines » ne veut rien dire
```

Le lundi est le régime supplétif, pas une constante. Un accord peut définir une autre période de sept jours consécutifs. Le moteur ne le suppose jamais.

> Note pour la v2 : la semaine de paie est paramétrable, **la semaine RSE ne l'est pas** — elle est fixe du lundi 00:00 au dimanche 24:00. Deux notions distinctes portant le même mot. Ne pas les fusionner le jour où le module RSE arrivera.

### Semaine à cheval sur deux périodes

Une semaine du 29 janvier au 4 février produit des heures sup qui doivent tomber sur une fiche de paie précise, et l'app **ne peut pas le deviner**.

```ts
rattachementSemaineChevauchante?: 'periode_de_fin' | 'periode_de_debut' | 'prorata'
```

Si le réglage n'est pas renseigné : le moteur calcule les hypothèses disponibles et l'écran de comparaison **affiche les deux**, avec la mention *« selon la règle appliquée par ton employeur »*. Le conducteur regarde sa fiche, voit laquelle correspond, et l'app propose d'enregistrer le choix comme réglage. C'est le seul cas où l'ignorance du moteur devient une fonctionnalité : le conducteur détient l'information.

---

## 8. Indemnités

```ts
IndemniteConfig {
  id: string
  code: string
  libelle: string
  montantCents?: Cents                  // absent = règle désactivée, pas zéro

  declencheur: 'plage_horaire' | 'decouche' | 'duree_service' | 'quantite_manuelle'

  // plage_horaire
  plageDebut?: string                   // 'HH:mm'
  plageFin?: string                     // si < plageDebut, la plage traverse minuit
  dureeMinMinutes?: Minutes
  typesSegmentEligibles?: Segment['type'][]   // défaut : ['coupure']

  // duree_service
  amplitudeMinMinutes?: Minutes

  quantiteMaxParJour?: number           // défaut 1
  incompatibleAvec?: string[]           // codes
  source: RuleSource
}
```

**Règles de déclenchement, à implémenter littéralement :**

- `plage_horaire` : un segment éligible doit **recouvrir intégralement** la plage configurée et durer au moins `dureeMinMinutes`. Recouvrement partiel → pas de déclenchement.
- **Plage traversant minuit** (`plageFin < plageDebut`) : elle est évaluée par rapport à la **journée de service**, pas au jour calendaire. Une plage `22:00–02:00` sur une journée rattachée au lundi couvre le lundi 22:00 au mardi 02:00.
- `decouche` : déclenché par le drapeau du `WorkDay`. Peut générer plusieurs indemnités distinctes (repos, repas) — chacune est un `IndemniteConfig` séparé, jamais une indemnité composite.
- `duree_service` : amplitude ≥ `amplitudeMinMinutes`.
- **Incompatibilités** : parmi les indemnités éligibles et mutuellement incompatibles, retenir le montant le plus élevé. L'arbitrage apparaît dans `steps` : *« Repas (X €) et repas unique (Y €) éligibles, incompatibles — retenu : le plus élevé. »*
- `montantCents` absent → règle désactivée, `status: 'unknown'` sur cette ligne. Jamais un calcul à zéro.

L'app ne fournit **aucune** indemnité pré-configurée avec un montant. Elle propose une liste de codes courants (repas, repas unique, casse-croûte, spéciale, découcher, repas découcher) avec montants et plages vides, à remplir depuis la convention ou la fiche de paie.

---

## 9. Modèle de données

```ts
type ISODateTime = string   // ISO 8601 avec offset
type Minutes = number       // entier
type Cents = number         // entier

Settings {
  timeZoneReference: string                 // seul champ obligatoire
  entreprise?: string
  domicile?: string

  tauxHoraireBaseCents?: Cents
  modeDecompteHS?: 'hebdomadaire' | 'mensuel' | 'periode_reference'
  debutSemaine?: 1|2|3|4|5|6|7
  dureeReferenceMinutes?: Minutes
  periodeReferenceSemaines?: number
  periodeReferenceDebut?: string
  rattachementSemaineChevauchante?: 'periode_de_fin' | 'periode_de_debut' | 'prorata'
  tranchesHS?: { deMinutes: Minutes, aMinutes: Minutes | null, majorationPct: number }[]
  estForfaitJours?: boolean

  fractionDisponibiliteRemuneree?: number   // 0..1
  coupuresRemunerees?: { auDelaDeMinutes: Minutes, fraction: number }[]

  indemnites: IndemniteConfig[]
  payPeriodConfig?: { jourDebut: number }   // 1 = mois civil, 26 = du 26 au 25
}

WorkDay {
  id: string
  dateRattachement: string
  priseService?: ISODateTime
  finService?: ISODateTime
  segments: Segment[]
  decouche?: boolean
  lieuFin?: string
  templateId?: string
  note?: string
}

Segment { id: string; type: 'conduite'|'autre_travail'|'disponibilite'|'coupure'; debut?: ISODateTime; fin?: ISODateTime }

Absence { id; type: 'CP'|'RTT'|'MALADIE'|'AT'|'RECUP'|'FORMATION'|'SANS_SOLDE'|'REPOS'; debut: string; fin: string; demiJournee?: 'matin'|'apres_midi'; note?: string }

DayTemplate { id; libelle; segmentsRelatifs; decoucheParDefaut }

PayCheck { id; payPeriodId: string; heuresPayeesCentiemes; heuresSupPayees; indemnitesPayees; brutCents? }
```

**Tout réglage métier est optionnel.** Le seul champ requis est `timeZoneReference`. Un champ absent produit `status: 'unknown'` sur les calculs qui en dépendent, jamais une valeur par défaut silencieuse. La complétude d'une journée est **dérivée**, jamais stockée.

Aucun résultat de calcul n'est persisté.

---

## 10. Nombres

- **Argent : centimes entiers.** Aucun flottant ne franchit la frontière du moteur.
- **Durées : minutes entières.** Saisie à la minute, jamais à la seconde.
- **Affichage double** : `7 h 30` et `7,50 h`. Les fiches de paie françaises sont en centièmes ; le conducteur doit comparer sans convertir mentalement.
- **Un seul point d'arrondi**, en sortie. Aucun arrondi intermédiaire en cascade. Toute conversion arrondie est un `CalculationStep` visible.
- Une fonction `roundingPolicy` unique, exportée, testée.

---

## 11. Écrans

- **Aujourd'hui** — saisie. `Dupliquer hier`, modèles, ou manuel. Amplitude, temps rémunéré et indemnités affichés en direct, avec zones non qualifiées signalées et qualifiables en un appui.
- **Ma semaine / Ma période** — durées brutes par jour, aucune qualification de conformité.
- **Vérifier ma paie** — écran principal. Écarts ligne par ligne sur une `PayPeriod`, chaque ligne dépliable sur les `CalculationStep` et les jours concernés. Formulation **écart**, jamais **erreur**. Mention : *« Un écart n'est pas forcément une erreur. Compare avec ton contrat, puis vois avec ton employeur ou tes représentants du personnel. »*
- **Relevé PDF** — même sortie moteur, aucun recalcul.
- **Réglages** — chaque champ vide désactive le calcul correspondant et l'affiche en `unknown`.

La saisie a posteriori reste le mode nominal : le soir, en quinze secondes. Champs numériques au clavier, jamais de sélecteur d'heure à faire défiler. Tout fonctionne hors ligne. **C'est la phase qui décide de l'adoption.**

---

## 12. Stockage

Dexie / IndexedDB, aucun backend, aucun compte. `navigator.storage.persist()` appelé au démarrage — **c'est une demande, pas une garantie** : vérifier le retour et renforcer les rappels de sauvegarde si elle est refusée. Export JSON proposé toutes les deux semaines, alerte à 30 jours sans sauvegarde, import pour changement d'appareil. Migrations versionnées et testées.

---

## 13. Tests

Écris d'abord une **table de cas limites** exhaustive, puis un test par ligne. Le nombre importe moins que la couverture des frontières ; quelques centaines de tests moteur ne sont pas excessifs.

**Temps et DST**
- Journée à cheval sur minuit, rattachement correct.
- Passage à l'heure d'été (23 h) et à l'heure d'hiver (25 h).
- Heure locale ambiguë → `ambiguous` avec deux choix. Heure inexistante → `invalid`, jamais de correction.
- Fuseau de référence différent du fuseau du navigateur.
- Plage d'indemnité traversant minuit, évaluée sur la journée de service.

**Périodes**
- Période de paie non calée sur le mois civil (du 26 au 25).
- Semaine à cheval sur deux périodes, avec chacune des trois politiques de rattachement.
- Réglage de rattachement absent → deux hypothèses produites, aucune choisie.
- `debutSemaine` autre que lundi.
- `periodeReferenceDebut` absent alors que le mode l'exige → `unknown`, message explicite.

**Qualification**
- Chevauchement de types identiques → fusion.
- Chevauchement de types différents → `partial` + `range`, aucune qualification inventée.
- Trou non qualifié → `partial` + `range` correctement borné.
- Journée sans `finService` → `partial`.
- Qualification manuelle d'une zone → bascule en `complete`, `range` disparaît.

**Paie**
- Chacun des trois `modeDecompteHS`.
- Mois franchissant deux tranches de majoration.
- `estForfaitJours` → aucune heure sup.
- Réglage absent → `unknown`, aucun montant.
- Mois avec absence → brut global `partial`, heures sup et indemnités `complete`.

**Indemnités**
- Recouvrement intégral de la plage → déclenchée ; partiel → non.
- Durée insuffisante → non déclenchée.
- Deux incompatibles éligibles → la plus élevée, arbitrage dans `steps`.
- `quantiteMaxParJour` respectée.
- `montantCents` absent → `unknown`.

**Nombres**
- Minutes → centièmes sur les 60 valeurs.
- Calcul en trois étapes = calcul en une (absence d'arrondi en cascade).

**Preuves**
- Tout résultat financier ou dépendant d'un réglage porte au moins une `RuleSource`.
- Une amplitude brute n'en porte aucune.
- Valeur modifiée par l'utilisateur → source `personnalise`.
- Les `steps` permettent de remonter aux `dayId`.

**Données**
- Export / import : identiques. Import corrompu : refus propre, données intactes. Migration Dexie : aucune perte.

---

## 14. Phases

1. **Types et primitives** — `Cents`, `Minutes`, `roundingPolicy`, `CalculationResult`, `LocalTimeResolution`, sérialisation ISO ↔ Luxon.
2. **Qualification** — chevauchements, trous, `range`.
3. **Moteur** — temps rémunéré, périodes, heures sup, indemnités. Tous les tests du §13.
4. **Persistance** — Dexie, migrations, export/import.
5. **Saisie** — Aujourd'hui, modèles, duplication. Phase à soigner le plus.
6. **Consultation** — semaine, période.
7. **Vérifier ma paie** + relevé PDF.
8. **PWA** — manifest, service worker, onboarding d'installation.

À la fin de chaque phase : tests verts, puis arrêt et liste de ce qui est fait, supposé, ambigu.

---

## Annexe — Notes pour le module RSE (v2, ne pas implémenter)

1. **Régulier ≠ occasionnel.** Le règlement (UE) 2024/1258, applicable depuis mai 2024, assouplit pauses et repos pour le **transport occasionnel de voyageurs uniquement** : pause de 45 min fractionnable en deux pauses d'au moins 15 min chacune sans ordre imposé, report du début du repos journalier d'une heure sous conditions de durée de conduite et de longueur du voyage. Ne s'applique pas aux services réguliers. Le profil réglementaire doit porter le type de service et être versionné par date d'application.
2. **Repos journalier** : ne se déduit pas d'une comparaison entre deux `WorkDay`. Flux chronologique continu requis, incluant le repos fractionné.
3. **Repos hebdomadaire** : ce n'est pas « la plus longue période sans service de la semaine ». Un repos à cheval sur deux semaines s'impute à l'une ou à l'autre, jamais aux deux ; les réductions ouvrent des compensations.
4. **Deux compteurs, deux périodes de référence.** Conduites journalières étendues : semaine civile. Repos journaliers réduits : entre deux repos hebdomadaires. Remises à zéro à des moments différents.
5. **La semaine RSE est fixe** (lundi 00:00 → dimanche 24:00) et ne suit pas `Settings.debutSemaine`.
6. Vérifier les valeurs et conditions sur le texte consolidé EUR-Lex avant implémentation, pas de mémoire.

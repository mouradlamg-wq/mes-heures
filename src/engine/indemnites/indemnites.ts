import { cents, ZERO_CENTS, type Cents } from '../primitives/brands'
import {
  complete,
  partial,
  unknown,
  type CalculationResult,
  type CalculationStep,
  type CalculationWarning,
} from '../primitives/calculationResult'
import { formatMontant } from '../primitives/format'
import { arrondirEnCents } from '../primitives/roundingPolicy'
import { assertNever } from '../primitives/assertNever'
import type { IndemniteConfig, SaisieIndemnite, Settings, TypeSegment, WorkDay } from '../domain'
import type { JourneeQualifiee, ZoneQualifiee } from '../qualify/types'
import { decalerDate, millisDe } from '../time/instant'
import { parseHeureLocale } from '../time/localTime'
import type { ISODate } from '../time/types'

/**
 * Indemnités (SPEC §8). Les règles de déclenchement sont implémentées
 * **littéralement**, sans souplesse ajoutée :
 *
 * - `plage_horaire` : un **seul** segment éligible doit recouvrir intégralement
 *   la plage. Deux segments qui la couvrent à eux deux ne déclenchent rien.
 * - Une plage traversant minuit s'évalue sur la **journée de service**.
 * - `montantCents` absent = règle désactivée, `unknown` sur la ligne. Jamais un
 *   calcul à zéro.
 */

export const CODES_INDEMNITES = {
  MONTANT_ABSENT: 'indemnite_montant_absent',
  CONFIG_INCOHERENTE: 'indemnite_config_incoherente',
  CODE_EN_DOUBLE: 'indemnite_code_en_double',
  PLAGE_INDECIDABLE: 'indemnite_plage_indecidable',
  AMPLITUDE_INCONNUE: 'indemnite_amplitude_inconnue',
  ARBITRAGE_INDECIDABLE: 'indemnite_arbitrage_indecidable',
  DECLENCHEMENT_INCERTAIN: 'indemnite_declenchement_incertain',
} as const

const TYPES_ELIGIBLES_PAR_DEFAUT: readonly TypeSegment[] = ['coupure']
const QUANTITE_MAX_PAR_DEFAUT = 1

export type LigneIndemnite = {
  readonly code: string
  readonly libelle: string
  readonly quantite: number
  readonly montant: CalculationResult<Cents>
}

export type IndemnitesDuJour = {
  readonly dayId: string
  readonly lignes: readonly LigneIndemnite[]
  readonly total: CalculationResult<Cents>
}

/**
 * Vérifie la cohérence de la liste d'indemnités réglées. Un réglage incohérent
 * est **refusé**, il ne produit pas un calcul approximatif.
 */
export function validerIndemnites(
  configs: readonly IndemniteConfig[],
): readonly CalculationWarning[] {
  const problemes: CalculationWarning[] = []
  const vus = new Set<string>()

  const refuser = (config: IndemniteConfig, code: string, message: string): void => {
    // `reglageManquant` porte le code de l'indemnité : c'est ce qui permet à
    // l'appelant de savoir **laquelle** écarter, et à l'UI d'ouvrir le bon
    // réglage, sans relire le message.
    problemes.push({ code, message, reglageManquant: `${PREFIXE_REGLAGE}${config.code}` })
  }

  for (const config of configs) {
    if (vus.has(config.code)) {
      refuser(
        config,
        CODES_INDEMNITES.CODE_EN_DOUBLE,
        `Deux indemnités portent le code « ${config.code} ». Le code identifie la ligne de ta fiche de paie : il doit être unique.`,
      )
    }
    vus.add(config.code)

    if (config.declencheur === 'plage_horaire') {
      if (config.plageDebut === undefined || config.plageFin === undefined) {
        refuser(
          config,
          CODES_INDEMNITES.CONFIG_INCOHERENTE,
          `L'indemnité « ${config.libelle} » se déclenche sur une plage horaire, mais la plage n'est pas renseignée.`,
        )
      } else if (config.plageDebut === config.plageFin) {
        refuser(
          config,
          CODES_INDEMNITES.CONFIG_INCOHERENTE,
          `L'indemnité « ${config.libelle} » a une plage de durée nulle (${config.plageDebut} → ${config.plageFin}).`,
        )
      }
    }

    if (config.declencheur === 'duree_service' && config.amplitudeMinMinutes === undefined) {
      refuser(
        config,
        CODES_INDEMNITES.CONFIG_INCOHERENTE,
        `L'indemnité « ${config.libelle} » se déclenche sur la durée du service, mais aucune amplitude minimale n'est renseignée.`,
      )
    }
  }

  return problemes
}

const PREFIXE_REGLAGE = 'indemnites.'

/** Codes écartés par la validation : ils ne participent à aucun calcul. */
export function codesRefuses(problemes: readonly CalculationWarning[]): ReadonlySet<string> {
  return new Set(
    problemes
      .map((p) => p.reglageManquant)
      .filter((r): r is string => r !== undefined && r.startsWith(PREFIXE_REGLAGE))
      .map((r) => r.slice(PREFIXE_REGLAGE.length)),
  )
}

export function indemnitesDuJour(
  jour: WorkDay,
  journee: JourneeQualifiee,
  settings: Settings,
  saisies: readonly SaisieIndemnite[] = [],
): IndemnitesDuJour {
  const problemes = validerIndemnites(settings.indemnites)
  const refuses = codesRefuses(problemes)

  const eligibles: Eligible[] = []

  for (const config of settings.indemnites) {
    if (refuses.has(config.code)) {
      continue
    }
    const declenchement = evaluerDeclenchement(config, jour, journee, settings, saisies)
    if (declenchement.quantite > 0) {
      eligibles.push({
        config,
        quantite: Math.min(
          declenchement.quantite,
          config.quantiteMaxParJour ?? QUANTITE_MAX_PAR_DEFAUT,
        ),
        incertain: declenchement.incertain,
      })
    }
  }

  const { retenues, steps } = arbitrer(eligibles)

  const lignes = retenues.map((retenue) =>
    ligne(retenue.config, retenue.quantite, retenue.incertain, jour.id, steps),
  )

  return { dayId: jour.id, lignes, total: totaliser(lignes, problemes) }
}

// ————————————————————————————————————————————————————————————————
// Déclenchement
// ————————————————————————————————————————————————————————————————

type Declenchement = { readonly quantite: number; readonly incertain: boolean }

const AUCUN: Declenchement = { quantite: 0, incertain: false }

function evaluerDeclenchement(
  config: IndemniteConfig,
  jour: WorkDay,
  journee: JourneeQualifiee,
  settings: Settings,
  saisies: readonly SaisieIndemnite[],
): Declenchement {
  switch (config.declencheur) {
    case 'decouche':
      return jour.decouche === true ? { quantite: 1, incertain: false } : AUCUN

    case 'quantite_manuelle': {
      const saisie = saisies.find((s) => s.dayId === jour.id && s.code === config.code)
      return saisie === undefined || saisie.quantite <= 0
        ? AUCUN
        : { quantite: saisie.quantite, incertain: false }
    }

    case 'duree_service': {
      const seuil = config.amplitudeMinMinutes
      /* c8 ignore next 3 — écarté par validerIndemnites. */
      if (seuil === undefined) {
        return AUCUN
      }
      if (journee.amplitude.status !== 'complete') {
        // L'amplitude est inconnue : le déclenchement n'est pas deviné.
        return { quantite: 1, incertain: true }
      }
      return journee.amplitude.value >= seuil ? { quantite: 1, incertain: false } : AUCUN
    }

    case 'plage_horaire':
      return declenchementSurPlage(config, journee, settings)

    default:
      return assertNever(config.declencheur, 'declencheur')
  }
}

function declenchementSurPlage(
  config: IndemniteConfig,
  journee: JourneeQualifiee,
  settings: Settings,
): Declenchement {
  const plage = construirePlage(
    config,
    journee.dateRattachement,
    settings.timeZoneReference,
  )
  if (plage === undefined) {
    // Une borne tombe dans l'heure ambiguë ou inexistante : on ne tranche pas.
    return { quantite: 1, incertain: true }
  }

  const typesEligibles = config.typesSegmentEligibles ?? TYPES_ELIGIBLES_PAR_DEFAUT
  const dureeMin = config.dureeMinMinutes

  // « Un segment éligible doit recouvrir intégralement la plage » : c'est bien
  // segment par segment. Deux segments qui la couvrent à eux deux ne comptent
  // pas (SPEC §8).
  const declencheurs = journee.zones.filter((zone) => {
    if (!typesEligibles.includes(zone.type)) {
      return false
    }
    if (dureeMin !== undefined && zone.duree < dureeMin) {
      return false
    }
    return recouvreEntierement(zone, plage)
  })

  if (declencheurs.length > 0) {
    return { quantite: declencheurs.length, incertain: false }
  }

  // Aucun segment ne déclenche, mais une zone non qualifiée recouvre la plage :
  // le déclenchement dépend de ce qu'était cette zone.
  const incertain = journee.zonesIndeterminees.some(
    (zone) => millisDe(zone.debut) <= plage.debut && millisDe(zone.fin) >= plage.fin,
  )
  return incertain ? { quantite: 1, incertain: true } : AUCUN
}

function recouvreEntierement(
  zone: ZoneQualifiee,
  plage: { debut: number; fin: number },
): boolean {
  return millisDe(zone.debut) <= plage.debut && millisDe(zone.fin) >= plage.fin
}

/**
 * Construit la plage sur la **journée de service**. Si `plageFin < plageDebut`,
 * la plage traverse minuit : `22:00–02:00` sur une journée rattachée au lundi
 * couvre le lundi 22:00 au mardi 02:00.
 *
 * Retourne `undefined` si une borne tombe dans une heure ambiguë ou inexistante :
 * deux nuits par an, et l'app préfère le dire plutôt que choisir.
 */
function construirePlage(
  config: IndemniteConfig,
  dateRattachement: ISODate,
  zone: string,
): { debut: number; fin: number } | undefined {
  const { plageDebut, plageFin } = config
  /* c8 ignore next 3 — écarté par validerIndemnites. */
  if (plageDebut === undefined || plageFin === undefined) {
    return undefined
  }

  const debut = parseHeureLocale(dateRattachement, plageDebut, zone)
  if (debut.status !== 'ok') {
    return undefined
  }

  const traverseMinuit = plageFin < plageDebut
  const dateFin = traverseMinuit ? decalerDate(dateRattachement, 1) : dateRattachement
  const fin = parseHeureLocale(dateFin, plageFin, zone)
  if (fin.status !== 'ok') {
    return undefined
  }

  return { debut: millisDe(debut.instant), fin: millisDe(fin.instant) }
}

// ————————————————————————————————————————————————————————————————
// Incompatibilités
// ————————————————————————————————————————————————————————————————

type Eligible = { config: IndemniteConfig; quantite: number; incertain: boolean }

/**
 * « Parmi les indemnités éligibles et mutuellement incompatibles, retenir le
 * montant le plus élevé. » L'incompatibilité est **symétrique** : la déclarer
 * d'un seul côté suffit.
 *
 * Si l'une des concurrentes n'a pas de montant, on ne peut pas comparer : la
 * ligne retenue devient indécidable plutôt que de gagner par forfait.
 */
function arbitrer(eligibles: readonly Eligible[]): {
  retenues: readonly Eligible[]
  steps: CalculationStep[]
} {
  const steps: CalculationStep[] = []
  const ecartees = new Set<string>()
  const indecidables = new Set<string>()

  for (const groupe of groupesIncompatibles(eligibles)) {
    if (groupe.length < 2) {
      continue
    }
    const sansMontant = groupe.filter((e) => e.config.montantCents === undefined)
    const description = groupe
      .map((e) => `${e.config.libelle} (${montantLisible(e.config)})`)
      .join(' et ')

    if (sansMontant.length > 0) {
      for (const e of groupe) {
        indecidables.add(e.config.code)
      }
      steps.push({
        label: 'Arbitrage impossible',
        detail: `${description} sont éligibles et incompatibles, mais au moins un montant manque : impossible de dire laquelle est la plus élevée.`,
        value: 0,
      })
      continue
    }

    const gagnante = groupe.reduce((meilleure, candidate) =>
      montantDe(candidate.config) > montantDe(meilleure.config) ? candidate : meilleure,
    )
    for (const e of groupe) {
      if (e.config.code !== gagnante.config.code) {
        ecartees.add(e.config.code)
      }
    }
    steps.push({
      label: 'Indemnités incompatibles',
      detail: `${description} sont éligibles et incompatibles — retenu : le plus élevé, ${gagnante.config.libelle}.`,
      value: montantDe(gagnante.config),
    })
  }

  const retenues = eligibles
    .filter((e) => !ecartees.has(e.config.code))
    .map((e) => (indecidables.has(e.config.code) ? { ...e, incertain: true } : e))

  return { retenues, steps }
}

function montantDe(config: IndemniteConfig): number {
  const montant = config.montantCents
  return montant === undefined ? Number.NEGATIVE_INFINITY : montant
}

function montantLisible(config: IndemniteConfig): string {
  const montant = config.montantCents
  return montant === undefined ? 'montant non renseigné' : formatMontant(montant)
}

/** Composantes connexes du graphe d'incompatibilité, rendu symétrique. */
function groupesIncompatibles(eligibles: readonly Eligible[]): Eligible[][] {
  const parCode = new Map(eligibles.map((e) => [e.config.code, e]))
  const voisins = new Map<string, Set<string>>()
  for (const e of eligibles) {
    voisins.set(e.config.code, new Set())
  }

  for (const e of eligibles) {
    for (const autre of e.config.incompatibleAvec ?? []) {
      if (!parCode.has(autre)) {
        continue
      }
      voisins.get(e.config.code)?.add(autre)
      voisins.get(autre)?.add(e.config.code)
    }
  }

  const vus = new Set<string>()
  const groupes: Eligible[][] = []

  for (const e of eligibles) {
    if (vus.has(e.config.code)) {
      continue
    }
    const groupe: Eligible[] = []
    const aVisiter = [e.config.code]
    while (aVisiter.length > 0) {
      const code = aVisiter.pop()
      if (code === undefined || vus.has(code)) {
        continue
      }
      vus.add(code)
      const membre = parCode.get(code)
      if (membre !== undefined) {
        groupe.push(membre)
      }
      for (const voisin of voisins.get(code) ?? []) {
        if (!vus.has(voisin)) {
          aVisiter.push(voisin)
        }
      }
    }
    groupes.push(groupe)
  }

  return groupes
}

// ————————————————————————————————————————————————————————————————
// Montants
// ————————————————————————————————————————————————————————————————

function ligne(
  config: IndemniteConfig,
  quantite: number,
  incertain: boolean,
  dayId: string,
  stepsArbitrage: readonly CalculationStep[],
): LigneIndemnite {
  const preuves = {
    inputs: [{ label: config.libelle, value: quantite, origin: 'derive' as const, dayId }],
    steps: stepsArbitrage.filter((s) => s.detail.includes(config.libelle)),
    sources: [config.source],
  }

  const montantUnitaire = config.montantCents
  if (montantUnitaire === undefined) {
    return {
      code: config.code,
      libelle: config.libelle,
      quantite,
      montant: unknown<Cents>(
        {
          code: CODES_INDEMNITES.MONTANT_ABSENT,
          message: `Le montant de « ${config.libelle} » n'est pas renseigné : cette règle est désactivée tant qu'il manque. Reprends-le sur ta convention ou sur une fiche de paie.`,
          dayId,
          reglageManquant: `indemnites.${config.code}.montantCents`,
        },
        preuves,
      ),
    }
  }

  const total = arrondirEnCents(montantUnitaire * quantite)

  if (incertain) {
    return {
      code: config.code,
      libelle: config.libelle,
      quantite,
      montant: partial<Cents>({ min: ZERO_CENTS, max: total }, {
        ...preuves,
        warnings: [
          {
            code: CODES_INDEMNITES.DECLENCHEMENT_INCERTAIN,
            message: `Le déclenchement de « ${config.libelle} » dépend d'une zone que l'app ne sait pas qualifier : elle vaut ${formatMontant(total)} ou rien.`,
            dayId,
          },
        ],
      }),
    }
  }

  return {
    code: config.code,
    libelle: config.libelle,
    quantite,
    montant: complete(total, preuves),
  }
}

function totaliser(
  lignes: readonly LigneIndemnite[],
  problemes: readonly CalculationWarning[],
): CalculationResult<Cents> {
  const preuves = {
    steps: lignes.flatMap((l) => l.montant.steps),
    warnings: [...problemes, ...lignes.flatMap((l) => l.montant.warnings)],
    sources: lignes.flatMap((l) => l.montant.sources),
  }

  const inconnue = lignes.find((l) => l.montant.status === 'unknown')
  if (inconnue !== undefined) {
    return unknown<Cents>(
      inconnue.montant.warnings.at(-1) ?? {
        code: CODES_INDEMNITES.MONTANT_ABSENT,
        message: "Une indemnité n'a pas de montant renseigné.",
      },
      preuves,
    )
  }

  let min = 0
  let max = 0
  for (const l of lignes) {
    if (l.montant.status === 'complete') {
      min += l.montant.value
      max += l.montant.value
    } else if (l.montant.status === 'partial') {
      min += l.montant.range.min
      max += l.montant.range.max
    }
  }

  // Ne rien avoir configuré est un état légitime : le total vaut zéro et il est
  // certain, il n'est pas « incalculable ».
  return partial<Cents>({ min: cents(min), max: cents(max) }, preuves)
}

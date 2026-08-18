import { cents, type Cents, type Minutes } from '../primitives/brands'
import {
  bornes,
  complete,
  partial,
  unknown,
  type CalculationResult,
} from '../primitives/calculationResult'
import { valoriser } from '../primitives/roundingPolicy'
import type { Absence, PayPeriod, SaisieIndemnite, Settings, WorkDay } from '../domain'
import { indemnitesDuJour, type LigneIndemnite } from '../indemnites/indemnites'
import { joursEntreDates } from '../time/instant'
import type { JourneeQualifiee } from '../qualify/types'
import { heuresSup, totalTempsRemunere, type ResultatHeuresSup } from './heuresSup'
import { CODES_PAIE } from './tempsRemunere'

/**
 * Assemblage d'une période de paie : c'est cette sortie que consomment l'écran
 * « Vérifier ma paie » et le relevé PDF, **sans rien recalculer** (SPEC §2).
 */

export type LigneIndemnitePeriode = {
  readonly code: string
  readonly libelle: string
  readonly quantite: number
  readonly montant: CalculationResult<Cents>
}

export type SynthesePeriode = {
  readonly periode: PayPeriod
  readonly tempsRemunere: CalculationResult<Minutes>
  readonly heuresSup: ResultatHeuresSup
  readonly indemnites: readonly LigneIndemnitePeriode[]
  readonly totalIndemnites: CalculationResult<Cents>
  /**
   * **Presque toujours `unknown` dès qu'il y a une absence** (SPEC §4) : les
   * absences ne sont pas valorisées en v1, donc un mois qui en contient ne peut
   * pas produire un brut fiable. Les heures sup et les indemnités, elles,
   * restent `complete` — ce sont elles qui portent la valeur.
   */
  readonly brut: CalculationResult<Cents>
  readonly joursAbsence: Readonly<Record<string, number>>
}

export function synthetiserPeriode(
  periode: PayPeriod,
  jours: readonly { readonly jour: WorkDay; readonly journee: JourneeQualifiee }[],
  settings: Settings,
  absences: readonly Absence[] = [],
  saisies: readonly SaisieIndemnite[] = [],
): SynthesePeriode {
  const dansLaPeriode = jours.filter(
    (j) =>
      j.journee.dateRattachement >= periode.debut && j.journee.dateRattachement <= periode.fin,
  )
  const journees = dansLaPeriode.map((j) => j.journee)

  const temps = totalTempsRemunere(journees, settings)
  const hs = heuresSup(journees, settings, periode)

  const lignesParJour = dansLaPeriode.map((j) =>
    indemnitesDuJour(j.jour, j.journee, settings, saisies),
  )
  const indemnites = cumulerIndemnites(lignesParJour.flatMap((i) => i.lignes))
  const totalIndemnites = totaliserIndemnites(indemnites)

  const joursAbsence = compterAbsences(absences, periode)

  return {
    periode,
    tempsRemunere: temps,
    heuresSup: hs,
    indemnites,
    totalIndemnites,
    brut: calculerBrut(temps, hs, totalIndemnites, joursAbsence, settings),
    joursAbsence,
  }
}

function cumulerIndemnites(lignes: readonly LigneIndemnite[]): LigneIndemnitePeriode[] {
  const parCode = new Map<string, LigneIndemnite[]>()
  for (const ligne of lignes) {
    parCode.set(ligne.code, [...(parCode.get(ligne.code) ?? []), ligne])
  }

  return [...parCode.entries()].map(([code, groupe]) => {
    const premiere = groupe[0]!
    const quantite = groupe.reduce<number>((total, l) => total + l.quantite, 0)

    const inconnue = groupe.find((l) => l.montant.status === 'unknown')
    const preuves = {
      steps: groupe.flatMap((l) => l.montant.steps),
      inputs: groupe.flatMap((l) => l.montant.inputs),
      warnings: groupe.flatMap((l) => l.montant.warnings),
      sources: groupe.flatMap((l) => l.montant.sources),
    }

    if (inconnue !== undefined) {
      return {
        code,
        libelle: premiere.libelle,
        quantite,
        montant: unknown<Cents>(inconnue.montant.warnings.at(-1)!, preuves),
      }
    }

    let min = 0
    let max = 0
    for (const l of groupe) {
      const b = bornes(l.montant)
      /* c8 ignore next 3 */
      if (b === undefined) {
        continue
      }
      min += b.min
      max += b.max
    }

    return {
      code,
      libelle: premiere.libelle,
      quantite,
      montant: partial<Cents>({ min: cents(min), max: cents(max) }, preuves),
    }
  })
}

function totaliserIndemnites(
  lignes: readonly LigneIndemnitePeriode[],
): CalculationResult<Cents> {
  const preuves = {
    steps: lignes.flatMap((l) => l.montant.steps),
    warnings: lignes.flatMap((l) => l.montant.warnings),
    sources: lignes.flatMap((l) => l.montant.sources),
  }

  const inconnue = lignes.find((l) => l.montant.status === 'unknown')
  if (inconnue !== undefined) {
    return unknown<Cents>(inconnue.montant.warnings.at(-1)!, preuves)
  }

  let min = 0
  let max = 0
  for (const l of lignes) {
    const b = bornes(l.montant)
    /* c8 ignore next 3 */
    if (b === undefined) {
      continue
    }
    min += b.min
    max += b.max
  }
  return partial<Cents>({ min: cents(min), max: cents(max) }, preuves)
}

function compterAbsences(
  absences: readonly Absence[],
  periode: PayPeriod,
): Readonly<Record<string, number>> {
  const compte: Record<string, number> = {}
  for (const absence of absences) {
    if (absence.fin < periode.debut || absence.debut > periode.fin) {
      continue
    }
    // Hors périmètre v1 : on **compte les jours**, on ne les valorise pas.
    const debut = absence.debut > periode.debut ? absence.debut : periode.debut
    const fin = absence.fin < periode.fin ? absence.fin : periode.fin
    const jours = joursEntreDates(debut, fin) + 1
    const valeur = absence.demiJournee === undefined ? jours : 0.5
    const deja = compte[absence.type]
    compte[absence.type] = (deja === undefined ? 0 : deja) + valeur
  }
  return compte
}

/**
 * Brut de la période. Il n'est calculable que si **rien n'a été absent** :
 * l'app ne valorise ni maladie, ni congés, ni maintien conventionnel (SPEC §1),
 * et un brut amputé de ces lignes serait un chiffre plausible et faux.
 */
function calculerBrut(
  temps: CalculationResult<Minutes>,
  hs: ResultatHeuresSup,
  totalIndemnites: CalculationResult<Cents>,
  joursAbsence: Readonly<Record<string, number>>,
  settings: Settings,
): CalculationResult<Cents> {
  const preuves = {
    warnings: [...temps.warnings, ...hs.duree.warnings],
    sources: [...temps.sources, ...hs.duree.sources],
  }

  const types = Object.keys(joursAbsence)
  if (types.length > 0) {
    return unknown<Cents>(
      {
        code: CODES_PAIE.ABSENCE_NON_VALORISEE,
        message: `Cette période contient des absences (${types.join(', ')}) et cette version ne les valorise pas : le brut global ne peut pas être fiable. Tes heures supplémentaires et tes indemnités, elles, restent calculées.`,
      },
      preuves,
    )
  }

  const taux = settings.tauxHoraireBaseCents
  if (taux === undefined) {
    return unknown<Cents>(
      {
        code: CODES_PAIE.TAUX_ABSENT,
        message:
          "Le taux horaire de base n'est pas renseigné : sans lui, le brut reste incalculable.",
        reglageManquant: 'tauxHoraireBaseCents',
      },
      preuves,
    )
  }

  const parties: CalculationResult<Cents>[] = [
    convertir(temps, taux),
    hs.valorisation,
    totalIndemnites,
  ]

  const inconnue = parties.find((p) => p.status === 'unknown')
  if (inconnue !== undefined) {
    return unknown<Cents>(inconnue.warnings.at(-1)!, {
      ...preuves,
      warnings: [...preuves.warnings, ...parties.flatMap((p) => p.warnings)],
    })
  }

  let min = 0
  let max = 0
  for (const partie of parties) {
    const b = bornes(partie)
    /* c8 ignore next 3 */
    if (b === undefined) {
      continue
    }
    min += b.min
    max += b.max
  }

  return partial<Cents>(
    { min: cents(min), max: cents(max) },
    {
      ...preuves,
      steps: parties.flatMap((p) => p.steps),
      sources: [...preuves.sources, ...parties.flatMap((p) => p.sources)],
    },
  )
}

function convertir(
  temps: CalculationResult<Minutes>,
  taux: Cents,
): CalculationResult<Cents> {
  if (temps.status === 'unknown') {
    return unknown<Cents>(temps.warnings.at(-1)!, { warnings: temps.warnings })
  }
  const preuves = { steps: temps.steps, warnings: temps.warnings, sources: temps.sources }
  if (temps.status === 'complete') {
    return complete(valoriser(temps.value, taux), preuves)
  }
  return partial<Cents>(
    { min: valoriser(temps.range.min, taux), max: valoriser(temps.range.max, taux) },
    preuves,
  )
}

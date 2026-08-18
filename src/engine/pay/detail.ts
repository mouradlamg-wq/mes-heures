import { minutes, type Minutes } from '../primitives/brands'
import {
  bornes,
  complete,
  partial,
  unknown,
  type CalculationResult,
  type CalculationWarning,
  type Statut,
} from '../primitives/calculationResult'
import type { Absence, Settings, TypeAbsence, WorkDay } from '../domain'
import type { JourneeQualifiee } from '../qualify/types'
import { decalerDate, joursEntreDates } from '../time/instant'
import type { ISODate } from '../time/types'
import { tempsRemunere } from './tempsRemunere'

/**
 * Détail d'un intervalle, jour par jour (SPEC §11, écran « Ma semaine / Ma
 * période »).
 *
 * Une ligne par jour du calendrier, **y compris les jours sans rien** : c'est
 * ce qui distingue un repos d'un oubli de saisie. La v1 ne qualifie aucune
 * conformité — ni durée maximale, ni repos minimal, ni feu tricolore.
 */

export type LigneJournaliere =
  | {
      readonly sorte: 'travail'
      readonly date: ISODate
      readonly dayId: string
      /** `fin − début`. Information brute, sans source. */
      readonly amplitude: CalculationResult<Minutes>
      /** Brut, pour le futur module RSE. Sans source non plus. */
      readonly conduite: CalculationResult<Minutes>
      readonly tempsRemunere: CalculationResult<Minutes>
    }
  /** L'app **compte** les jours d'absence par type, elle ne les valorise pas. */
  | { readonly sorte: 'absence'; readonly date: ISODate; readonly type: TypeAbsence }
  | { readonly sorte: 'repos'; readonly date: ISODate }

export type DetailIntervalle = {
  readonly debut: ISODate
  readonly fin: ISODate
  readonly lignes: readonly LigneJournaliere[]

  /**
   * Total des journées **retenues**, c'est-à-dire celles dont le temps rémunéré
   * est calculable. Les journées incalculables en sont exclues et comptées à
   * part : les additionner produirait un `unknown` qui masquerait dix-neuf
   * journées parfaitement connues.
   */
  readonly total: CalculationResult<Minutes>

  readonly joursCertains: number
  readonly joursPartiels: number
  readonly joursIncalculables: number
  readonly joursAbsence: number
  readonly joursRepos: number
}

export function detaillerIntervalle(
  debut: ISODate,
  fin: ISODate,
  journees: readonly { readonly jour: WorkDay; readonly journee: JourneeQualifiee }[],
  settings: Settings,
  absences: readonly Absence[] = [],
): DetailIntervalle {
  const lignes: LigneJournaliere[] = []
  const retenus: CalculationResult<Minutes>[] = []
  const avertissements: CalculationWarning[] = []

  let joursCertains = 0
  let joursPartiels = 0
  let joursIncalculables = 0
  let joursAbsence = 0
  let joursRepos = 0

  for (const date of datesEntre(debut, fin)) {
    const paire = journees.find((j) => j.journee.dateRattachement === date)

    if (paire !== undefined) {
      const temps = tempsRemunere(paire.journee, settings)
      lignes.push({
        sorte: 'travail',
        date,
        dayId: paire.jour.id,
        amplitude: paire.journee.amplitude,
        conduite: paire.journee.dureeParType.conduite,
        tempsRemunere: temps,
      })

      if (temps.status === 'unknown') {
        joursIncalculables += 1
        avertissements.push(...temps.warnings.slice(-1))
      } else {
        retenus.push(temps)
        if (temps.status === 'complete') {
          joursCertains += 1
        } else {
          joursPartiels += 1
        }
      }
      continue
    }

    const absence = absences.find((a) => a.debut <= date && a.fin >= date)
    if (absence !== undefined) {
      lignes.push({ sorte: 'absence', date, type: absence.type })
      joursAbsence += 1
      continue
    }

    lignes.push({ sorte: 'repos', date })
    joursRepos += 1
  }

  return {
    debut,
    fin,
    lignes,
    total: totaliser(retenus, joursIncalculables, avertissements),
    joursCertains,
    joursPartiels,
    joursIncalculables,
    joursAbsence,
    joursRepos,
  }
}

/**
 * Somme des journées retenues. Quand des journées ont été écartées, un
 * avertissement le dit **dans le résultat lui-même** : le chiffre ne doit jamais
 * circuler sans son décompte de journées manquantes.
 */
function totaliser(
  retenus: readonly CalculationResult<Minutes>[],
  joursIncalculables: number,
  avertissements: readonly CalculationWarning[],
): CalculationResult<Minutes> {
  const manquantes: CalculationWarning[] =
    joursIncalculables === 0
      ? []
      : [
          {
            code: 'journees_ecartees_du_total',
            message:
              joursIncalculables === 1
                ? "Une journée n'est pas calculable : elle n'est pas comptée dans ce total."
                : `${String(joursIncalculables)} journées ne sont pas calculables : elles ne sont pas comptées dans ce total.`,
          },
        ]

  if (retenus.length === 0) {
    return unknown(
      manquantes[0] ?? {
        // Ni « période » ni « semaine » : la même fonction sert aux deux.
        code: 'aucune_journee',
        message: "Aucune journée saisie sur ces dates.",
      },
      { warnings: [...avertissements] },
    )
  }

  let min = 0
  let max = 0
  for (const resultat of retenus) {
    const b = bornes(resultat)
    /* c8 ignore next 3 — les `unknown` ont été écartés en amont. */
    if (b === undefined) {
      continue
    }
    min += b.min
    max += b.max
  }

  const preuves = {
    inputs: retenus.flatMap((r) => r.inputs),
    steps: retenus.flatMap((r) => r.steps),
    warnings: [...manquantes, ...avertissements, ...retenus.flatMap((r) => r.warnings)],
    sources: retenus.flatMap((r) => r.sources),
  }

  return min === max
    ? complete(minutes(min), preuves)
    : partial<Minutes>({ min: minutes(min), max: minutes(max) }, preuves)
}

/**
 * Statut à afficher pour le total.
 *
 * Un total « certain » alors que des journées ont été écartées serait faux à la
 * lecture, même si le calcul des journées retenues, lui, est exact. Dès qu'il
 * manque une journée, la lecture est partielle.
 */
export function statutDeLecture(detail: DetailIntervalle): Statut {
  if (detail.total.status === 'unknown') {
    return 'unknown'
  }
  return detail.joursIncalculables > 0 ? 'partial' : detail.total.status
}

/** Toutes les dates de l'intervalle, bornes incluses. */
export function datesEntre(debut: ISODate, fin: ISODate): readonly ISODate[] {
  const nombre = joursEntreDates(debut, fin)
  if (nombre < 0) {
    return []
  }
  const dates: ISODate[] = []
  for (let i = 0; i <= nombre; i += 1) {
    dates.push(decalerDate(debut, i))
  }
  return dates
}

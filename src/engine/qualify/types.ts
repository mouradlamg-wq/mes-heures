import type { Minutes } from '../primitives/brands'
import type { CalculationResult, CalculationWarning } from '../primitives/calculationResult'
import type { TypeSegment } from '../domain'
import type { ISODate, ISODateTime } from '../time/types'

/** Tranche de la journée dont on sait ce qu'elle était. */
export type ZoneQualifiee = {
  readonly debut: ISODateTime
  readonly fin: ISODateTime
  readonly duree: Minutes
  readonly type: TypeSegment
  /** `manuelle` : l'utilisateur a qualifié la zone après coup, en un appui. */
  readonly origine: 'segment' | 'manuelle'
  /** Vrai si la tranche déborde de l'amplitude déclarée. */
  readonly horsAmplitude: boolean
}

/**
 * Tranche que le moteur **refuse de qualifier**. C'est le cœur du « juste ou
 * absent » : il ne choisit pas entre coupure, disponibilité et autre travail.
 */
export type ZoneIndeterminee = {
  readonly debut: ISODateTime
  readonly fin: ISODateTime
  readonly duree: Minutes
  readonly cause: 'trou' | 'chevauchement'
  /** Renseigné pour un chevauchement : les types qui se disputent la tranche. */
  readonly typesEnConflit?: readonly TypeSegment[]
}

export type JourneeQualifiee = {
  readonly dayId: string
  readonly dateRattachement: ISODate

  /** `fin − début`. Information brute : elle ne porte aucune `RuleSource`. */
  readonly amplitude: CalculationResult<Minutes>

  readonly zones: readonly ZoneQualifiee[]
  readonly zonesIndeterminees: readonly ZoneIndeterminee[]

  /**
   * Par type : `complete` si aucune zone indéterminée ne pourrait lui
   * appartenir, `partial` sinon — bornes « la zone ne compte pas » et « la zone
   * compte entièrement pour ce type ». Aucun milieu arbitraire (SPEC §6).
   */
  readonly dureeParType: Readonly<Record<TypeSegment, CalculationResult<Minutes>>>

  /** Total des tranches non qualifiées. Vaut 0 sur une journée nette. */
  readonly tempsIndetermine: Minutes

  readonly warnings: readonly CalculationWarning[]

  /**
   * Une journée est complète quand rien n'est indéterminé, que l'amplitude est
   * connue et qu'aucune donnée n'est ouverte. **Dérivé, jamais stocké** (SPEC §9).
   */
  readonly complete: boolean
}

export const CODES = {
  JOURNEE_VIDE: 'journee_vide',
  PRISE_ABSENTE: 'prise_service_absente',
  FIN_ABSENTE: 'fin_service_absente',
  FIN_AVANT_PRISE: 'fin_avant_prise',
  SEGMENT_OUVERT: 'segment_ouvert',
  SEGMENT_SANS_BORNE: 'segment_sans_borne',
  SEGMENT_HORS_AMPLITUDE: 'segment_hors_amplitude',
  ZONE_NON_QUALIFIEE: 'zone_non_qualifiee',
  CHEVAUCHEMENT: 'chevauchement_de_types',
  INSTANT_ILLISIBLE: 'instant_illisible',
} as const

import type { Cents, Minutes } from './primitives/brands'
import type { RuleSource } from './primitives/calculationResult'
import type { ISODate, ISODateTime } from './time/types'

/**
 * Modèle de données (SPEC §9).
 *
 * **Tout réglage métier est optionnel.** Le seul champ requis est
 * `timeZoneReference`. Un champ absent produit `status: 'unknown'` sur les
 * calculs qui en dépendent, jamais une valeur par défaut silencieuse.
 *
 * Ces types vivent dans le moteur parce que la persistance les consomme, et
 * jamais l'inverse (CLAUDE.md §4).
 */

export type TypeSegment = 'conduite' | 'autre_travail' | 'disponibilite' | 'coupure'

export const TYPES_SEGMENT: readonly TypeSegment[] = [
  'conduite',
  'autre_travail',
  'disponibilite',
  'coupure',
]

export type Segment = {
  readonly id: string
  readonly type: TypeSegment
  readonly debut?: ISODateTime
  readonly fin?: ISODateTime
}

export type WorkDay = {
  readonly id: string
  /** Journée de service ≠ jour calendaire : c'est le jour de la prise de service. */
  readonly dateRattachement: ISODate
  readonly priseService?: ISODateTime
  readonly finService?: ISODateTime
  readonly segments: readonly Segment[]
  readonly decouche?: boolean
  readonly lieuFin?: string
  readonly templateId?: string
  readonly note?: string
}

export type TypeAbsence =
  | 'CP'
  | 'RTT'
  | 'MALADIE'
  | 'AT'
  | 'RECUP'
  | 'FORMATION'
  | 'SANS_SOLDE'
  | 'REPOS'

export const TYPES_ABSENCE: readonly TypeAbsence[] = [
  'CP',
  'RTT',
  'MALADIE',
  'AT',
  'RECUP',
  'FORMATION',
  'SANS_SOLDE',
  'REPOS',
]

/**
 * Hors périmètre v1 : l'app **compte les jours par type**, elle ne valorise
 * rien (SPEC §1). C'est la raison pour laquelle un mois comportant une absence
 * produit un brut `partial`.
 */
export type Absence = {
  readonly id: string
  readonly type: TypeAbsence
  readonly debut: ISODate
  readonly fin: ISODate
  readonly demiJournee?: 'matin' | 'apres_midi'
  readonly note?: string
}

export type DeclencheurIndemnite =
  | 'plage_horaire'
  | 'decouche'
  | 'duree_service'
  | 'quantite_manuelle'

export type IndemniteConfig = {
  readonly id: string
  /** Identifie la ligne sur la fiche de paie. Unique. */
  readonly code: string
  readonly libelle: string
  /** Absent = règle désactivée, **pas** zéro (SPEC §8). */
  readonly montantCents?: Cents

  readonly declencheur: DeclencheurIndemnite

  readonly plageDebut?: string
  /** Si `plageFin < plageDebut`, la plage traverse minuit sur la journée de service. */
  readonly plageFin?: string
  readonly dureeMinMinutes?: Minutes
  readonly typesSegmentEligibles?: readonly TypeSegment[]

  readonly amplitudeMinMinutes?: Minutes

  readonly quantiteMaxParJour?: number
  /** Codes d'autres indemnités. L'incompatibilité est symétrique. */
  readonly incompatibleAvec?: readonly string[]
  readonly source: RuleSource
}

export type ModeDecompteHS = 'hebdomadaire' | 'mensuel' | 'periode_reference'

export type JourSemaine = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type RattachementSemaineChevauchante =
  | 'periode_de_fin'
  | 'periode_de_debut'
  | 'prorata'

export type TrancheHS = {
  readonly deMinutes: Minutes
  /** `null` = tranche ouverte, la dernière. */
  readonly aMinutes: Minutes | null
  readonly majorationPct: number
}

export type PalierCoupure = {
  readonly auDelaDeMinutes: Minutes
  /** Fraction rémunérée de la part au-delà du seuil, entre 0 et 1. */
  readonly fraction: number
}

export type Settings = {
  /** Seul champ obligatoire. */
  readonly timeZoneReference: string
  readonly entreprise?: string
  readonly domicile?: string

  readonly tauxHoraireBaseCents?: Cents
  readonly modeDecompteHS?: ModeDecompteHS
  /** 1 = lundi. Régime **supplétif**, pas une constante : un accord peut en décider autrement. */
  readonly debutSemaine?: JourSemaine
  readonly dureeReferenceMinutes?: Minutes
  readonly periodeReferenceSemaines?: number
  /** Sans point d'ancrage, « 4 semaines » ne veut rien dire. */
  readonly periodeReferenceDebut?: ISODate
  readonly rattachementSemaineChevauchante?: RattachementSemaineChevauchante
  readonly tranchesHS?: readonly TrancheHS[]
  readonly estForfaitJours?: boolean

  /** Entre 0 et 1. Absent ≠ 0 : absent veut dire « je ne sais pas ». */
  readonly fractionDisponibiliteRemuneree?: number
  readonly coupuresRemunerees?: readonly PalierCoupure[]

  readonly indemnites: readonly IndemniteConfig[]
  /** 1 = mois civil, 26 = du 26 au 25. */
  readonly payPeriodConfig?: { readonly jourDebut: number }
}

/** Générée depuis les réglages, jamais déduite d'un `YYYY-MM` (SPEC §7). */
export type PayPeriod = {
  readonly id: string
  readonly label: string
  readonly debut: ISODate
  readonly fin: ISODate
}

export type SegmentRelatif = {
  readonly type: TypeSegment
  /** Minutes depuis la prise de service. */
  readonly debutRelatifMinutes: Minutes
  readonly finRelatifMinutes: Minutes
}

export type DayTemplate = {
  readonly id: string
  readonly libelle: string
  readonly segmentsRelatifs: readonly SegmentRelatif[]
  readonly decoucheParDefaut?: boolean
}

/** Ce que le conducteur relève sur sa fiche de paie, pour comparaison. */
export type PayCheck = {
  readonly id: string
  readonly payPeriodId: string
  /** Les fiches françaises sont en centièmes : on stocke ce qui est écrit. */
  readonly heuresPayeesCentiemes?: number
  readonly heuresSupPayees?: number
  readonly indemnitesPayees?: readonly { readonly code: string; readonly quantite: number }[]
  readonly brutCents?: Cents
}

/**
 * Zone qualifiée après coup par l'utilisateur (SPEC §6 : « l'UI propose de
 * qualifier la zone en un appui »). Rattachée à la journée, pas au calcul.
 */
export type QualificationManuelle = {
  readonly id: string
  readonly dayId: string
  readonly debut: ISODateTime
  readonly fin: ISODateTime
  readonly type: TypeSegment
}

/**
 * Quantité saisie à la main pour une indemnité en `quantite_manuelle` : le
 * moteur ne peut pas la déduire, c'est le conducteur qui la connaît.
 */
export type SaisieIndemnite = {
  readonly id: string
  readonly dayId: string
  readonly code: string
  readonly quantite: number
}

export const CODES_INDEMNITES_COURANTS: readonly { code: string; libelle: string }[] = [
  { code: 'REPAS', libelle: 'Repas' },
  { code: 'REPAS_UNIQUE', libelle: 'Repas unique' },
  { code: 'CASSE_CROUTE', libelle: 'Casse-croûte' },
  { code: 'SPECIALE', libelle: 'Indemnité spéciale' },
  { code: 'DECOUCHER', libelle: 'Découcher' },
  { code: 'REPAS_DECOUCHER', libelle: 'Repas découcher' },
]

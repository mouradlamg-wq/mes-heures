/**
 * Seule surface publique du moteur (CLAUDE.md §4).
 *
 * L'UI, le PDF et la persistance importent d'ici, jamais d'un chemin profond :
 * c'est ce qui garantit qu'on peut réorganiser l'intérieur sans casser les
 * écrans, et qu'aucun calcul ne fuit hors du moteur.
 */

export type { Cents, Minutes } from './primitives/brands'
export {
  cents,
  minutes,
  ajouterCents,
  ajouterMinutes,
  soustraireCents,
  ecartMinutes,
  ZERO_CENTS,
  ZERO_MINUTES,
} from './primitives/brands'

export {
  arrondir,
  arrondirEnCents,
  arrondirEnMinutes,
  minutesEnCentiemes,
  centiemesEntiers,
  centiemesEnMinutes,
  valoriser,
  valoriserMajore,
  majorer,
} from './primitives/roundingPolicy'

export type {
  CalculationResult,
  CalculationInput,
  CalculationStep,
  CalculationWarning,
  RuleSource,
  Range,
  Statut,
} from './primitives/calculationResult'
export {
  complete,
  partial,
  unknown,
  estComplete,
  bornes,
  contient,
  sommer,
  transformer,
  annoter,
  personnaliser,
} from './primitives/calculationResult'

export type { DureeFormatee, AffichageResultat } from './primitives/format'
export {
  formatDuree,
  formatIntervalleDuree,
  formatMontant,
  formatIntervalleMontant,
  formatEcartMontant,
  formatEcartDuree,
  formatHeureHorloge,
  formatSource,
  libelleStatut,
  afficherDuree,
  MENTIONS,
  TYPOGRAPHIE,
} from './primitives/format'

export { assertNever } from './primitives/assertNever'

export type { ISODate, ISODateTime, HeureHorloge, LocalTimeResolution } from './time/types'
export { parseHeureLocale, formatInstant } from './time/localTime'
export type { LectureInstant } from './time/instant'
export {
  lireInstant,
  memeInstant,
  comparerInstants,
  dureeEntre,
  jourDeService,
  heureMuraleDe,
  decalerDate,
  joursEntreDates,
  jourDeSemaine,
} from './time/instant'
export { zoneValide } from './time/zone'

export type {
  Absence,
  DayTemplate,
  IndemniteConfig,
  JourSemaine,
  ModeDecompteHS,
  PalierCoupure,
  PayCheck,
  PayPeriod,
  QualificationManuelle,
  RattachementSemaineChevauchante,
  Segment,
  SegmentRelatif,
  Settings,
  TrancheHS,
  TypeAbsence,
  TypeSegment,
  WorkDay,
} from './domain'
export { TYPES_SEGMENT, TYPES_ABSENCE, CODES_INDEMNITES_COURANTS } from './domain'

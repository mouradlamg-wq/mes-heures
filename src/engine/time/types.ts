/** Instant absolu, chaîne ISO 8601 **avec offset**. Jamais un timestamp nu. */
export type ISODateTime = string

/** Date calendaire `YYYY-MM-DD`, exprimée dans `Settings.timeZoneReference`. */
export type ISODate = string

/** Heure d'horloge `HH:mm`, telle que le conducteur la saisit. */
export type HeureHorloge = string

/**
 * Résultat du passage `date + HH:mm → instant` (SPEC §5).
 *
 * Deux nuits par an, une plage d'une heure : c'est rare, mais un service de nuit
 * y tombe et une correction silencieuse fausserait durablement un mois de paie.
 */
export type LocalTimeResolution =
  | { readonly status: 'ok'; readonly instant: ISODateTime }
  /** Recul des horloges : l'heure existe deux fois. Rangées de la plus tôt à la plus tard. */
  | { readonly status: 'ambiguous'; readonly choices: readonly ISODateTime[] }
  /** Avance des horloges, ou saisie invalide. `reason` est affichable telle quelle. */
  | { readonly status: 'invalid'; readonly reason: string }

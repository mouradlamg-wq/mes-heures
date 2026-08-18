import { IANAZone } from 'luxon'
import type { ISODate } from './types'

/**
 * La zone vient toujours de `Settings.timeZoneReference`, jamais du navigateur
 * (SPEC §5). Ce module est le seul à instancier une zone, et il met les
 * instances en cache : `IANAZone.create` est appelé des milliers de fois sur une
 * période de paie.
 */
const cache = new Map<string, IANAZone>()

export function zoneValide(nom: string): boolean {
  return IANAZone.isValidZone(nom)
}

export function zone(nom: string): IANAZone {
  const enCache = cache.get(nom)
  if (enCache !== undefined) {
    return enCache
  }
  if (!zoneValide(nom)) {
    throw new RangeError(`Fuseau horaire inconnu : ${nom}`)
  }
  const creee = IANAZone.create(nom)
  cache.set(nom, creee)
  return creee
}

/** Décalage de la zone, en minutes, à un instant donné. */
export function offsetA(nomZone: string, instantMillis: number): number {
  return zone(nomZone).offset(instantMillis)
}

const MILLIS_PAR_MINUTE = 60_000
const MARGE_MILLIS = 36 * 60 * MILLIS_PAR_MINUTE

/**
 * Instant du changement d'offset encadrant `autourDeMillis`, à la minute près.
 * Retourne le **premier** instant portant le nouvel offset, ou `undefined` si la
 * zone ne change pas d'offset dans la fenêtre.
 *
 * Recherche dichotomique plutôt que table en dur : la règle de changement
 * d'heure n'est pas une constante du moteur, elle appartient à la base IANA.
 */
export function trouverTransition(nomZone: string, autourDeMillis: number): number | undefined {
  const z = zone(nomZone)
  let bas = autourDeMillis - MARGE_MILLIS
  let haut = autourDeMillis + MARGE_MILLIS

  const offsetBas = z.offset(bas)
  if (offsetBas === z.offset(haut)) {
    return undefined
  }

  while (haut - bas > MILLIS_PAR_MINUTE) {
    const milieu = bas + Math.floor((haut - bas) / 2)
    if (z.offset(milieu) === offsetBas) {
      bas = milieu
    } else {
      haut = milieu
    }
  }
  return haut
}

/** Date calendaire `YYYY-MM-DD` construite sans passer par un objet Luxon. */
export function composerDate(annee: number, mois: number, jour: number): ISODate {
  return `${String(annee).padStart(4, '0')}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`
}

export const MILLIS = {
  PAR_MINUTE: MILLIS_PAR_MINUTE,
  PAR_HEURE: 60 * MILLIS_PAR_MINUTE,
  PAR_JOUR: 24 * 60 * MILLIS_PAR_MINUTE,
} as const

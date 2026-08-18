import { DateTime } from 'luxon'
import { minutes, type Minutes } from '../primitives/brands'
import type { ISODate, ISODateTime } from './types'
import { composerDate, MILLIS, zoneValide } from './zone'

/**
 * Lecture d'un instant stocké. Le stockage impose une chaîne ISO 8601 **avec
 * offset** (SPEC §5) : une chaîne sans offset serait réinterprétée dans le
 * fuseau du navigateur, ce qui décalerait une journée entière selon l'endroit où
 * le téléphone se trouve.
 */
export type LectureInstant =
  | { readonly status: 'ok'; readonly millis: number }
  | { readonly status: 'invalid'; readonly reason: string }

const RE_ISO_AVEC_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/

export function lireInstant(iso: ISODateTime): LectureInstant {
  const trouve = RE_ISO_AVEC_OFFSET.exec(iso)
  if (trouve === null) {
    return {
      status: 'invalid',
      reason: `« ${iso} » n'est pas un instant complet. Il manque le décalage horaire (par exemple +01:00).`,
    }
  }

  const secondes = trouve[6]
  if (secondes !== undefined && secondes !== '00') {
    return {
      status: 'invalid',
      reason: `« ${iso} » porte des secondes. La saisie est à la minute (SPEC §10).`,
    }
  }

  const analyse = DateTime.fromISO(iso, { setZone: true })
  if (!analyse.isValid) {
    return { status: 'invalid', reason: `« ${iso} » n'est pas une date valide.` }
  }

  return { status: 'ok', millis: analyse.toMillis() }
}

/**
 * Variante brutale, pour l'intérieur du moteur : les instants qui circulent ont
 * déjà franchi la validation Zod de la couche de persistance. En trouver un
 * invalide ici est un bug de programmation, pas un cas métier.
 */
export function millisDe(iso: ISODateTime): number {
  const lecture = lireInstant(iso)
  if (lecture.status === 'invalid') {
    throw new TypeError(`Instant invalide dans le moteur : ${lecture.reason}`)
  }
  return lecture.millis
}

/** Deux instants identiques exprimés avec des offsets différents sont égaux. */
export function memeInstant(a: ISODateTime, b: ISODateTime): boolean {
  return millisDe(a) === millisDe(b)
}

export function comparerInstants(a: ISODateTime, b: ISODateTime): number {
  return millisDe(a) - millisDe(b)
}

/**
 * Durée entre deux instants absolus. Le passage à l'heure d'été ou d'hiver est
 * pris en compte par construction : on soustrait des instants, pas des heures
 * murales.
 */
export function dureeEntre(debut: ISODateTime, fin: ISODateTime): Minutes {
  return dureeEntreMillis(millisDe(debut), millisDe(fin))
}

export function dureeEntreMillis(debutMillis: number, finMillis: number): Minutes {
  const ecart = finMillis - debutMillis
  if (ecart < 0) {
    throw new RangeError(
      "Une fin de service ne peut pas précéder la prise de service : c'est à l'appelant de le signaler avant d'appeler dureeEntre.",
    )
  }
  if (ecart % MILLIS.PAR_MINUTE !== 0) {
    throw new RangeError(`Durée non entière en minutes : ${String(ecart)} ms.`)
  }
  return minutes(ecart / MILLIS.PAR_MINUTE)
}

/**
 * Jour calendaire d'un instant, **dans la zone de référence**. Un instant à
 * 00:00 pile appartient au jour qui commence, jamais au précédent.
 */
export function jourDeService(instant: ISODateTime, nomZone: string): ISODate {
  return jourDeServiceMillis(millisDe(instant), nomZone)
}

export function jourDeServiceMillis(instantMillis: number, nomZone: string): ISODate {
  if (!zoneValide(nomZone)) {
    throw new RangeError(`Fuseau horaire inconnu : ${nomZone}`)
  }
  const dt = DateTime.fromMillis(instantMillis, { zone: nomZone })
  return composerDate(dt.year, dt.month, dt.day)
}

/** Heure murale `HH:mm` d'un instant dans la zone de référence. */
export function heureMuraleDe(instant: ISODateTime, nomZone: string): string {
  const dt = DateTime.fromMillis(millisDe(instant), { zone: nomZone })
  return `${String(dt.hour).padStart(2, '0')}:${String(dt.minute).padStart(2, '0')}`
}

/** Décale une date calendaire d'un nombre de jours, sans passer par un instant. */
export function decalerDate(date: ISODate, jours: number): ISODate {
  const dt = DateTime.fromISO(date, { zone: 'utc' }).plus({ days: jours })
  return composerDate(dt.year, dt.month, dt.day)
}

/**
 * Nombre de jours entre deux dates calendaires. Le calcul se fait en UTC, où un
 * jour dure exactement 24 h : compter des jours n'a pas à connaître les
 * changements d'heure, contrairement à compter des durées.
 */
export function joursEntreDates(debut: ISODate, fin: ISODate): number {
  const a = DateTime.fromISO(debut, { zone: 'utc' }).toMillis()
  const b = DateTime.fromISO(fin, { zone: 'utc' }).toMillis()
  return (b - a) / MILLIS.PAR_JOUR
}

/** 1 = lundi … 7 = dimanche, sur une date calendaire. */
export function jourDeSemaine(date: ISODate): number {
  return DateTime.fromISO(date, { zone: 'utc' }).weekday
}

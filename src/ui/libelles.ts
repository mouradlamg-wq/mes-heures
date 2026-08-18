import { DateTime } from 'luxon'
import type { ISODate, TypeAbsence, TypeSegment } from '../engine'

/**
 * Libellés d'affichage. Aucune arithmétique métier ici : uniquement de la mise
 * en mots (CLAUDE.md §4).
 */

export function libelleType(type: TypeSegment): string {
  switch (type) {
    case 'conduite':
      return 'Conduite'
    case 'autre_travail':
      return 'Autre travail'
    case 'disponibilite':
      return 'Disponibilité'
    case 'coupure':
      return 'Coupure'
  }
}

/** `mar. 17 mars`, dans la zone de référence. */
export function libelleDate(date: ISODate, zone: string): string {
  return DateTime.fromISO(date, { zone }).setLocale('fr').toFormat('ccc d LLLL')
}

/** `Mar 17` — colonne « Jour » du tableau de période. */
export function libelleJourCourt(date: ISODate): string {
  const jour = DateTime.fromISO(date, { zone: 'utc' }).setLocale('fr')
  return `${majuscule(jour.toFormat('ccc').replace('.', ''))} ${jour.toFormat('dd')}`
}

/**
 * `26 févr. → 25 mars` — les bornes viennent des réglages, jamais d'un mois
 * déduit (DESIGN §9).
 */
export function libellePeriode(debut: ISODate, fin: ISODate): string {
  const format = (date: ISODate): string =>
    DateTime.fromISO(date, { zone: 'utc' }).setLocale('fr').toFormat('d LLL').replace('.', '.')
  return `${format(debut)} → ${format(fin)}`
}

export function libelleAbsence(type: TypeAbsence): string {
  switch (type) {
    case 'CP':
      return 'Congé payé'
    case 'RTT':
      return 'RTT'
    case 'MALADIE':
      return 'Maladie'
    case 'AT':
      return 'Accident du travail'
    case 'RECUP':
      return 'Récupération'
    case 'FORMATION':
      return 'Formation'
    case 'SANS_SOLDE':
      return 'Sans solde'
    case 'REPOS':
      return 'Repos'
  }
}

function majuscule(mot: string): string {
  return mot.charAt(0).toUpperCase() + mot.slice(1)
}

import { DateTime } from 'luxon'
import type { ISODate, TypeSegment } from '../engine'

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

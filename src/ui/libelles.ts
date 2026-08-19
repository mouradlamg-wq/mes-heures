import { DateTime } from 'luxon'
import type { IndemniteConfig, ISODate, TypeAbsence, TypeSegment } from '../engine'

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

/**
 * `du 1 août au 31 août 2026` — pour un document imprimé, remis à quelqu'un.
 * Une date ISO brute y serait illisible.
 */
export function libelleIntervalleLong(debut: ISODate, fin: ISODate): string {
  const d = DateTime.fromISO(debut, { zone: 'utc' }).setLocale('fr')
  const f = DateTime.fromISO(fin, { zone: 'utc' }).setLocale('fr')
  return `du ${d.toFormat('d LLLL')} au ${f.toFormat('d LLLL yyyy')}`
}

export function libelleDeclencheur(declencheur: IndemniteConfig['declencheur']): string {
  switch (declencheur) {
    case 'plage_horaire':
      return 'Sur une plage horaire'
    case 'decouche':
      return 'Quand je découche'
    case 'duree_service':
      return 'Selon l’amplitude'
    case 'quantite_manuelle':
      return 'Que je saisis moi-même'
  }
}

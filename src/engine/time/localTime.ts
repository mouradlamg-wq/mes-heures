import { DateTime } from 'luxon'
import type { HeureHorloge, ISODate, ISODateTime, LocalTimeResolution } from './types'
import { MILLIS, offsetA, trouverTransition, zoneValide } from './zone'

const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const RE_HEURE = /^(\d{2}):(\d{2})$/

/**
 * `date + HH:mm → instant`, dans la zone de référence des réglages.
 *
 * L'algorithme n'interroge pas Luxon sur « quelle est la bonne réponse » : il
 * énumère les offsets plausibles autour de l'heure murale demandée et garde ceux
 * qui sont cohérents avec eux-mêmes. Zéro candidat = l'heure n'existe pas ; deux
 * candidats = elle existe deux fois. C'est la seule façon de distinguer les deux
 * cas sans se faire corriger silencieusement par la bibliothèque.
 */
export function parseHeureLocale(
  date: ISODate,
  heure: HeureHorloge,
  nomZone: string,
): LocalTimeResolution {
  if (!zoneValide(nomZone)) {
    return {
      status: 'invalid',
      reason: `Le fuseau horaire « ${nomZone} » est inconnu. Vérifie le réglage « fuseau de référence ».`,
    }
  }

  const dateAnalysee = analyserDate(date)
  if (dateAnalysee === undefined) {
    return {
      status: 'invalid',
      reason: `La date « ${date} » n'existe pas. Attendu : une date réelle au format AAAA-MM-JJ.`,
    }
  }

  const heureAnalysee = analyserHeure(heure)
  if (heureAnalysee === undefined) {
    return {
      status: 'invalid',
      reason: `L'heure « ${heure} » ne se lit pas. Attendu : deux chiffres, deux points, deux chiffres, par exemple 06:15.`,
    }
  }

  const { annee, mois, jour } = dateAnalysee
  const { heures, minutes: mn } = heureAnalysee

  // Heure murale interprétée comme si elle était en UTC : c'est le repère à
  // partir duquel on retranche chaque offset candidat.
  const murale = Date.UTC(annee, mois - 1, jour, heures, mn)

  const offsetAvant = offsetA(nomZone, murale - MILLIS.PAR_JOUR - MILLIS.PAR_HEURE * 12)
  const offsetApres = offsetA(nomZone, murale + MILLIS.PAR_JOUR + MILLIS.PAR_HEURE * 12)
  const candidats = offsetAvant === offsetApres ? [offsetAvant] : [offsetAvant, offsetApres]

  const instants = candidats
    .map((offset) => murale - offset * MILLIS.PAR_MINUTE)
    .filter((instant, index) => offsetA(nomZone, instant) === candidats[index])
    .sort((a, b) => a - b)

  if (instants.length === 0) {
    return { status: 'invalid', reason: messageHeureInexistante(nomZone, murale, heure) }
  }

  if (instants.length === 1) {
    return { status: 'ok', instant: formatInstant(instants[0]!, nomZone) }
  }

  return {
    status: 'ambiguous',
    choices: instants.map((instant) => formatInstant(instant, nomZone)),
  }
}

/**
 * « cette heure n'existe pas cette nuit-là, les horloges passent de 02:00 à
 * 03:00 » — les deux heures sont calculées, pas écrites en dur : elles
 * dépendent de la zone.
 */
function messageHeureInexistante(nomZone: string, murale: number, heure: HeureHorloge): string {
  const transition = trouverTransition(nomZone, murale)
  if (transition === undefined) {
    return `L'heure ${heure} n'existe pas ce jour-là dans le fuseau ${nomZone}.`
  }
  const offsetAvant = offsetA(nomZone, transition - MILLIS.PAR_MINUTE)
  const offsetApres = offsetA(nomZone, transition)
  const avant = heureMurale(transition, offsetAvant)
  const apres = heureMurale(transition, offsetApres)
  return `L'heure ${heure} n'existe pas cette nuit-là : les horloges passent de ${avant} à ${apres}.`
}

function heureMurale(instantMillis: number, offsetMinutes: number): string {
  const decale = new Date(instantMillis + offsetMinutes * MILLIS.PAR_MINUTE)
  const h = String(decale.getUTCHours()).padStart(2, '0')
  const m = String(decale.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function analyserDate(date: ISODate): { annee: number; mois: number; jour: number } | undefined {
  const trouve = RE_DATE.exec(date)
  if (trouve === null) {
    return undefined
  }
  const annee = Number(trouve[1])
  const mois = Number(trouve[2])
  const jour = Number(trouve[3])
  // Le 30 février se lit très bien à la regex : c'est le calendrier qui le refuse.
  const controle = new Date(Date.UTC(annee, mois - 1, jour))
  if (
    controle.getUTCFullYear() !== annee ||
    controle.getUTCMonth() !== mois - 1 ||
    controle.getUTCDate() !== jour
  ) {
    return undefined
  }
  return { annee, mois, jour }
}

function analyserHeure(heure: HeureHorloge): { heures: number; minutes: number } | undefined {
  const trouve = RE_HEURE.exec(heure)
  if (trouve === null) {
    return undefined
  }
  const heures = Number(trouve[1])
  const minutes = Number(trouve[2])
  if (heures > 23 || minutes > 59) {
    return undefined
  }
  return { heures, minutes }
}

/**
 * Contrôle de la seule **forme** d'une heure d'horloge, sans date ni fuseau.
 * Sert à la saisie : le champ doit pouvoir refuser `25:00` immédiatement, avant
 * même de savoir sur quelle journée l'heure tombe.
 *
 * Le refus est une phrase française, affichable telle quelle. Jamais de
 * correction silencieuse (SPEC §5).
 */
export function validerHeureHorloge(
  heure: HeureHorloge,
): { readonly status: 'ok' } | { readonly status: 'invalid'; readonly reason: string } {
  const trouve = RE_HEURE.exec(heure)
  if (trouve === null) {
    return {
      status: 'invalid',
      reason: "Attendu : deux chiffres, deux points, deux chiffres, par exemple 06:15.",
    }
  }
  if (Number(trouve[1]) > 23) {
    return {
      status: 'invalid',
      reason: "Il n'y a pas d'heure au-delà de 23. Minuit s'écrit 00:00.",
    }
  }
  if (Number(trouve[2]) > 59) {
    return { status: 'invalid', reason: "Il n'y a pas de minute au-delà de 59." }
  }
  return { status: 'ok' }
}

export function formatInstant(instantMillis: number, nomZone: string): ISODateTime {
  const iso = DateTime.fromMillis(instantMillis, { zone: nomZone }).toISO({
    suppressMilliseconds: true,
  })
  /* c8 ignore next 3 — un instant fini dans une zone valide produit toujours un ISO. */
  if (iso === null) {
    throw new Error(`Instant non représentable : ${String(instantMillis)} dans ${nomZone}`)
  }
  return iso
}

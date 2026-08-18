import {
  minutes,
  parseHeureLocale,
  type ISODate,
  type ISODateTime,
  type QualificationManuelle,
  type Segment,
  type Settings,
  type TypeSegment,
  type WorkDay,
} from '../../src/engine'

/**
 * Builders de fixtures (CLAUDE.md §13). Le moteur se teste avec des journées
 * construites, pas avec des littéraux ISO copiés-collés : une constante
 * `'2027-03-16T06:00:00+01:00'` recopiée quinze fois finit par mentir sur son
 * offset le jour du changement d'heure.
 */

export const PARIS = 'Europe/Paris'

/** `'2027-03-16' 06:00` → instant. Refuse toute heure ambiguë ou inexistante. */
export function instant(date: ISODate, heure: string, zone: string = PARIS): ISODateTime {
  const resolution = parseHeureLocale(date, heure, zone)
  if (resolution.status !== 'ok') {
    throw new Error(
      `Fixture invalide : ${date} ${heure} en ${zone} donne « ${resolution.status} ». ` +
        "Utilise instantAmbigu() si c'est voulu.",
    )
  }
  return resolution.instant
}

/** Choix explicite pour une heure qui existe deux fois. `0` = avant le changement. */
export function instantAmbigu(
  date: ISODate,
  heure: string,
  choix: 0 | 1,
  zone: string = PARIS,
): ISODateTime {
  const resolution = parseHeureLocale(date, heure, zone)
  if (resolution.status !== 'ambiguous') {
    throw new Error(`Fixture : ${date} ${heure} n'est pas ambiguë (${resolution.status}).`)
  }
  return resolution.choices[choix]!
}

let compteur = 0
function identifiant(prefixe: string): string {
  compteur += 1
  return `${prefixe}-${String(compteur).padStart(4, '0')}`
}

export function reinitialiserCompteur(): void {
  compteur = 0
}

export type SegmentBrut = {
  readonly type: TypeSegment
  /** `HH:mm` sur la date de rattachement, ou `+1 HH:mm` pour le lendemain. */
  readonly de?: string
  readonly a?: string
  readonly id?: string
}

/**
 * `'06:00'` → le jour de rattachement. `'+1 02:30'` → le lendemain : c'est
 * ainsi qu'on écrit une journée de service qui passe minuit.
 */
function resoudre(
  date: ISODate,
  expression: string | undefined,
  zone: string,
): ISODateTime | undefined {
  if (expression === undefined) {
    return undefined
  }
  const trouve = /^(?:\+(\d+)\s+)?(\d{2}:\d{2})$/.exec(expression)
  if (trouve === null) {
    throw new Error(`Fixture : « ${expression} » n'est pas une heure. Attendu « 06:00 » ou « +1 02:30 ».`)
  }
  const jours = Number(trouve[1] ?? '0')
  const [annee, mois, jour] = date.split('-').map(Number) as [number, number, number]
  const decale = new Date(Date.UTC(annee, mois - 1, jour + jours))
  const dateCible = `${String(decale.getUTCFullYear()).padStart(4, '0')}-${String(decale.getUTCMonth() + 1).padStart(2, '0')}-${String(decale.getUTCDate()).padStart(2, '0')}`
  return instant(dateCible, trouve[2]!, zone)
}

export type JourBrut = {
  readonly date: ISODate
  readonly prise?: string
  readonly fin?: string
  readonly segments?: readonly SegmentBrut[]
  readonly decouche?: boolean
  readonly id?: string
  readonly zone?: string
}

export function aWorkDay(brut: JourBrut): WorkDay {
  const zone = brut.zone ?? PARIS
  const segments: Segment[] = (brut.segments ?? []).map((s) => {
    const debut = resoudre(brut.date, s.de, zone)
    const fin = resoudre(brut.date, s.a, zone)
    return {
      id: s.id ?? identifiant('seg'),
      type: s.type,
      ...(debut === undefined ? {} : { debut }),
      ...(fin === undefined ? {} : { fin }),
    }
  })

  const prise = resoudre(brut.date, brut.prise, zone)
  const fin = resoudre(brut.date, brut.fin, zone)

  return {
    id: brut.id ?? identifiant('jour'),
    dateRattachement: brut.date,
    segments,
    ...(prise === undefined ? {} : { priseService: prise }),
    ...(fin === undefined ? {} : { finService: fin }),
    ...(brut.decouche === undefined ? {} : { decouche: brut.decouche }),
  }
}

export function aQualificationManuelle(
  jour: WorkDay,
  de: string,
  a: string,
  type: TypeSegment,
  zone: string = PARIS,
): QualificationManuelle {
  return {
    id: identifiant('qual'),
    dayId: jour.id,
    debut: resoudre(jour.dateRattachement, de, zone)!,
    fin: resoudre(jour.dateRattachement, a, zone)!,
    type,
  }
}

/**
 * Réglages **vides** par défaut : seul `timeZoneReference` est renseigné, comme
 * l'impose le SPEC §9. Chaque test ajoute exactement les réglages dont il a
 * besoin — c'est ce qui rend visible qu'un calcul dépend d'un réglage.
 */
export function desSettings(partiels: Partial<Settings> = {}): Settings {
  return {
    timeZoneReference: PARIS,
    indemnites: [],
    ...partiels,
  }
}

export const mn = minutes

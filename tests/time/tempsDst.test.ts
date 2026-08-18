import { describe, expect, it } from 'vitest'
import {
  comparerInstants,
  decalerDate,
  dureeEntre,
  jourDeSemaine,
  jourDeService,
  joursEntreDates,
  lireInstant,
  memeInstant,
  parseHeureLocale,
} from '../../src/engine'
import { zoneDuProcessus } from '../../vitest.setup'

const PARIS = 'Europe/Paris'

/**
 * Repères 2027 pour Europe/Paris :
 * — avance des horloges : dimanche 28 mars, 02:00 → 03:00 ;
 * — recul des horloges : dimanche 31 octobre, 03:00 → 02:00.
 */
const AVANCE = '2027-03-28'
const RECUL = '2027-10-31'

function instantOk(date: string, heure: string, zone = PARIS): string {
  const r = parseHeureLocale(date, heure, zone)
  if (r.status !== 'ok') {
    throw new Error(`Attendu ok pour ${date} ${heure}, reçu ${r.status}`)
  }
  return r.instant
}

describe('TPS — temps, fuseau, DST, journée de service', () => {
  it('le processus de test ne tourne pas dans la zone de référence', () => {
    // Sans ça, une fuite de fuseau dans le moteur passerait inaperçue.
    expect(zoneDuProcessus).not.toBe(PARIS)
  })

  it('TPS-01 — un jour ordinaire se résout sans ambiguïté', () => {
    const r = parseHeureLocale('2027-03-16', '08:00', PARIS)
    expect(r).toEqual({ status: 'ok', instant: '2027-03-16T08:00:00+01:00' })
  })

  it('TPS-02 — le résultat ne dépend pas du fuseau du navigateur', () => {
    // Le processus tourne sous America/New_York (vitest.setup.ts) : si la zone
    // fuyait, l'offset produit serait −04:00.
    expect(instantOk('2027-03-16', '08:00')).toBe('2027-03-16T08:00:00+01:00')
    expect(instantOk('2027-07-14', '08:00')).toBe('2027-07-14T08:00:00+02:00')
  })

  it('TPS-03 — heure ambiguë : deux choix, du plus tôt au plus tard', () => {
    const r = parseHeureLocale(RECUL, '02:30', PARIS)
    expect(r.status).toBe('ambiguous')
    if (r.status !== 'ambiguous') return

    expect(r.choices).toEqual([
      '2027-10-31T02:30:00+02:00',
      '2027-10-31T02:30:00+01:00',
    ])
    // « avant le changement d'heure » = le premier, l'instant le plus tôt.
    expect(comparerInstants(r.choices[0]!, r.choices[1]!)).toBeLessThan(0)
  })

  it('TPS-04 — heure inexistante : refus explicite, aucun instant produit', () => {
    const r = parseHeureLocale(AVANCE, '02:30', PARIS)
    expect(r.status).toBe('invalid')
    if (r.status !== 'invalid') return

    expect(r.reason).toContain("n'existe pas")
    expect(r.reason).toContain('02:00')
    expect(r.reason).toContain('03:00')
    expect(r).not.toHaveProperty('instant')
  })

  it('TPS-05 — 03:00, première heure existante après le saut', () => {
    expect(instantOk(AVANCE, '03:00')).toBe('2027-03-28T03:00:00+02:00')
  })

  it('TPS-06 — bornes de la plage ambiguë', () => {
    expect(parseHeureLocale(RECUL, '02:00', PARIS).status).toBe('ambiguous')
    expect(parseHeureLocale(RECUL, '02:59', PARIS).status).toBe('ambiguous')
    expect(parseHeureLocale(RECUL, '03:00', PARIS).status).toBe('ok')
    expect(parseHeureLocale(RECUL, '01:59', PARIS).status).toBe('ok')
  })

  it('TPS-07 — heure syntaxiquement invalide, jamais de correction', () => {
    for (const heure of ['25:00', '08:60', '8h', '', '8:00', '08:0', '0800']) {
      const r = parseHeureLocale('2027-03-16', heure, PARIS)
      expect(r.status, heure).toBe('invalid')
    }
  })

  it('TPS-08 — date inexistante', () => {
    expect(parseHeureLocale('2027-02-30', '08:00', PARIS).status).toBe('invalid')
    expect(parseHeureLocale('2027-13-01', '08:00', PARIS).status).toBe('invalid')
    expect(parseHeureLocale('16/03/2027', '08:00', PARIS).status).toBe('invalid')
    // 2028 est bissextile, 2027 ne l'est pas.
    expect(parseHeureLocale('2027-02-29', '08:00', PARIS).status).toBe('invalid')
    expect(parseHeureLocale('2028-02-29', '08:00', PARIS).status).toBe('ok')
  })

  it('TPS-09 — fuseau de référence inconnu', () => {
    const r = parseHeureLocale('2027-03-16', '08:00', 'Europe/Atlantide')
    expect(r.status).toBe('invalid')
    if (r.status !== 'invalid') return
    expect(r.reason).toContain('Europe/Atlantide')
  })

  it('TPS-10 — durée encadrant l’avance des horloges : l’heure sautée n’est pas comptée', () => {
    const debut = instantOk('2027-03-27', '22:00')
    const fin = instantOk(AVANCE, '06:00')
    // 22:00 → 06:00 fait 8 h au cadran, mais la nuit ne dure que 7 h.
    expect(dureeEntre(debut, fin)).toBe(7 * 60)
  })

  it('TPS-11 — durée encadrant le recul des horloges : l’heure doublée est comptée', () => {
    const debut = instantOk('2027-10-30', '22:00')
    const fin = instantOk(RECUL, '06:00')
    expect(dureeEntre(debut, fin)).toBe(9 * 60)
  })

  it('TPS-12 — journée de service lundi 22:00 → mardi 06:00', () => {
    const prise = instantOk('2027-03-15', '22:00')
    const fin = instantOk('2027-03-16', '06:00')

    expect(dureeEntre(prise, fin)).toBe(8 * 60)
    expect(jourDeService(prise, PARIS)).toBe('2027-03-15')
    // La journée est rattachée au lundi, alors qu'elle finit un mardi.
    expect(jourDeService(fin, PARIS)).toBe('2027-03-16')
  })

  it('TPS-13 — journée entièrement dans un jour calendaire', () => {
    const prise = instantOk('2027-03-16', '06:00')
    const fin = instantOk('2027-03-16', '14:00')
    expect(dureeEntre(prise, fin)).toBe(8 * 60)
    expect(jourDeService(prise, PARIS)).toBe(jourDeService(fin, PARIS))
  })

  it('TPS-14 — 00:00 → 08:00 le jour de l’avance : 7 h, pas 8', () => {
    expect(dureeEntre(instantOk(AVANCE, '00:00'), instantOk(AVANCE, '08:00'))).toBe(7 * 60)
  })

  it('TPS-15 — 00:00 → 08:00 le jour du recul : 9 h, pas 8', () => {
    expect(dureeEntre(instantOk(RECUL, '00:00'), instantOk(RECUL, '08:00'))).toBe(9 * 60)
  })

  it('TPS-16 — aller-retour instant → ISO → instant, offset conservé', () => {
    for (const iso of [
      '2027-03-16T08:00:00+01:00',
      '2027-07-14T08:00:00+02:00',
      '2027-10-31T02:30:00+02:00',
      '2027-10-31T02:30:00+01:00',
    ]) {
      const lecture = lireInstant(iso)
      expect(lecture.status, iso).toBe('ok')
      if (lecture.status !== 'ok') continue
      // Deux lectures successives donnent le même instant absolu.
      expect(lireInstant(iso)).toEqual(lecture)
    }
  })

  it('TPS-17 — un ISO sans offset est refusé, jamais interprété localement', () => {
    for (const iso of [
      '2027-03-16T08:00:00',
      '2027-03-16T08:00',
      '2027-03-16',
      '1774000000000',
      '',
    ]) {
      const r = lireInstant(iso)
      expect(r.status, iso).toBe('invalid')
    }
    // Les secondes non nulles sont refusées : la saisie est à la minute.
    expect(lireInstant('2027-03-16T08:00:30+01:00').status).toBe('invalid')
    expect(lireInstant('2027-03-16T08:00:00+01:00').status).toBe('ok')
    expect(lireInstant('2027-03-16T07:00:00Z').status).toBe('ok')
  })

  it('TPS-18 — une fin antérieure à la prise ne produit pas d’amplitude négative', () => {
    const prise = instantOk('2027-03-16', '14:00')
    const fin = instantOk('2027-03-16', '06:00')
    // Au niveau des primitives c'est un bug de programmation : la qualification
    // (phase 2) est chargée de le signaler proprement à l'utilisateur.
    expect(() => dureeEntre(prise, fin)).toThrow(RangeError)
  })

  it('TPS-19 — une journée annulée sur place : amplitude 0, cas légitime', () => {
    const instant = instantOk('2027-03-16', '06:00')
    expect(dureeEntre(instant, instant)).toBe(0)
  })

  it('TPS-20 — deux écritures du même instant sont égales', () => {
    expect(memeInstant('2027-07-14T12:00:00+02:00', '2027-07-14T10:00:00Z')).toBe(true)
    expect(memeInstant('2027-07-14T12:00:00+02:00', '2027-07-14T12:00:00+01:00')).toBe(false)
    expect(comparerInstants('2027-07-14T12:00:00+02:00', '2027-07-14T10:00:00Z')).toBe(0)
  })

  it('TPS-21 — un instant à 00:00 pile appartient au jour qui commence', () => {
    expect(jourDeService(instantOk('2027-03-16', '00:00'), PARIS)).toBe('2027-03-16')
    expect(jourDeService(instantOk('2027-03-15', '23:59'), PARIS)).toBe('2027-03-15')
  })

  it('TPS-22 — une zone sans changement d’heure ne produit ni ambiguïté ni refus', () => {
    const reunion = 'Indian/Reunion'
    expect(parseHeureLocale(AVANCE, '02:30', reunion)).toEqual({
      status: 'ok',
      instant: '2027-03-28T02:30:00+04:00',
    })
    expect(parseHeureLocale(RECUL, '02:30', reunion).status).toBe('ok')
  })

  it('dates calendaires — décalage, écart et jour de semaine', () => {
    expect(decalerDate('2027-03-31', 1)).toBe('2027-04-01')
    expect(decalerDate('2027-01-01', -1)).toBe('2026-12-31')
    // Une date se décale en jours, même quand la nuit ne dure pas 24 h.
    expect(decalerDate(AVANCE, 1)).toBe('2027-03-29')
    expect(joursEntreDates('2027-01-29', '2027-02-04')).toBe(6)
    expect(jourDeSemaine('2027-03-15')).toBe(1)
    expect(jourDeSemaine('2027-03-21')).toBe(7)
  })
})

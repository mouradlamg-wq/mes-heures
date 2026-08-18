import { beforeEach, describe, expect, it } from 'vitest'
import {
  CODES_QUALIFICATION,
  heureMuraleDe,
  qualifierJournee,
  TYPES_SEGMENT,
  type JourneeQualifiee,
} from '../../src/engine'
import {
  aQualificationManuelle,
  aWorkDay,
  PARIS,
  reinitialiserCompteur,
} from '../fixtures/builders'

const LUNDI = '2027-03-15'
/** Dimanche 31 octobre 2027 : les horloges reculent de 03:00 à 02:00. */
const RECUL = '2027-10-31'

function plages(journee: JourneeQualifiee): string[] {
  return journee.zones.map(
    (z) =>
      `${heureMuraleDe(z.debut, PARIS)}–${heureMuraleDe(z.fin, PARIS)} ${z.type} ${String(z.duree)}`,
  )
}

function plagesIndeterminees(journee: JourneeQualifiee): string[] {
  return journee.zonesIndeterminees.map(
    (z) => `${heureMuraleDe(z.debut, PARIS)}–${heureMuraleDe(z.fin, PARIS)} ${z.cause}`,
  )
}

beforeEach(reinitialiserCompteur)

describe('QUA — chevauchements, trous, range', () => {
  it('QUA-01 — journée nominale : complete, aucune zone non qualifiée', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '10:00' },
        { type: 'coupure', de: '10:00', a: '11:00' },
        { type: 'conduite', de: '11:00', a: '14:00' },
      ],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(q.complete).toBe(true)
    expect(q.zonesIndeterminees).toEqual([])
    expect(q.tempsIndetermine).toBe(0)
    expect(q.amplitude.status).toBe('complete')
    expect(q.amplitude.value).toBe(8 * 60)
    expect(q.dureeParType.conduite.status).toBe('complete')
    expect(q.dureeParType.conduite.value).toBe(7 * 60)
    expect(q.dureeParType.coupure.value).toBe(60)
    expect(q.dureeParType.disponibilite.value).toBe(0)
  })

  it('QUA-02 — chevauchement de types identiques : fusion, 3 h et non 4', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '08:00',
      fin: '11:00',
      segments: [
        { type: 'conduite', de: '08:00', a: '10:00' },
        { type: 'conduite', de: '09:00', a: '11:00' },
      ],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(plages(q)).toEqual(['08:00–11:00 conduite 180'])
    expect(q.dureeParType.conduite.value).toBe(180)
    expect(q.zonesIndeterminees).toEqual([])
  })

  it('QUA-03 — segments adjacents de même type : un seul intervalle', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '08:00',
      fin: '11:00',
      segments: [
        { type: 'conduite', de: '08:00', a: '10:00' },
        { type: 'conduite', de: '10:00', a: '11:00' },
      ],
    })

    expect(plages(qualifierJournee(jour, PARIS))).toEqual(['08:00–11:00 conduite 180'])
  })

  it('QUA-04 — chevauchement de types différents : partial, aucun arbitrage', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '08:00',
      fin: '11:00',
      segments: [
        { type: 'conduite', de: '08:00', a: '10:00' },
        { type: 'disponibilite', de: '09:00', a: '11:00' },
      ],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(plages(q)).toEqual([
      '08:00–09:00 conduite 60',
      '10:00–11:00 disponibilite 60',
    ])
    expect(q.zonesIndeterminees).toHaveLength(1)
    expect(q.zonesIndeterminees[0]).toMatchObject({
      cause: 'chevauchement',
      duree: 60,
      typesEnConflit: ['conduite', 'disponibilite'],
    })

    // Ni la conduite ni la disponibilité ne s'attribue l'heure disputée.
    expect(q.dureeParType.conduite.status).toBe('partial')
    expect(q.dureeParType.conduite.range).toEqual({ min: 60, max: 120 })
    expect(q.dureeParType.disponibilite.range).toEqual({ min: 60, max: 120 })
    expect(q.complete).toBe(false)
  })

  it('QUA-05 — trois types sur la même minute : une zone, les trois cités', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '08:00',
      fin: '12:00',
      segments: [
        { type: 'conduite', de: '08:00', a: '10:00' },
        { type: 'disponibilite', de: '09:00', a: '11:00' },
        { type: 'autre_travail', de: '09:00', a: '10:00' },
      ],
    })

    const q = qualifierJournee(jour, PARIS)
    const chevauchements = q.zonesIndeterminees.filter((z) => z.cause === 'chevauchement')

    expect(chevauchements).toHaveLength(1)
    expect(chevauchements[0]?.typesEnConflit).toEqual([
      'autre_travail',
      'conduite',
      'disponibilite',
    ])
  })

  it('QUA-06 — inclusion d’un type dans un autre : seule l’intersection est perdue', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '08:00',
      fin: '12:00',
      segments: [
        { type: 'conduite', de: '08:00', a: '12:00' },
        { type: 'coupure', de: '09:00', a: '10:00' },
      ],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(plages(q)).toEqual(['08:00–09:00 conduite 60', '10:00–12:00 conduite 120'])
    expect(q.zonesIndeterminees).toHaveLength(1)
    expect(q.zonesIndeterminees[0]?.duree).toBe(60)
    expect(q.dureeParType.conduite.range).toEqual({ min: 180, max: 240 })
  })

  it('QUA-07 — trou non qualifié : 8 h certaines, range 8 h → 12 h', () => {
    // L'exemple du SPEC §6, au chiffre près.
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '18:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '10:00' },
        { type: 'conduite', de: '14:00', a: '18:00' },
      ],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(q.tempsIndetermine).toBe(4 * 60)
    expect(plagesIndeterminees(q)).toEqual(['10:00–14:00 trou'])
    expect(q.dureeParType.conduite.status).toBe('partial')
    expect(q.dureeParType.conduite.range).toEqual({ min: 8 * 60, max: 12 * 60 })

    const cause = q.warnings.find((w) => w.code === CODES_QUALIFICATION.ZONE_NON_QUALIFIEE)
    expect(cause?.message).toContain('10:00 → 14:00')
    expect(cause?.message).toContain('Coupure, disponibilité ou autre travail')
  })

  it('QUA-08 — trou en début de journée, signalé et non inventé', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '12:00',
      segments: [{ type: 'conduite', de: '07:00', a: '12:00' }],
    })

    expect(plagesIndeterminees(qualifierJournee(jour, PARIS))).toEqual(['06:00–07:00 trou'])
  })

  it('QUA-09 — trou en fin de journée', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '18:00',
      segments: [{ type: 'conduite', de: '06:00', a: '17:00' }],
    })

    expect(plagesIndeterminees(qualifierJournee(jour, PARIS))).toEqual(['17:00–18:00 trou'])
  })

  it('QUA-10 — journée sans fin de service : borne haute ouverte, signalée', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      segments: [{ type: 'conduite', de: '06:00', a: '10:00' }],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(q.complete).toBe(false)
    expect(q.amplitude.status).toBe('unknown')
    expect(q.warnings.map((w) => w.code)).toContain(CODES_QUALIFICATION.FIN_ABSENTE)
    expect(q.warnings.find((w) => w.code === CODES_QUALIFICATION.FIN_ABSENTE)?.message).toContain(
      'ouverte',
    )

    // Aucune durée n'est certaine : sans fin de service, la borne haute n'existe
    // pas. Répondre « 0 h 00 » affirmerait qu'il ne s'est rien passé.
    for (const type of TYPES_SEGMENT) {
      expect(q.dureeParType[type].status, type).toBe('unknown')
      expect(q.dureeParType[type].value, type).toBeUndefined()
    }
    expect(q.dureeParType.conduite.warnings.at(-1)?.message).toContain('amplitude')
  })

  it('QUA-10 — une journée ouverte ne déclare pas zéro heure de conduite', () => {
    // Le cas qui a échappé au premier jet : prise saisie, aucun segment, aucune
    // fin. Le moteur répondait « 0 h 00 certaines » sur les quatre types.
    const ouverte = aWorkDay({ date: LUNDI, prise: '06:00' })
    const close = aWorkDay({ date: LUNDI, prise: '06:00', fin: '06:00' })

    expect(qualifierJournee(ouverte, PARIS).dureeParType.conduite.status).toBe('unknown')
    // La même journée close à la même minute, elle, vaut bien zéro.
    expect(qualifierJournee(close, PARIS).dureeParType.conduite.value).toBe(0)
  })

  it('QUA-11 — journée sans prise de service : borne basse ouverte', () => {
    const jour = aWorkDay({
      date: LUNDI,
      fin: '18:00',
      segments: [{ type: 'conduite', de: '14:00', a: '18:00' }],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(q.complete).toBe(false)
    expect(q.amplitude.status).toBe('unknown')
    expect(q.warnings.map((w) => w.code)).toContain(CODES_QUALIFICATION.PRISE_ABSENTE)
  })

  it('QUA-12 — prise et fin sans aucun segment : amplitude connue, contenu inconnu', () => {
    const jour = aWorkDay({ date: LUNDI, prise: '06:00', fin: '14:00' })

    const q = qualifierJournee(jour, PARIS)

    expect(q.amplitude.status).toBe('complete')
    expect(q.amplitude.value).toBe(8 * 60)
    expect(q.tempsIndetermine).toBe(8 * 60)
    expect(q.dureeParType.conduite.range).toEqual({ min: 0, max: 8 * 60 })
  })

  it('QUA-13 — journée entièrement vide : unknown, rien à borner', () => {
    const jour = aWorkDay({ date: LUNDI })

    const q = qualifierJournee(jour, PARIS)

    expect(q.dureeParType.conduite.status).toBe('unknown')
    expect(q.warnings.map((w) => w.code)).toContain(CODES_QUALIFICATION.JOURNEE_VIDE)
    expect(q.complete).toBe(false)
  })

  it('QUA-14 — segment sans fin : durée non devinée, journée non complète', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [{ type: 'conduite', de: '06:00' }],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(q.warnings.map((w) => w.code)).toContain(CODES_QUALIFICATION.SEGMENT_OUVERT)
    expect(q.complete).toBe(false)
    // Le segment ouvert n'est pas compté : toute l'amplitude devient un trou.
    expect(q.dureeParType.conduite.range).toEqual({ min: 0, max: 8 * 60 })
  })

  it('QUA-15 — segment sans aucune borne : signalé, jamais compté à zéro en silence', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '14:00' },
        { type: 'coupure' },
      ],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(q.warnings.map((w) => w.code)).toContain(CODES_QUALIFICATION.SEGMENT_SANS_BORNE)
    expect(q.complete).toBe(false)
  })

  it('QUA-16 — segment débordant de l’amplitude : compté et signalé, jamais rogné', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [{ type: 'conduite', de: '05:00', a: '14:00' }],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(q.dureeParType.conduite.value).toBe(9 * 60)
    expect(q.zones[0]?.horsAmplitude).toBe(true)
    expect(q.warnings.map((w) => w.code)).toContain(
      CODES_QUALIFICATION.SEGMENT_HORS_AMPLITUDE,
    )
  })

  it('QUA-17 — qualification manuelle : bascule en complete, le range disparaît', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '18:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '10:00' },
        { type: 'conduite', de: '14:00', a: '18:00' },
      ],
    })

    const avant = qualifierJournee(jour, PARIS)
    expect(avant.dureeParType.conduite.status).toBe('partial')

    const apres = qualifierJournee(jour, PARIS, [
      aQualificationManuelle(jour, '10:00', '14:00', 'coupure'),
    ])

    expect(apres.zonesIndeterminees).toEqual([])
    expect(apres.tempsIndetermine).toBe(0)
    expect(apres.dureeParType.conduite.status).toBe('complete')
    expect(apres.dureeParType.conduite.value).toBe(8 * 60)
    expect(apres.dureeParType.conduite.range).toBeUndefined()
    expect(apres.dureeParType.coupure.value).toBe(4 * 60)
    expect(apres.complete).toBe(true)
  })

  it('QUA-18 — qualification partielle d’une zone : reste partial, range resserré', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '18:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '10:00' },
        { type: 'conduite', de: '14:00', a: '18:00' },
      ],
    })

    const q = qualifierJournee(jour, PARIS, [
      aQualificationManuelle(jour, '10:00', '12:00', 'coupure'),
    ])

    expect(q.tempsIndetermine).toBe(2 * 60)
    expect(q.dureeParType.conduite.status).toBe('partial')
    expect(q.dureeParType.conduite.range).toEqual({ min: 8 * 60, max: 10 * 60 })
  })

  it('QUA-19 — journée à cheval sur minuit : le trou est situé sur la journée de service', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '22:00',
      fin: '+1 08:00',
      segments: [
        { type: 'conduite', de: '22:00', a: '+1 01:00' },
        { type: 'conduite', de: '+1 03:00', a: '+1 08:00' },
      ],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(q.amplitude.value).toBe(10 * 60)
    expect(plagesIndeterminees(q)).toEqual(['01:00–03:00 trou'])
    expect(q.dateRattachement).toBe(LUNDI)
  })

  it('QUA-20 — segment de durée nulle : accepté, n’ouvre aucun trou', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '14:00' },
        { type: 'coupure', de: '10:00', a: '10:00' },
      ],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(q.zonesIndeterminees).toEqual([])
    expect(q.dureeParType.conduite.value).toBe(8 * 60)
    expect(q.dureeParType.coupure.value).toBe(0)
    expect(q.complete).toBe(true)
  })

  it('QUA-21 — segments donnés dans le désordre : résultat identique', () => {
    const commun = {
      date: LUNDI,
      prise: '06:00',
      fin: '18:00',
      id: 'jour-fixe',
    } as const
    const segments = [
      { type: 'conduite' as const, de: '06:00', a: '10:00', id: 'a' },
      { type: 'coupure' as const, de: '10:00', a: '14:00', id: 'b' },
      { type: 'conduite' as const, de: '14:00', a: '18:00', id: 'c' },
    ]

    const trie = qualifierJournee(aWorkDay({ ...commun, segments }), PARIS)
    const melange = qualifierJournee(
      aWorkDay({ ...commun, segments: [segments[2]!, segments[0]!, segments[1]!] }),
      PARIS,
    )

    expect(plages(melange)).toEqual(plages(trie))
    expect(melange.dureeParType.conduite.value).toBe(trie.dureeParType.conduite.value)
  })

  it('QUA-22 — deux zones non qualifiées disjointes : deux zones, range cumulé', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '20:00',
      segments: [
        { type: 'conduite', de: '07:00', a: '10:00' },
        { type: 'conduite', de: '12:00', a: '20:00' },
      ],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(plagesIndeterminees(q)).toEqual(['06:00–07:00 trou', '10:00–12:00 trou'])
    expect(q.tempsIndetermine).toBe(3 * 60)
    expect(q.dureeParType.conduite.range).toEqual({ min: 11 * 60, max: 14 * 60 })
  })

  it('QUA-23 — les bornes sont « rien » et « tout », jamais un milieu arbitraire', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '10:00',
      segments: [{ type: 'conduite', de: '06:00', a: '08:00' }],
    })

    const q = qualifierJournee(jour, PARIS)
    const range = q.dureeParType.conduite.range

    expect(range).toEqual({ min: 120, max: 240 })
    // Un milieu (180) serait un chiffre plausible et faux : c'est précisément ce
    // que le SPEC §0 interdit.
    expect(range?.min).not.toBe(180)
    expect(range?.max).not.toBe(180)
  })

  it('QUA-24 — fusion et trou coexistent sans interférence', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '18:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '09:00' },
        { type: 'conduite', de: '08:00', a: '10:00' },
        { type: 'conduite', de: '14:00', a: '18:00' },
      ],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(plages(q)).toEqual(['06:00–10:00 conduite 240', '14:00–18:00 conduite 240'])
    expect(q.tempsIndetermine).toBe(4 * 60)
    expect(q.dureeParType.conduite.range).toEqual({ min: 8 * 60, max: 12 * 60 })
  })

  it('QUA-25 — un segment qui ne comble pas le trou ne fait pas basculer en complete', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '18:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '10:00' },
        { type: 'coupure', de: '11:00', a: '12:00' },
        { type: 'conduite', de: '14:00', a: '18:00' },
      ],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(q.complete).toBe(false)
    expect(q.tempsIndetermine).toBe(3 * 60)
    expect(plagesIndeterminees(q)).toEqual(['10:00–11:00 trou', '12:00–14:00 trou'])
  })

  it('TPS-18 — fin de service avant la prise : signalé, aucune amplitude négative', () => {
    const jour = aWorkDay({ date: LUNDI, prise: '14:00', fin: '06:00' })

    const q = qualifierJournee(jour, PARIS)

    expect(q.amplitude.status).toBe('unknown')
    expect(q.amplitude.value).toBeUndefined()
    expect(q.warnings.find((w) => w.code === CODES_QUALIFICATION.FIN_AVANT_PRISE)?.message)
      .toContain('passe minuit')
  })

  it('PRV-09 — le temps de conduite brut ne porte aucune source', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [{ type: 'conduite', de: '06:00', a: '14:00' }],
    })

    const q = qualifierJournee(jour, PARIS)

    expect(q.dureeParType.conduite.sources).toHaveLength(0)
    expect(q.amplitude.sources).toHaveLength(0)
  })

  it('TPS-15 — une journée du jour de recul des horloges dure 9 h au cadran, 9 h réelles', () => {
    const jour = aWorkDay({
      date: RECUL,
      prise: '00:00',
      fin: '08:00',
      segments: [{ type: 'conduite', de: '00:00', a: '08:00' }],
    })

    const q = qualifierJournee(jour, PARIS)

    // 00:00 → 08:00 au cadran, mais la nuit dure 9 h : c'est la durée réelle qui
    // alimente la paie.
    expect(q.amplitude.value).toBe(9 * 60)
    expect(q.dureeParType.conduite.value).toBe(9 * 60)
    expect(q.complete).toBe(true)
  })
})

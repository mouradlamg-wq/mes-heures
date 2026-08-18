import { beforeEach, describe, expect, it } from 'vitest'
import {
  datesEntre,
  detaillerIntervalle,
  minutes,
  qualifierJournee,
  statutDeLecture,
  type Absence,
  type JourneeQualifiee,
  type WorkDay,
} from '../../src/engine'
import {
  aWorkDay,
  desSettings,
  PARIS,
  reinitialiserCompteur,
  type JourBrut,
} from '../fixtures/builders'

function paire(brut: JourBrut): { jour: WorkDay; journee: JourneeQualifiee } {
  const jour = aWorkDay(brut)
  return { jour, journee: qualifierJournee(jour, PARIS) }
}

/** Journée nette de 8 h, sur la date donnée. */
function journeeNette(date: string) {
  return paire({
    date,
    prise: '06:00',
    fin: '14:00',
    segments: [{ type: 'conduite', de: '06:00', a: '14:00' }],
  })
}

/** Journée avec un trou : le temps rémunéré y est un intervalle. */
function journeeAvecTrou(date: string) {
  return paire({
    date,
    prise: '06:00',
    fin: '18:00',
    segments: [
      { type: 'conduite', de: '06:00', a: '10:00' },
      { type: 'conduite', de: '14:00', a: '18:00' },
    ],
  })
}

/** Journée dont le temps rémunéré est incalculable : disponibilité non réglée. */
function journeeIncalculable(date: string) {
  return paire({
    date,
    prise: '06:00',
    fin: '14:00',
    segments: [
      { type: 'conduite', de: '06:00', a: '12:00' },
      { type: 'disponibilite', de: '12:00', a: '14:00' },
    ],
  })
}

beforeEach(reinitialiserCompteur)

describe('SEM — détail d’un intervalle', () => {
  it('SEM-01 — une ligne par jour du calendrier, sans trou', () => {
    const detail = detaillerIntervalle(
      '2027-03-15',
      '2027-03-21',
      [journeeNette('2027-03-16')],
      desSettings(),
    )

    expect(detail.lignes).toHaveLength(7)
    expect(detail.lignes.map((l) => l.date)).toEqual(datesEntre('2027-03-15', '2027-03-21'))
  })

  it('SEM-02 — un jour sans rien est un repos, pas un oubli', () => {
    const detail = detaillerIntervalle(
      '2027-03-15',
      '2027-03-16',
      [journeeNette('2027-03-16')],
      desSettings(),
    )

    expect(detail.lignes[0]?.sorte).toBe('repos')
    expect(detail.lignes[1]?.sorte).toBe('travail')
    expect(detail.joursRepos).toBe(1)
  })

  it('SEM-03 — un jour d’absence porte son type, sans valorisation', () => {
    const absence: Absence = { id: 'a1', type: 'CP', debut: '2027-03-15', fin: '2027-03-15' }
    const detail = detaillerIntervalle('2027-03-15', '2027-03-15', [], desSettings(), [absence])

    const ligne = detail.lignes[0]
    expect(ligne?.sorte).toBe('absence')
    if (ligne?.sorte === 'absence') {
      expect(ligne.type).toBe('CP')
    }
    // L'app compte les jours par type, elle ne leur donne aucune valeur.
    expect(ligne).not.toHaveProperty('tempsRemunere')
  })

  it('SEM-04 — une absence de plusieurs jours couvre chacun de ses jours', () => {
    const absence: Absence = { id: 'a1', type: 'MALADIE', debut: '2027-03-16', fin: '2027-03-18' }
    const detail = detaillerIntervalle('2027-03-15', '2027-03-19', [], desSettings(), [absence])

    expect(detail.lignes.map((l) => l.sorte)).toEqual([
      'repos',
      'absence',
      'absence',
      'absence',
      'repos',
    ])
    expect(detail.joursAbsence).toBe(3)
  })

  it('SEM-05 — un jour travaillé porte amplitude, conduite et temps rémunéré', () => {
    const detail = detaillerIntervalle(
      '2027-03-16',
      '2027-03-16',
      [journeeNette('2027-03-16')],
      desSettings(),
    )

    const ligne = detail.lignes[0]
    expect(ligne?.sorte).toBe('travail')
    if (ligne?.sorte !== 'travail') return

    expect(ligne.amplitude.value).toBe(8 * 60)
    expect(ligne.conduite.value).toBe(8 * 60)
    expect(ligne.tempsRemunere.value).toBe(8 * 60)
    // Durées brutes : aucune source (SPEC §4).
    expect(ligne.amplitude.sources).toHaveLength(0)
    expect(ligne.conduite.sources).toHaveLength(0)
  })

  it('SEM-06 — une journée incalculable est exclue du total, pas propagée', () => {
    const detail = detaillerIntervalle(
      '2027-03-15',
      '2027-03-16',
      [journeeNette('2027-03-15'), journeeIncalculable('2027-03-16')],
      desSettings(),
    )

    // Sans cette règle, un seul jour sans réglage masquerait tous les autres.
    expect(detail.total.status).toBe('complete')
    expect(detail.total.value).toBe(8 * 60)
    expect(detail.joursIncalculables).toBe(1)
  })

  it('SEM-07 — le total porte l’avertissement des journées écartées', () => {
    const detail = detaillerIntervalle(
      '2027-03-15',
      '2027-03-16',
      [journeeNette('2027-03-15'), journeeIncalculable('2027-03-16')],
      desSettings(),
    )

    const alerte = detail.total.warnings.find((w) => w.code === 'journees_ecartees_du_total')
    expect(alerte?.message).toContain("n'est pas comptée")
  })

  it('SEM-08 — une journée partielle rend le total partial, avec ses bornes', () => {
    const detail = detaillerIntervalle(
      '2027-03-15',
      '2027-03-16',
      [journeeNette('2027-03-15'), journeeAvecTrou('2027-03-16')],
      desSettings(),
    )

    expect(detail.total.status).toBe('partial')
    // 8 h nettes + entre 8 h et 12 h.
    expect(detail.total.range).toEqual({ min: 16 * 60, max: 20 * 60 })
    expect(detail.joursPartiels).toBe(1)
  })

  it('SEM-09 — le statut de lecture passe en partiel dès qu’une journée est écartée', () => {
    const avecTrou = detaillerIntervalle(
      '2027-03-15',
      '2027-03-15',
      [journeeAvecTrou('2027-03-15')],
      desSettings(),
    )
    expect(statutDeLecture(avecTrou)).toBe('partial')

    const toutCertain = detaillerIntervalle(
      '2027-03-15',
      '2027-03-15',
      [journeeNette('2027-03-15')],
      desSettings(),
    )
    expect(statutDeLecture(toutCertain)).toBe('complete')

    // Journées retenues toutes certaines, mais une journée manque : la lecture
    // du total ne peut pas être « certaine ».
    const avecEcartee = detaillerIntervalle(
      '2027-03-15',
      '2027-03-16',
      [journeeNette('2027-03-15'), journeeIncalculable('2027-03-16')],
      desSettings(),
    )
    expect(avecEcartee.total.status).toBe('complete')
    expect(statutDeLecture(avecEcartee)).toBe('partial')
  })

  it('SEM-10 — aucune journée calculable : unknown avec sa cause, aucun chiffre', () => {
    const vide = detaillerIntervalle('2027-03-15', '2027-03-21', [], desSettings())
    expect(vide.total.status).toBe('unknown')
    expect(vide.total.value).toBeUndefined()
    expect(vide.total.warnings.at(-1)?.message).toContain('Aucune journée')

    const queDesIncalculables = detaillerIntervalle(
      '2027-03-15',
      '2027-03-15',
      [journeeIncalculable('2027-03-15')],
      desSettings(),
    )
    expect(queDesIncalculables.total.status).toBe('unknown')
    expect(statutDeLecture(queDesIncalculables)).toBe('unknown')
  })

  it('SEM-11 — les décomptes couvrent tous les jours, sans recouvrement', () => {
    const absence: Absence = { id: 'a1', type: 'RTT', debut: '2027-03-18', fin: '2027-03-18' }
    const detail = detaillerIntervalle(
      '2027-03-15',
      '2027-03-21',
      [
        journeeNette('2027-03-15'),
        journeeAvecTrou('2027-03-16'),
        journeeIncalculable('2027-03-17'),
      ],
      desSettings(),
      [absence],
    )

    expect(detail.joursCertains).toBe(1)
    expect(detail.joursPartiels).toBe(1)
    expect(detail.joursIncalculables).toBe(1)
    expect(detail.joursAbsence).toBe(1)
    expect(detail.joursRepos).toBe(3)

    const total =
      detail.joursCertains +
      detail.joursPartiels +
      detail.joursIncalculables +
      detail.joursAbsence +
      detail.joursRepos
    expect(total).toBe(detail.lignes.length)
  })

  it('SEM-14 — un intervalle inversé ne produit rien', () => {
    const detail = detaillerIntervalle('2027-03-21', '2027-03-15', [], desSettings())

    expect(detail.lignes).toEqual([])
    expect(detail.total.status).toBe('unknown')
  })

  it('datesEntre — bornes incluses, y compris sur un seul jour', () => {
    expect(datesEntre('2027-03-15', '2027-03-15')).toEqual(['2027-03-15'])
    expect(datesEntre('2027-02-27', '2027-03-02')).toEqual([
      '2027-02-27',
      '2027-02-28',
      '2027-03-01',
      '2027-03-02',
    ])
  })

  it('SEM-05 — une disponibilité réglée rend la journée certaine', () => {
    const detail = detaillerIntervalle(
      '2027-03-16',
      '2027-03-16',
      [journeeIncalculable('2027-03-16')],
      desSettings({ fractionDisponibiliteRemuneree: 0.5 }),
    )

    const ligne = detail.lignes[0]
    expect(ligne?.sorte).toBe('travail')
    if (ligne?.sorte !== 'travail') return

    // 6 h de conduite + la moitié de 2 h de disponibilité.
    expect(ligne.tempsRemunere.value).toBe(7 * 60)
    expect(detail.joursIncalculables).toBe(0)
    expect(detail.total.value).toBe(minutes(7 * 60))
  })
})

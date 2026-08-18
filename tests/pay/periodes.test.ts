import { beforeEach, describe, expect, it } from 'vitest'
import {
  blocsDeReference,
  chevaucheDeuxPeriodes,
  debutDeSemaine,
  heuresSup,
  joursDansPeriode,
  joursEntreDates,
  minutes,
  periodePour,
  periodesEntre,
  qualifierJournee,
  semainesCouvrant,
  type PayPeriod,
} from '../../src/engine'
import { aWorkDay, desSettings, PARIS, reinitialiserCompteur } from '../fixtures/builders'

function periode(debut: string, fin: string): PayPeriod {
  return { id: `${debut}_${fin}`, label: 'Période de test', debut, fin }
}

beforeEach(reinitialiserCompteur)

describe('PER — périodes de paie, semaines, rattachement', () => {
  it('PER-01 — jourDebut = 1 : la période est le mois civil', () => {
    const r = periodePour('2027-03-16', desSettings({ payPeriodConfig: { jourDebut: 1 } }))

    expect(r.status).toBe('complete')
    expect(r.value).toMatchObject({ debut: '2027-03-01', fin: '2027-03-31', label: 'Mars 2027' })
  })

  it('PER-02 — jourDebut = 26 : du 26 au 25, libellé porté par le mois de fin', () => {
    const settings = desSettings({ payPeriodConfig: { jourDebut: 26 } })

    expect(periodePour('2027-03-16', settings).value).toMatchObject({
      debut: '2027-02-26',
      fin: '2027-03-25',
      label: 'Mars 2027',
    })
    // Le 26 bascule sur la période suivante.
    expect(periodePour('2027-03-26', settings).value).toMatchObject({
      debut: '2027-03-26',
      fin: '2027-04-25',
      label: 'Avril 2027',
    })
  })

  it('PER-03 — jourDebut = 31 sur un mois de 30 jours : dernier jour existant', () => {
    const settings = desSettings({ payPeriodConfig: { jourDebut: 31 } })

    // Avril n'a pas de 31 : la période d'avril s'ouvre le 30, jamais le 1er mai.
    expect(periodePour('2027-04-15', settings).value).toMatchObject({
      debut: '2027-03-31',
      fin: '2027-04-29',
    })
    expect(periodePour('2027-05-01', settings).value).toMatchObject({
      debut: '2027-04-30',
      fin: '2027-05-30',
    })
  })

  it('PER-04 — jourDebut = 29 en février non bissextile', () => {
    const settings = desSettings({ payPeriodConfig: { jourDebut: 29 } })

    expect(periodePour('2027-03-01', settings).value).toMatchObject({
      debut: '2027-02-28',
      fin: '2027-03-28',
    })
  })

  it('PER-05 — payPeriodConfig absent : unknown, pas de repli sur le mois civil', () => {
    const r = periodePour('2027-03-16', desSettings())

    expect(r.status).toBe('unknown')
    expect(r.warnings.at(-1)?.reglageManquant).toBe('payPeriodConfig')
    expect(r.warnings.at(-1)?.message).toContain('du 26 au 25')
  })

  it('PER-06 — douze périodes consécutives : aucun jour en double ni manquant', () => {
    const r = periodesEntre('2027-01-01', '2027-12-31', desSettings({ payPeriodConfig: { jourDebut: 26 } }))

    expect(r.status).toBe('complete')
    const periodes = r.value ?? []
    expect(periodes.length).toBeGreaterThanOrEqual(12)

    for (const [index, courante] of periodes.entries()) {
      expect(courante.debut <= courante.fin, courante.id).toBe(true)
      const suivante = periodes[index + 1]
      if (suivante !== undefined) {
        // Le lendemain de la fin est exactement le début de la suivante.
        expect(joursEntreDates(courante.fin, suivante.debut), courante.id).toBe(1)
      }
    }
  })

  it('PER-07 — une période contenant le changement d’heure garde des bornes en dates', () => {
    const r = periodePour('2027-03-28', desSettings({ payPeriodConfig: { jourDebut: 1 } }))

    expect(r.value).toMatchObject({ debut: '2027-03-01', fin: '2027-03-31' })
  })

  it('PER-08 — debutSemaine = 1 : du lundi au dimanche', () => {
    expect(debutDeSemaine('2027-03-18', 1)).toBe('2027-03-15')
    expect(debutDeSemaine('2027-03-15', 1)).toBe('2027-03-15')
    expect(debutDeSemaine('2027-03-21', 1)).toBe('2027-03-15')
  })

  it('PER-09 — debutSemaine = 4 : du jeudi au mercredi, aucun lundi caché', () => {
    // 2027-03-18 est un jeudi.
    expect(debutDeSemaine('2027-03-18', 4)).toBe('2027-03-18')
    expect(debutDeSemaine('2027-03-17', 4)).toBe('2027-03-11')
    expect(debutDeSemaine('2027-03-24', 4)).toBe('2027-03-18')
  })

  it('PER-10 — debutSemaine absent en mode hebdomadaire : unknown, le lundi n’est pas appliqué', () => {
    const settings = desSettings({
      modeDecompteHS: 'hebdomadaire',
      dureeReferenceMinutes: minutes(2100),
    })

    const r = heuresSup([], settings, periode('2027-03-01', '2027-03-31'))

    expect(r.duree.status).toBe('unknown')
    expect(r.duree.warnings.at(-1)?.reglageManquant).toBe('debutSemaine')
    expect(r.duree.warnings.at(-1)?.message).toContain('régime supplétif')
  })

  it('PER-11 — semaine entièrement contenue dans la période', () => {
    const p = periode('2027-03-01', '2027-03-31')
    const semaine = { debut: '2027-03-15', fin: '2027-03-21' }

    expect(chevaucheDeuxPeriodes(semaine, p)).toBe(false)
    expect(joursDansPeriode(semaine, p)).toBe(7)
  })

  it('PER-17 — periode_reference sans ancrage : unknown, message explicite', () => {
    const settings = desSettings({
      modeDecompteHS: 'periode_reference',
      dureeReferenceMinutes: minutes(2100),
      periodeReferenceSemaines: 4,
    })

    const r = heuresSup([], settings, periode('2027-03-01', '2027-03-31'))

    expect(r.duree.status).toBe('unknown')
    expect(r.duree.warnings.at(-1)?.reglageManquant).toBe('periodeReferenceDebut')
    expect(r.duree.warnings.at(-1)?.message).toContain('4 semaines')
  })

  it('PER-18 — periode_reference sans nombre de semaines : unknown', () => {
    const settings = desSettings({
      modeDecompteHS: 'periode_reference',
      dureeReferenceMinutes: minutes(2100),
      periodeReferenceDebut: '2027-01-04',
    })

    const r = heuresSup([], settings, periode('2027-03-01', '2027-03-31'))

    expect(r.duree.status).toBe('unknown')
    expect(r.duree.warnings.at(-1)?.reglageManquant).toBe('periodeReferenceSemaines')
  })

  it('PER-19 — blocs de 4 semaines ancrés, y compris en remontant avant l’ancrage', () => {
    const p = periode('2027-03-01', '2027-03-31')
    const blocs = blocsDeReference(p, '2027-01-04', 4)

    expect(blocs[0]?.debut).toBe('2027-03-01')
    expect(blocs[0]?.fin).toBe('2027-03-28')
    // 2027-03-01 est bien un ancrage + 8 semaines : la grille remonte jusqu'à
    // l'ancrage sans jamais démarrer arbitrairement au 1er du mois.
    expect(joursEntreDates('2027-01-04', '2027-03-01') % 28).toBe(0)

    const avant = blocsDeReference(periode('2026-12-01', '2026-12-31'), '2027-01-04', 4)
    expect(avant[0]!.debut < '2027-01-04').toBe(true)
  })

  it('PER-20 — une journée à cheval sur deux périodes est rattachée à sa prise de service', () => {
    const settings = desSettings({ payPeriodConfig: { jourDebut: 26 } })
    // Prise le 25 mars à 22:00, fin le 26 à 06:00 : dernier jour de la période
    // de mars, premier de celle d'avril.
    const jour = aWorkDay({
      date: '2027-03-25',
      prise: '22:00',
      fin: '+1 06:00',
      segments: [{ type: 'conduite', de: '22:00', a: '+1 06:00' }],
    })

    const q = qualifierJournee(jour, PARIS)
    const p = periodePour(jour.dateRattachement, settings)

    expect(q.dateRattachement).toBe('2027-03-25')
    expect(p.value?.fin).toBe('2027-03-25')
    expect(p.value?.label).toBe('Mars 2027')
  })

  it('PER-21 — les bornes de période ne dépendent pas du fuseau du processus', () => {
    // Le processus tourne sous America/New_York : si la zone fuyait, une borne
    // de période pourrait glisser d'un jour.
    const settings = desSettings({ payPeriodConfig: { jourDebut: 26 } })
    expect(periodePour('2027-01-01', settings).value).toMatchObject({
      debut: '2026-12-26',
      fin: '2027-01-25',
    })
  })

  it('PER-22 — une période ne se déduit jamais d’un YYYY-MM', () => {
    const settings = desSettings({ payPeriodConfig: { jourDebut: 1 } })

    const r = periodePour('2027-03', settings)

    expect(r.status).toBe('unknown')
    expect(r.warnings.at(-1)?.message).toContain("jamais d'un mois")
  })

  it('PER-23 — semaine à cheval sur deux années : aucun cas particulier', () => {
    const p = periode('2026-12-26', '2027-01-25')
    const semaines = semainesCouvrant(p, 1)
    const aCheval = semaines.filter((s) => chevaucheDeuxPeriodes(s, p))

    expect(semaines[0]?.debut).toBe('2026-12-21')
    expect(aCheval.length).toBeGreaterThan(0)
    // Une semaine décembre → janvier se traite comme n'importe quelle autre.
    expect(semaines.some((s) => s.debut < '2027-01-01' && s.fin >= '2027-01-01')).toBe(true)
  })

  it('PER-24 — prorata : un seul jour dans la période, aucune division par zéro', () => {
    const p = periode('2027-03-01', '2027-03-31')
    const semaine = { debut: '2027-02-23', fin: '2027-03-01' }

    expect(joursDansPeriode(semaine, p)).toBe(1)
    expect(joursDansPeriode({ debut: '2027-04-01', fin: '2027-04-07' }, p)).toBe(0)
  })
})

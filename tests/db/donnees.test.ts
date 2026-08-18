import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BaseMesHeures,
  etatSauvegarde,
  exporter,
  ID_SETTINGS,
  importer,
  lireFichier,
  Repository,
  serialiser,
  VERSION_EXPORT,
  type FichierExport,
} from '../../src/db'
import { cents, minutes, type Absence, type WorkDay } from '../../src/engine'
import { aWorkDay, desSettings, reinitialiserCompteur } from '../fixtures/builders'

const MAINTENANT = '2027-03-16T20:00:00+01:00'
const JOUR_MS = 86_400_000

let base: BaseMesHeures
let repo: Repository
let compteurBase = 0

beforeEach(async () => {
  reinitialiserCompteur()
  compteurBase += 1
  // Une base par test : l'isolation vaut mieux qu'un `clear()` qui laisserait
  // traîner une version de schéma.
  base = new BaseMesHeures(`mes-heures-test-${String(compteurBase)}`)
  repo = new Repository(base)
  await base.open()
  await repo.ecrireSettings(desSettings())
})

afterEach(() => {
  base.close()
})

function troisJours(): WorkDay[] {
  return ['2027-03-15', '2027-03-16', '2027-03-17'].map((date) =>
    aWorkDay({
      date,
      prise: '06:00',
      fin: '14:00',
      segments: [{ type: 'conduite', de: '06:00', a: '14:00' }],
    }),
  )
}

async function peupler(): Promise<WorkDay[]> {
  const jours = troisJours()
  for (const jour of jours) {
    await repo.enregistrerJournee(jour)
  }
  return jours
}

describe('DON — Dexie, migrations, export / import', () => {
  it('DON-01 — écriture puis relecture d’une journée, au champ près', async () => {
    const [jour] = await peupler()

    const relu = await repo.lireJournee(jour!.id)

    expect(relu).toEqual(jour)
    expect(relu?.priseService).toBe('2027-03-15T06:00:00+01:00')
  })

  it('DON-02 — les instants sont stockés en ISO avec offset, jamais un timestamp', async () => {
    const [jour] = await peupler()
    const brut = await base.workDays.get(jour!.id)

    expect(typeof brut?.priseService).toBe('string')
    expect(brut?.priseService).toMatch(/[+-]\d{2}:\d{2}$/)
    for (const segment of brut?.segments ?? []) {
      expect(typeof segment.debut).toBe('string')
      expect(segment.debut).toMatch(/[+-]\d{2}:\d{2}$/)
    }
  })

  it('DON-03 — aucune table ne porte de résultat de calcul', async () => {
    await peupler()

    const champs = new Set<string>()
    for (const table of base.tables) {
      for (const ligne of await table.toArray()) {
        for (const champ of Object.keys(ligne as object)) {
          champs.add(champ)
        }
      }
    }

    // Les noms du glossaire (CLAUDE.md §15) côté résultat n'ont rien à faire ici.
    for (const interdit of [
      'tempsRemunere',
      'heuresSup',
      'amplitude',
      'brutCalcule',
      'indemnitesCalculees',
      'montantCalcule',
    ]) {
      expect([...champs], interdit).not.toContain(interdit)
    }
  })

  it('DON-04 — la complétude d’une journée n’est pas stockée', async () => {
    const [jour] = await peupler()
    const brut = await base.workDays.get(jour!.id)

    expect(brut).not.toHaveProperty('statut')
    expect(brut).not.toHaveProperty('complete')
  })

  it('DON-05 — export puis import dans une base vide : identiques', async () => {
    const jours = await peupler()
    await repo.enregistrerAbsence({
      id: 'abs-1',
      type: 'CP',
      debut: '2027-03-20',
      fin: '2027-03-21',
    })

    const fichier = await exporter(base, MAINTENANT)
    const json = serialiser(fichier)

    const cible = new BaseMesHeures('mes-heures-cible')
    await cible.open()
    try {
      const resultat = await importer(cible, json, 'remplacement')

      expect(resultat.status).toBe('ok')
      expect(await cible.workDays.toArray()).toEqual(jours)
      const reexporte = await exporter(cible, MAINTENANT)
      expect(reexporte).toEqual(fichier)
    } finally {
      cible.close()
      await cible.delete()
    }
  })

  it('DON-06 — l’export porte sa version de format et sa date', async () => {
    const fichier = await exporter(base, MAINTENANT)

    expect(fichier.formatExport).toBe('mes-heures')
    expect(fichier.versionExport).toBe(VERSION_EXPORT)
    expect(fichier.exporteLe).toBe(MAINTENANT)
  })

  it('DON-07 — JSON invalide : refus propre, données intactes', async () => {
    const jours = await peupler()

    const resultat = await importer(base, '{ ceci ne ferme pas', 'remplacement')

    expect(resultat.status).toBe('refus')
    if (resultat.status === 'refus') {
      expect(resultat.raison).toContain('pas du JSON valide')
    }
    expect(await base.workDays.toArray()).toEqual(jours)
  })

  it('DON-08 — schéma incorrect : refus par Zod, champ nommé, données intactes', async () => {
    const jours = await peupler()
    const fichier = await exporter(base, MAINTENANT)

    // Un instant sans décalage horaire : exactement le piège du SPEC §5.
    const corrompu = structuredClone(fichier) as unknown as {
      workDays: { priseService?: string }[]
    }
    corrompu.workDays[0]!.priseService = '2027-03-15T06:00:00'

    const resultat = await importer(base, JSON.stringify(corrompu), 'remplacement')

    expect(resultat.status).toBe('refus')
    if (resultat.status === 'refus') {
      expect(resultat.raison).toContain("Rien n'a été modifié")
      expect(resultat.details.join('\n')).toContain('priseService')
      expect(resultat.details.join('\n')).toContain('décalage horaire')
    }
    expect(await base.workDays.toArray()).toEqual(jours)
  })

  it('DON-09 — export d’une version plus récente : refus explicite', async () => {
    const fichier = await exporter(base, MAINTENANT)
    const futur = { ...fichier, versionExport: VERSION_EXPORT + 1 }

    const lecture = lireFichier(JSON.stringify(futur))

    expect(lecture.status).toBe('refus')
    if (lecture.status === 'refus') {
      expect(lecture.raison).toContain('plus récente')
      expect(lecture.raison).toContain('Mets l’app à jour'.replace('’', "'"))
    }
  })

  it('DON-10 — export d’une version antérieure : migré à la lecture, sans perte', async () => {
    const jours = await peupler()
    const fichier = await exporter(base, MAINTENANT)
    const ancien: FichierExport = { ...fichier, versionExport: 1 }

    const cible = new BaseMesHeures('mes-heures-ancien')
    await cible.open()
    try {
      const resultat = await importer(cible, JSON.stringify(ancien), 'remplacement')

      expect(resultat.status).toBe('ok')
      expect(await cible.workDays.toArray()).toEqual(jours)
    } finally {
      cible.close()
      await cible.delete()
    }
  })

  it('DON-11 — un import qui échoue ne laisse pas la base à moitié écrasée', async () => {
    const jours = await peupler()
    const fichier = await exporter(base, MAINTENANT)

    // Le premier jour est valide, le second ne l'est pas : si la validation
    // n'était pas faite **avant** d'écrire, la base serait déjà vidée.
    const corrompu = structuredClone(fichier) as unknown as {
      workDays: { dateRattachement?: string }[]
    }
    corrompu.workDays[1]!.dateRattachement = 'pas-une-date'

    const resultat = await importer(base, JSON.stringify(corrompu), 'remplacement')

    expect(resultat.status).toBe('refus')
    expect(await base.workDays.toArray()).toEqual(jours)
    expect(await base.workDays.count()).toBe(3)
  })

  it('DON-12 — le mode d’import est explicite, jamais implicite', async () => {
    await peupler()
    const fichier = await exporter(base, MAINTENANT)

    const autre = aWorkDay({ date: '2027-04-01', prise: '06:00', fin: '12:00' })
    const cible = new BaseMesHeures('mes-heures-fusion')
    await cible.open()
    try {
      await cible.workDays.put(autre)
      await cible.settings.put({ ...desSettings(), id: ID_SETTINGS })

      await importer(cible, JSON.stringify(fichier), 'fusion')
      expect(await cible.workDays.count()).toBe(4)

      await importer(cible, JSON.stringify(fichier), 'remplacement')
      expect(await cible.workDays.count()).toBe(3)
    } finally {
      cible.close()
      await cible.delete()
    }
  })

  it('DON-13 — migration de schéma : aucune perte sur une base peuplée', async () => {
    const jours = await peupler()
    base.close()

    // On rouvre la même base sous une classe déclarant une version 2 : c'est le
    // scénario réel d'une mise à jour de l'app sur un téléphone déjà rempli.
    class BaseV2 extends BaseMesHeures {
      constructor(nom: string) {
        super(nom)
        this.version(2)
          .stores({
            settings: 'id',
            workDays: 'id, &dateRattachement, decouche',
            absences: 'id, debut, fin, type',
            templates: 'id',
            payChecks: 'id, payPeriodId',
            qualifications: 'id, dayId',
            saisiesIndemnites: 'id, dayId, code',
            meta: 'cle',
          })
          .upgrade(() => {
            // Rien à transformer : on ajoute seulement un index.
          })
      }
    }

    const migree = new BaseV2(base.name)
    await migree.open()
    try {
      expect(migree.verno).toBe(2)
      expect(await migree.workDays.toArray()).toEqual(jours)
    } finally {
      migree.close()
    }
  })

  it('DON-18 — un import ne se fait pas passer pour une sauvegarde', async () => {
    await repo.noterExport('2027-03-01T12:00:00+01:00')
    const fichier = await exporter(base, MAINTENANT)

    await importer(base, JSON.stringify(fichier), 'remplacement')

    expect(await repo.dernierExport()).toBe('2027-03-01T12:00:00+01:00')
  })

  it('DON-19 — un Settings réduit à timeZoneReference est valide et persistable', async () => {
    await repo.ecrireSettings({ timeZoneReference: 'Europe/Paris', indemnites: [] })

    const relu = await repo.lireSettings()

    expect(relu).toEqual({ timeZoneReference: 'Europe/Paris', indemnites: [] })
    expect(relu).not.toHaveProperty('id')

    const fichier = await exporter(base, MAINTENANT)
    expect(lireFichier(serialiser(fichier)).status).toBe('ok')
  })

  it('DON-20 — supprimer une journée emporte ses qualifications et ses saisies', async () => {
    const [jour] = await peupler()
    await repo.enregistrerQualification({
      id: 'q1',
      dayId: jour!.id,
      debut: '2027-03-15T10:00:00+01:00',
      fin: '2027-03-15T11:00:00+01:00',
      type: 'coupure',
    })
    await repo.enregistrerSaisieIndemnite({
      id: 's1',
      dayId: jour!.id,
      code: 'REPAS',
      quantite: 1,
    })

    await repo.supprimerJournee(jour!.id)

    expect(await repo.lireJournee(jour!.id)).toBeUndefined()
    expect(await repo.lireQualifications([jour!.id])).toEqual([])
    expect(await repo.lireSaisiesIndemnites([jour!.id])).toEqual([])
  })

  it('DON-21 — deux journées sur la même date de rattachement : refus', async () => {
    const [jour] = await peupler()
    const doublon = aWorkDay({ date: jour!.dateRattachement, prise: '08:00', fin: '16:00' })

    await expect(repo.enregistrerJournee(doublon)).rejects.toThrow()
    expect(await base.workDays.count()).toBe(3)
  })

  it('DON-22 — trois ans de journées restent exportables et interrogeables', async () => {
    const journees: WorkDay[] = []
    for (let i = 0; i < 800; i += 1) {
      const d = new Date(Date.UTC(2025, 0, 1 + i))
      const date = `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
      journees.push(aWorkDay({ date, prise: '06:00', fin: '14:00' }))
    }
    await base.workDays.bulkPut(journees)

    const mars = await repo.lireJourneesEntre('2026-03-01', '2026-03-31')
    expect(mars).toHaveLength(31)
    expect(mars[0]?.dateRattachement).toBe('2026-03-01')

    const fichier = await exporter(base, MAINTENANT)
    expect(fichier.workDays).toHaveLength(800)
    expect(lireFichier(serialiser(fichier)).status).toBe('ok')
  })

  it('DON-23 — une fiche de paie saisie coexiste avec les données calculées', async () => {
    await peupler()
    await repo.enregistrerPayCheck({
      id: 'fiche-1',
      payPeriodId: '2027-03-01_2027-03-31',
      heuresPayeesCentiemes: 151.67,
      brutCents: cents(210000),
    })

    const jours = await repo.lireJourneesEntre('2027-03-01', '2027-03-31')
    const fiche = await repo.lirePayCheck('2027-03-01_2027-03-31')

    // Les deux vivent côte à côte : la comparaison est dérivée, pas stockée.
    expect(jours).toHaveLength(3)
    expect(fiche?.brutCents).toBe(210000)
  })

  it('DON-24 — le fichier d’export ne contient rien que l’utilisateur n’ait saisi', async () => {
    await peupler()
    await repo.noterExport('2027-03-01T12:00:00+01:00')
    await repo.noterStockagePersistant(false)

    const fichier = await exporter(base, MAINTENANT)

    // La table `meta` est locale à l'appareil : elle ne part pas dans le fichier.
    expect(Object.keys(fichier).sort()).toEqual([
      'absences',
      'exporteLe',
      'formatExport',
      'payChecks',
      'qualifications',
      'saisiesIndemnites',
      'settings',
      'templates',
      'versionExport',
      'workDays',
    ])
    expect(JSON.stringify(fichier)).not.toContain('stockagePersistant')
  })

  it('INT-21 — le mode de saisie est une préférence d’appareil, hors export', async () => {
    await peupler()
    expect(await repo.lireModeSaisieHeure()).toBe('clavier')

    await repo.ecrireModeSaisieHeure('selecteur')
    expect(await repo.lireModeSaisieHeure()).toBe('selecteur')

    // Il ne fait pas partie des réglages métier, donc il ne part pas dans le
    // fichier : le clavier d'une tablette n'est pas celui d'un téléphone.
    const fichier = await exporter(base, MAINTENANT)
    expect(JSON.stringify(fichier)).not.toContain('modeSaisieHeure')
    expect(JSON.stringify(fichier)).not.toContain('selecteur')
  })
})

describe('DON — rappels de sauvegarde', () => {
  const maintenant = Date.UTC(2027, 2, 16)

  it('DON-16 — rappel proposé après quatorze jours', () => {
    const etat = etatSauvegarde(maintenant - 14 * JOUR_MS, maintenant, 'accorde')

    expect(etat.niveau).toBe('rappel')
    expect(etatSauvegarde(maintenant - 13 * JOUR_MS, maintenant, 'accorde').niveau).toBe('ok')
  })

  it('DON-17 — alerte après trente jours', () => {
    const etat = etatSauvegarde(maintenant - 30 * JOUR_MS, maintenant, 'accorde')

    expect(etat.niveau).toBe('alerte')
    if (etat.niveau === 'alerte') {
      expect(etat.message).toContain('tu perds tout')
    }
  })

  it('DON-14 — un stockage refusé renforce le rappel', () => {
    const accorde = etatSauvegarde(maintenant - 20 * JOUR_MS, maintenant, 'accorde')
    const refuse = etatSauvegarde(maintenant - 20 * JOUR_MS, maintenant, 'refuse')

    expect(accorde.niveau).toBe('rappel')
    expect(refuse.niveau).toBe('rappel')
    if (accorde.niveau === 'rappel' && refuse.niveau === 'rappel') {
      expect(refuse.message.length).toBeGreaterThan(accorde.message.length)
      expect(refuse.message).toContain("n'a pas garanti")
    }
  })

  it('DON-15 — API de stockage absente : traitée comme un refus, jamais un succès', () => {
    const inconnu = etatSauvegarde(maintenant - 20 * JOUR_MS, maintenant, undefined)

    expect(inconnu.niveau).toBe('rappel')
    if (inconnu.niveau === 'rappel') {
      expect(inconnu.message).toContain("n'a pas garanti")
    }
  })

  it('aucune sauvegarde jamais faite : dit explicitement', () => {
    const etat = etatSauvegarde(undefined, maintenant, 'accorde')

    expect(etat.niveau).toBe('jamais')
    if (etat.niveau === 'jamais') {
      expect(etat.message).toContain('jamais exporté')
    }
  })
})

describe('DON — validation fine des schémas', () => {
  it('un montant non entier est refusé à la frontière', async () => {
    const fichier = await exporter(base, MAINTENANT)
    const corrompu = structuredClone(fichier) as {
      settings: { tauxHoraireBaseCents?: number }
    }
    corrompu.settings.tauxHoraireBaseCents = 13.45

    const lecture = lireFichier(JSON.stringify(corrompu))

    expect(lecture.status).toBe('refus')
  })

  it('une durée négative est refusée à la frontière', async () => {
    const fichier = await exporter(base, MAINTENANT)
    const corrompu = structuredClone(fichier) as {
      settings: { dureeReferenceMinutes?: number }
    }
    corrompu.settings.dureeReferenceMinutes = -60

    expect(lireFichier(JSON.stringify(corrompu)).status).toBe('refus')
  })

  it('un Settings valide avec tous les réglages franchit la validation', async () => {
    await repo.ecrireSettings(
      desSettings({
        tauxHoraireBaseCents: cents(1345),
        modeDecompteHS: 'hebdomadaire',
        debutSemaine: 1,
        dureeReferenceMinutes: minutes(2100),
        rattachementSemaineChevauchante: 'periode_de_fin',
        tranchesHS: [
          { deMinutes: minutes(0), aMinutes: minutes(480), majorationPct: 25 },
          { deMinutes: minutes(480), aMinutes: null, majorationPct: 50 },
        ],
        fractionDisponibiliteRemuneree: 0.5,
        coupuresRemunerees: [{ auDelaDeMinutes: minutes(30), fraction: 0.5 }],
        payPeriodConfig: { jourDebut: 26 },
      }),
    )

    const fichier = await exporter(base, MAINTENANT)
    const lecture = lireFichier(serialiser(fichier))

    expect(lecture.status).toBe('ok')
  })

  it('une absence conserve sa demi-journée à travers l’aller-retour', async () => {
    const absence: Absence = {
      id: 'abs-demi',
      type: 'RTT',
      debut: '2027-03-20',
      fin: '2027-03-20',
      demiJournee: 'apres_midi',
    }
    await repo.enregistrerAbsence(absence)

    const fichier = await exporter(base, MAINTENANT)
    const lecture = lireFichier(serialiser(fichier))

    expect(lecture.status).toBe('ok')
    if (lecture.status === 'ok') {
      expect(lecture.fichier.absences).toEqual([absence])
    }
  })
})

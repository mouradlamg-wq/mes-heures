import type {
  Absence,
  DayTemplate,
  ISODateTime,
  PayCheck,
  QualificationManuelle,
  SaisieIndemnite,
  Settings,
  WorkDay,
} from '../engine'
import type { BaseMesHeures } from './database'
import { ID_SETTINGS } from './database'
import { exportSchema, VERSION_EXPORT } from './schemas'

/**
 * Export / import (SPEC §12). Aucun compte, aucune synchronisation : un fichier
 * JSON est le seul moyen de changer d'appareil, et le seul filet contre la perte
 * de données.
 */

/**
 * Le fichier d'échange, décrit avec les **types du moteur**. Les schémas Zod
 * décrivent la même chose côté validation, et `PARITE_SCHEMA_MOTEUR` garantit
 * que les deux descriptions ne divergent pas d'un champ.
 */
export type FichierExport = {
  readonly formatExport: 'mes-heures'
  readonly versionExport: number
  readonly exporteLe: ISODateTime
  readonly settings: Settings
  readonly workDays: readonly WorkDay[]
  readonly absences: readonly Absence[]
  readonly templates: readonly DayTemplate[]
  readonly payChecks: readonly PayCheck[]
  readonly qualifications: readonly QualificationManuelle[]
  readonly saisiesIndemnites: readonly SaisieIndemnite[]
}

export type ResultatImport =
  | { readonly status: 'ok'; readonly compte: Readonly<Record<string, number>> }
  | { readonly status: 'refus'; readonly raison: string; readonly details: readonly string[] }

export async function exporter(
  base: BaseMesHeures,
  instantCourant: string,
): Promise<FichierExport> {
  const [settingsRow, workDays, absences, templates, payChecks, qualifications, saisies] =
    await Promise.all([
      base.settings.get(ID_SETTINGS),
      base.workDays.toArray(),
      base.absences.toArray(),
      base.templates.toArray(),
      base.payChecks.toArray(),
      base.qualifications.toArray(),
      base.saisiesIndemnites.toArray(),
    ])

  if (settingsRow === undefined) {
    throw new Error("Aucun réglage en base : l'app doit être initialisée avant d'exporter.")
  }
  const { id: _id, ...settings } = settingsRow

  // Aucun identifiant d'appareil, aucun horodatage de navigation : le fichier ne
  // contient que ce que le conducteur a saisi, plus la date de l'export.
  return {
    formatExport: 'mes-heures',
    versionExport: VERSION_EXPORT,
    exporteLe: instantCourant,
    settings,
    workDays,
    absences,
    templates,
    payChecks,
    qualifications,
    saisiesIndemnites: saisies,
  }
}

export function serialiser(fichier: FichierExport): string {
  return JSON.stringify(fichier, null, 2)
}

/**
 * Lecture d'un fichier d'export. Ne touche **jamais** à la base : elle rend soit
 * un contenu validé, soit un refus lisible.
 */
export function lireFichier(
  contenu: string,
): { status: 'ok'; fichier: FichierExport } | { status: 'refus'; raison: string; details: string[] } {
  let brut: unknown
  try {
    brut = JSON.parse(contenu)
  } catch {
    return {
      status: 'refus',
      raison: "Ce fichier n'est pas lisible : ce n'est pas du JSON valide.",
      details: [],
    }
  }

  const analyse = exportSchema.safeParse(brut)
  if (!analyse.success) {
    return {
      status: 'refus',
      raison: "Ce fichier n'a pas la forme attendue. Rien n'a été modifié.",
      details: analyse.error.issues.map(
        (probleme) =>
          `${probleme.path.join('.')} : ${probleme.message}`,
      ),
    }
  }

  if (analyse.data.versionExport > VERSION_EXPORT) {
    return {
      status: 'refus',
      raison: `Ce fichier vient d'une version plus récente de l'app (format ${String(analyse.data.versionExport)}, l'app lit jusqu'au ${String(VERSION_EXPORT)}). Mets l'app à jour avant de l'importer.`,
      details: [],
    }
  }

  return { status: 'ok', fichier: versFichierExport(analyse.data) }
}

/**
 * Le seul endroit de l'app où l'on affirme une forme au compilateur, et il est
 * cerné.
 *
 * Zod exprime une propriété facultative comme `T | undefined`, là où
 * `exactOptionalPropertyTypes` exige une propriété **absente** ; il rend des
 * tableaux mutables là où le moteur les veut `readonly` ; et un `number` là où
 * le moteur attend un `Cents` nominal. Les trois divergences sont de type, pas
 * de forme : après un aller-retour JSON les clés facultatives sont réellement
 * absentes (`JSON.stringify` les supprime), et les entiers viennent d'être
 * validés par les schémas.
 *
 * Ce qui compte est vérifié à l'exécution : `DON-05` (aller-retour identique),
 * `DON-08` (champ mal typé refusé) et `DON-19` (réglages minimaux).
 */
function versFichierExport(valide: unknown): FichierExport {
  return valide as FichierExport
}

/**
 * Import **atomique** : tout passe par une transaction Dexie, donc une erreur en
 * cours de route laisse la base exactement dans l'état d'avant. Le mode est
 * explicite, jamais implicite (`DON-12`).
 */
export async function importer(
  base: BaseMesHeures,
  contenu: string,
  mode: 'remplacement' | 'fusion',
): Promise<ResultatImport> {
  const lecture = lireFichier(contenu)
  if (lecture.status === 'refus') {
    return { status: 'refus', raison: lecture.raison, details: lecture.details }
  }

  const migre = migrer(lecture.fichier)

  await base.transaction(
    'rw',
    [
      base.settings,
      base.workDays,
      base.absences,
      base.templates,
      base.payChecks,
      base.qualifications,
      base.saisiesIndemnites,
    ],
    async () => {
      if (mode === 'remplacement') {
        await Promise.all([
          base.settings.clear(),
          base.workDays.clear(),
          base.absences.clear(),
          base.templates.clear(),
          base.payChecks.clear(),
          base.qualifications.clear(),
          base.saisiesIndemnites.clear(),
        ])
      }

      await base.settings.put({ ...migre.settings, id: ID_SETTINGS })
      await base.workDays.bulkPut([...migre.workDays])
      await base.absences.bulkPut([...migre.absences])
      await base.templates.bulkPut([...migre.templates])
      await base.payChecks.bulkPut([...migre.payChecks])
      await base.qualifications.bulkPut([...migre.qualifications])
      await base.saisiesIndemnites.bulkPut([...migre.saisiesIndemnites])
    },
  )

  // La date du dernier export n'est **pas** touchée : un import n'est pas une
  // sauvegarde, et le faire croire priverait le conducteur d'un rappel.
  return {
    status: 'ok',
    compte: {
      journees: migre.workDays.length,
      absences: migre.absences.length,
      modeles: migre.templates.length,
      fichesDePaie: migre.payChecks.length,
      qualifications: migre.qualifications.length,
      saisiesIndemnites: migre.saisiesIndemnites.length,
    },
  }
}

/**
 * Montée de version d'un fichier ancien. Aujourd'hui la seule version est la 1 :
 * la fonction existe pour que la première migration réelle soit un `case` de
 * plus, et non une réécriture.
 */
function migrer(fichier: FichierExport): FichierExport {
  return fichier
}


// ————————————————————————————————————————————————————————————————
// Rappels de sauvegarde
// ————————————————————————————————————————————————————————————————

export const JOURS_AVANT_RAPPEL = 14
export const JOURS_AVANT_ALERTE = 30

export type EtatSauvegarde =
  | { readonly niveau: 'ok'; readonly joursDepuis: number }
  | { readonly niveau: 'rappel'; readonly joursDepuis: number; readonly message: string }
  | { readonly niveau: 'alerte'; readonly joursDepuis: number; readonly message: string }
  | { readonly niveau: 'jamais'; readonly message: string }

export function etatSauvegarde(
  dernierExportMillis: number | undefined,
  maintenantMillis: number,
  stockagePersistant: 'accorde' | 'refuse' | undefined,
): EtatSauvegarde {
  const renfort =
    stockagePersistant === 'accorde'
      ? ''
      : " Le navigateur n'a pas garanti la conservation de tes données : une sauvegarde est ta seule protection."

  if (dernierExportMillis === undefined) {
    return {
      niveau: 'jamais',
      message: `Tu n'as encore jamais exporté tes données.${renfort}`,
    }
  }

  const joursDepuis = Math.floor((maintenantMillis - dernierExportMillis) / 86_400_000)

  if (joursDepuis >= JOURS_AVANT_ALERTE) {
    return {
      niveau: 'alerte',
      joursDepuis,
      message: `Ta dernière sauvegarde date de ${String(joursDepuis)} jours. Si tu perds ton téléphone, tu perds tout.${renfort}`,
    }
  }
  if (joursDepuis >= JOURS_AVANT_RAPPEL) {
    return {
      niveau: 'rappel',
      joursDepuis,
      message: `Ta dernière sauvegarde date de ${String(joursDepuis)} jours. C'est le moment d'exporter.${renfort}`,
    }
  }
  return { niveau: 'ok', joursDepuis }
}

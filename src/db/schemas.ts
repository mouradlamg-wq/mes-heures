import { z } from 'zod'
import type {
  Absence,
  DayTemplate,
  IndemniteConfig,
  PayCheck,
  QualificationManuelle,
  SaisieIndemnite,
  Segment,
  Settings,
  WorkDay,
} from '../engine'

/**
 * Validation d'entrée (SPEC §12). Zod garde la porte : un JSON corrompu est
 * **refusé proprement**, avec le champ fautif nommé, et les données existantes
 * restent intactes.
 *
 * Ces schémas décrivent la **forme stockée**. Ils ne calculent rien : la
 * persistance n'importe du moteur que des types (CLAUDE.md §4).
 */

const entier = z.number().int()

/** Chaîne ISO 8601 **avec offset**, à la minute. Le stockage n'accepte rien d'autre. */
export const isoDateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:00)?(Z|[+-]\d{2}:\d{2})$/,
    "un instant complet, avec son décalage horaire (par exemple 2027-03-16T06:00:00+01:00)",
  )

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'une date au format AAAA-MM-JJ')

const heureHorloge = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "une heure au format HH:mm")

const cents = entier
const minutes = entier.nonnegative()

export const typeSegment = z.enum(['conduite', 'autre_travail', 'disponibilite', 'coupure'])

export const segmentSchema = z.object({
  id: z.string().min(1),
  type: typeSegment,
  debut: isoDateTime.optional(),
  fin: isoDateTime.optional(),
})

export const workDaySchema = z.object({
  id: z.string().min(1),
  dateRattachement: isoDate,
  priseService: isoDateTime.optional(),
  finService: isoDateTime.optional(),
  segments: z.array(segmentSchema),
  decouche: z.boolean().optional(),
  lieuFin: z.string().optional(),
  templateId: z.string().optional(),
  note: z.string().optional(),
})

export const absenceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['CP', 'RTT', 'MALADIE', 'AT', 'RECUP', 'FORMATION', 'SANS_SOLDE', 'REPOS']),
  debut: isoDate,
  fin: isoDate,
  demiJournee: z.enum(['matin', 'apres_midi']).optional(),
  note: z.string().optional(),
})

const sourceLegale = z.object({
  kind: z.literal('legal'),
  texte: z.string(),
  article: z.string(),
})

const sourceConventionnelle = z.object({
  kind: z.literal('convention'),
  libelle: z.string(),
  saisiPar: z.literal('utilisateur'),
})

/**
 * Le type `RuleSource` du moteur autorise un `personnalise` dont la base est
 * elle-même `personnalise`. Le stockage est plus strict : une valeur
 * personnalisée dérive d'un texte ou d'une convention, jamais d'une autre
 * personnalisation — empiler les couches ne dirait plus rien de l'origine.
 */
export const ruleSourceSchema = z.union([
  sourceLegale,
  sourceConventionnelle,
  z.object({
    kind: z.literal('personnalise'),
    base: z.union([sourceLegale, sourceConventionnelle]).optional(),
  }),
])

export const indemniteConfigSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  libelle: z.string(),
  montantCents: cents.optional(),
  declencheur: z.enum(['plage_horaire', 'decouche', 'duree_service', 'quantite_manuelle']),
  plageDebut: heureHorloge.optional(),
  plageFin: heureHorloge.optional(),
  dureeMinMinutes: minutes.optional(),
  typesSegmentEligibles: z.array(typeSegment).optional(),
  amplitudeMinMinutes: minutes.optional(),
  quantiteMaxParJour: entier.positive().optional(),
  incompatibleAvec: z.array(z.string()).optional(),
  source: ruleSourceSchema,
})

export const settingsSchema = z.object({
  // Seul champ obligatoire (SPEC §9).
  timeZoneReference: z.string().min(1),
  entreprise: z.string().optional(),
  domicile: z.string().optional(),

  tauxHoraireBaseCents: cents.optional(),
  modeDecompteHS: z.enum(['hebdomadaire', 'mensuel', 'periode_reference']).optional(),
  debutSemaine: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
  ]).optional(),
  dureeReferenceMinutes: minutes.optional(),
  periodeReferenceSemaines: entier.positive().optional(),
  periodeReferenceDebut: isoDate.optional(),
  rattachementSemaineChevauchante: z
    .enum(['periode_de_fin', 'periode_de_debut', 'prorata'])
    .optional(),
  tranchesHS: z
    .array(
      z.object({
        deMinutes: minutes,
        aMinutes: minutes.nullable(),
        majorationPct: z.number().optional(),
      }),
    )
    .optional(),
  estForfaitJours: z.boolean().optional(),

  fractionDisponibiliteRemuneree: z.number().min(0).max(1).optional(),
  coupuresRemunerees: z
    .array(z.object({ auDelaDeMinutes: minutes, fraction: z.number().min(0).max(1) }))
    .optional(),

  indemnites: z.array(indemniteConfigSchema),
  payPeriodConfig: z.object({ jourDebut: entier.min(1).max(31) }).optional(),
})

export const dayTemplateSchema = z.object({
  id: z.string().min(1),
  libelle: z.string(),
  segmentsRelatifs: z.array(
    z.object({
      type: typeSegment,
      debutRelatifMinutes: minutes,
      finRelatifMinutes: minutes,
    }),
  ),
  decoucheParDefaut: z.boolean().optional(),
})

export const payCheckSchema = z.object({
  id: z.string().min(1),
  payPeriodId: z.string().min(1),
  heuresPayeesCentiemes: z.number().optional(),
  heuresSupPayees: z.number().optional(),
  indemnitesPayees: z
    .array(
      z.object({
        code: z.string(),
        quantite: z.number().optional(),
        montantCents: cents.optional(),
      }),
    )
    .optional(),
  brutCents: cents.optional(),
})

export const qualificationManuelleSchema = z.object({
  id: z.string().min(1),
  dayId: z.string().min(1),
  debut: isoDateTime,
  fin: isoDateTime,
  type: typeSegment,
})

export const saisieIndemniteSchema = z.object({
  id: z.string().min(1),
  dayId: z.string().min(1),
  code: z.string().min(1),
  quantite: z.number(),
})

/** Version du **format d'échange**, distincte de la version du schéma Dexie. */
export const VERSION_EXPORT = 1

export const exportSchema = z.object({
  formatExport: z.literal('mes-heures'),
  versionExport: entier.positive(),
  exporteLe: isoDateTime,
  settings: settingsSchema,
  workDays: z.array(workDaySchema),
  absences: z.array(absenceSchema),
  templates: z.array(dayTemplateSchema),
  payChecks: z.array(payCheckSchema),
  qualifications: z.array(qualificationManuelleSchema),
  saisiesIndemnites: z.array(saisieIndemniteSchema),
})

/** Ce que Zod produit après validation — formes mutables, entiers non marqués. */
export type SortieExportSchema = z.infer<typeof exportSchema>

// ————————————————————————————————————————————————————————————————
// Contrôle de parité schéma ↔ moteur, à la compilation
// ————————————————————————————————————————————————————————————————

/**
 * On ne peut pas écrire `satisfies z.ZodType<WorkDay>` : Zod produit un `number`
 * là où le moteur attend un `Cents` ou un `Minutes` nominal, et un
 * `string | undefined` là où `exactOptionalPropertyTypes` attend une propriété
 * absente. Les deux divergences sont voulues — le schéma décrit la **forme
 * stockée**, le moteur décrit la **forme calculée**.
 *
 * Ce qu'on veut vraiment vérifier, c'est qu'aucun champ n'a été oublié ni
 * ajouté. C'est ce que fait ce type : ajouter un champ à `WorkDay` sans
 * l'ajouter au schéma casse la compilation, avec le nom du champ dans le
 * message d'erreur.
 */
type MemesChamps<Schema, Domaine> =
  Exclude<keyof Domaine, keyof Schema> extends never
    ? Exclude<keyof Schema, keyof Domaine> extends never
      ? true
      : { champsEnTropDansLeSchema: Exclude<keyof Schema, keyof Domaine> }
    : { champsAbsentsDuSchema: Exclude<keyof Domaine, keyof Schema> }

type Controles = {
  readonly segment: MemesChamps<z.infer<typeof segmentSchema>, Segment>
  readonly workDay: MemesChamps<z.infer<typeof workDaySchema>, WorkDay>
  readonly absence: MemesChamps<z.infer<typeof absenceSchema>, Absence>
  readonly indemnite: MemesChamps<z.infer<typeof indemniteConfigSchema>, IndemniteConfig>
  readonly settings: MemesChamps<z.infer<typeof settingsSchema>, Settings>
  readonly template: MemesChamps<z.infer<typeof dayTemplateSchema>, DayTemplate>
  readonly payCheck: MemesChamps<z.infer<typeof payCheckSchema>, PayCheck>
  readonly qualification: MemesChamps<
    z.infer<typeof qualificationManuelleSchema>,
    QualificationManuelle
  >
  readonly saisieIndemnite: MemesChamps<
    z.infer<typeof saisieIndemniteSchema>,
    SaisieIndemnite
  >
}

/** N'existe qu'à la compilation. Chaque `true` est une vérification. */
export const PARITE_SCHEMA_MOTEUR: Controles = {
  segment: true,
  workDay: true,
  absence: true,
  indemnite: true,
  settings: true,
  template: true,
  payCheck: true,
  qualification: true,
  saisieIndemnite: true,
}

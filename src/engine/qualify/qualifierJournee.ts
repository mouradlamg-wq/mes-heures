import { minutes, type Minutes } from '../primitives/brands'
import {
  complete,
  partial,
  unknown,
  type CalculationResult,
  type CalculationWarning,
} from '../primitives/calculationResult'
import { formatDuree } from '../primitives/format'
import { TYPES_SEGMENT, type QualificationManuelle, type TypeSegment, type WorkDay } from '../domain'
import { dureeEntreMillis, heureMuraleDe, lireInstant } from '../time/instant'
import { formatInstant } from '../time/localTime'
import { CODES, type JourneeQualifiee, type ZoneIndeterminee, type ZoneQualifiee } from './types'

/**
 * Étage « Qualification des données » du pipeline (SPEC §2, §6).
 *
 * Principe unique : **le moteur ne fabrique jamais une qualification qu'il ne
 * peut pas déduire.** Deux segments de types différents qui se chevauchent, un
 * trou entre deux segments : il les signale et exclut la zone du calcul certain,
 * il n'arbitre pas.
 *
 * La méthode est un balayage : on découpe la journée aux frontières de tous les
 * segments, puis on regarde combien de **types distincts** couvrent chaque
 * tranche élémentaire. Zéro type dans l'amplitude = trou. Un type = qualifié —
 * et c'est ce qui fait tomber la fusion de deux segments de même type sans
 * traitement particulier. Deux types ou plus = indéterminé.
 */
export function qualifierJournee(
  jour: WorkDay,
  zoneReference: string,
  qualificationsManuelles: readonly QualificationManuelle[] = [],
): JourneeQualifiee {
  const warnings: CalculationWarning[] = []

  const prise = lireBorne(jour.priseService, 'Prise de service', jour.id, warnings)
  const fin = lireBorne(jour.finService, 'Fin de service', jour.id, warnings)

  if (jour.priseService === undefined) {
    warnings.push({
      code: CODES.PRISE_ABSENTE,
      message: "La prise de service n'est pas saisie : le début de la journée est ouvert.",
      dayId: jour.id,
    })
  }
  if (jour.finService === undefined) {
    warnings.push({
      code: CODES.FIN_ABSENTE,
      message: "La fin de service n'est pas saisie : la fin de la journée est ouverte.",
      dayId: jour.id,
    })
  }

  const amplitude = calculerAmplitude(prise, fin, jour.id, zoneReference, warnings)
  const morceaux = collecterMorceaux(jour, qualificationsManuelles, warnings)

  const { zones, zonesIndeterminees } = balayer(morceaux, prise, fin, zoneReference)

  for (const zone of zones) {
    if (zone.horsAmplitude) {
      warnings.push({
        code: CODES.SEGMENT_HORS_AMPLITUDE,
        message: `Un segment déborde de l'amplitude déclarée (${heureMuraleDe(zone.debut, zoneReference)} → ${heureMuraleDe(zone.fin, zoneReference)}). Il est compté, mais vérifie tes horaires.`,
        dayId: jour.id,
      })
    }
  }

  for (const zone of zonesIndeterminees) {
    warnings.push(messageZoneIndeterminee(zone, jour.id, zoneReference))
  }

  const tempsIndetermine = minutes(
    zonesIndeterminees.reduce<number>((total, z) => total + z.duree, 0),
  )

  const journeeVide =
    jour.priseService === undefined &&
    jour.finService === undefined &&
    zones.length === 0 &&
    zonesIndeterminees.length === 0

  if (journeeVide) {
    warnings.push({
      code: CODES.JOURNEE_VIDE,
      message: "Cette journée ne contient aucune saisie : il n'y a rien à borner.",
      dayId: jour.id,
    })
  }

  return {
    dayId: jour.id,
    dateRattachement: jour.dateRattachement,
    amplitude,
    zones,
    zonesIndeterminees,
    // Une journée dont l'amplitude est inconnue n'est pas bornable : ni prise,
    // ni fin, ni les deux. On ne peut donc rien dire de ses durées — pas même
    // « zéro ».
    dureeParType: dureesParType(
      zones,
      tempsIndetermine,
      jour.id,
      amplitude.status !== 'complete',
      amplitude.warnings.at(-1),
      warnings,
    ),
    tempsIndetermine,
    warnings,
    complete:
      !journeeVide &&
      zonesIndeterminees.length === 0 &&
      amplitude.status === 'complete' &&
      warnings.every((w) => !STATUTS_OUVRANTS.has(w.code)),
  }
}

/** Avertissements qui empêchent une journée d'être déclarée complète. */
const STATUTS_OUVRANTS = new Set<string>([
  CODES.PRISE_ABSENTE,
  CODES.FIN_ABSENTE,
  CODES.FIN_AVANT_PRISE,
  CODES.SEGMENT_OUVERT,
  CODES.SEGMENT_SANS_BORNE,
  CODES.INSTANT_ILLISIBLE,
  CODES.JOURNEE_VIDE,
])

// ————————————————————————————————————————————————————————————————
// Amplitude
// ————————————————————————————————————————————————————————————————

function calculerAmplitude(
  prise: number | undefined,
  fin: number | undefined,
  dayId: string,
  zoneReference: string,
  warnings: CalculationWarning[],
): CalculationResult<Minutes> {
  if (prise === undefined || fin === undefined) {
    return unknown(
      {
        code: prise === undefined ? CODES.PRISE_ABSENTE : CODES.FIN_ABSENTE,
        message:
          prise === undefined
            ? "L'amplitude ne peut pas être calculée : la prise de service manque."
            : "L'amplitude ne peut pas être calculée : la fin de service manque.",
        dayId,
      },
      { inputs: entreesBornes(prise, fin, dayId, zoneReference) },
    )
  }

  if (fin < prise) {
    const raison: CalculationWarning = {
      code: CODES.FIN_AVANT_PRISE,
      message:
        "La fin de service précède la prise de service. Vérifie si la journée passe minuit : dans ce cas la fin est le lendemain.",
      dayId,
    }
    warnings.push(raison)
    return unknown(raison, { inputs: entreesBornes(prise, fin, dayId, zoneReference) })
  }

  // `fin − début` : information brute, donc **aucune** RuleSource (SPEC §4).
  return complete(dureeEntreMillis(prise, fin), {
    inputs: entreesBornes(prise, fin, dayId, zoneReference),
  })
}

function entreesBornes(
  prise: number | undefined,
  fin: number | undefined,
  dayId: string,
  zoneReference: string,
): CalculationResult<Minutes>['inputs'] {
  const entrees: CalculationResult<Minutes>['inputs'][number][] = []
  if (prise !== undefined) {
    entrees.push({
      label: 'Prise de service',
      value: heureMuraleDe(formatInstant(prise, zoneReference), zoneReference),
      origin: 'saisie_utilisateur',
      dayId,
    })
  }
  if (fin !== undefined) {
    entrees.push({
      label: 'Fin de service',
      value: heureMuraleDe(formatInstant(fin, zoneReference), zoneReference),
      origin: 'saisie_utilisateur',
      dayId,
    })
  }
  return entrees
}

// ————————————————————————————————————————————————————————————————
// Collecte des morceaux
// ————————————————————————————————————————————————————————————————

type Morceau = {
  readonly debut: number
  readonly fin: number
  readonly type: TypeSegment
  readonly origine: 'segment' | 'manuelle'
}

function collecterMorceaux(
  jour: WorkDay,
  qualificationsManuelles: readonly QualificationManuelle[],
  warnings: CalculationWarning[],
): Morceau[] {
  const morceaux: Morceau[] = []

  for (const segment of jour.segments) {
    if (segment.debut === undefined && segment.fin === undefined) {
      warnings.push({
        code: CODES.SEGMENT_SANS_BORNE,
        message: `Un segment « ${segment.type} » n'a ni début ni fin : sa durée n'est pas devinée.`,
        dayId: jour.id,
      })
      continue
    }
    if (segment.debut === undefined || segment.fin === undefined) {
      warnings.push({
        code: CODES.SEGMENT_OUVERT,
        message: `Un segment « ${segment.type} » n'a pas de ${segment.debut === undefined ? 'début' : 'fin'} : sa durée n'est pas devinée.`,
        dayId: jour.id,
      })
      continue
    }

    const debut = lireBorne(segment.debut, 'Début de segment', jour.id, warnings)
    const fin = lireBorne(segment.fin, 'Fin de segment', jour.id, warnings)
    if (debut === undefined || fin === undefined) {
      continue
    }
    if (fin < debut) {
      warnings.push({
        code: CODES.FIN_AVANT_PRISE,
        message: `Un segment « ${segment.type} » se termine avant de commencer.`,
        dayId: jour.id,
      })
      continue
    }
    morceaux.push({ debut, fin, type: segment.type, origine: 'segment' })
  }

  for (const qualification of qualificationsManuelles) {
    if (qualification.dayId !== jour.id) {
      continue
    }
    const debut = lireBorne(qualification.debut, 'Zone qualifiée', jour.id, warnings)
    const fin = lireBorne(qualification.fin, 'Zone qualifiée', jour.id, warnings)
    if (debut === undefined || fin === undefined || fin < debut) {
      continue
    }
    morceaux.push({ debut, fin, type: qualification.type, origine: 'manuelle' })
  }

  return morceaux
}

function lireBorne(
  iso: string | undefined,
  label: string,
  dayId: string,
  warnings: CalculationWarning[],
): number | undefined {
  if (iso === undefined) {
    return undefined
  }
  const lecture = lireInstant(iso)
  if (lecture.status === 'invalid') {
    warnings.push({
      code: CODES.INSTANT_ILLISIBLE,
      message: `${label} : ${lecture.reason}`,
      dayId,
    })
    return undefined
  }
  return lecture.millis
}

// ————————————————————————————————————————————————————————————————
// Balayage
// ————————————————————————————————————————————————————————————————

type Tranche = {
  debut: number
  fin: number
  readonly types: readonly TypeSegment[]
  readonly origines: Set<'segment' | 'manuelle'>
}

function balayer(
  morceaux: readonly Morceau[],
  prise: number | undefined,
  fin: number | undefined,
  zoneReference: string,
): { zones: ZoneQualifiee[]; zonesIndeterminees: ZoneIndeterminee[] } {
  const amplitude =
    prise !== undefined && fin !== undefined && fin >= prise
      ? { debut: prise, fin }
      : undefined

  const frontieres = new Set<number>()
  for (const morceau of morceaux) {
    frontieres.add(morceau.debut)
    frontieres.add(morceau.fin)
  }
  if (amplitude !== undefined) {
    frontieres.add(amplitude.debut)
    frontieres.add(amplitude.fin)
  }

  const points = [...frontieres].sort((a, b) => a - b)
  const tranches: Tranche[] = []

  for (let i = 0; i + 1 < points.length; i += 1) {
    const debut = points[i]!
    const finTranche = points[i + 1]!
    const couvrants = morceaux.filter((m) => m.debut <= debut && m.fin >= finTranche)

    // Ce sont les **types distincts** qui comptent : deux segments « conduite »
    // qui se chevauchent n'en font qu'un, sans code de fusion dédié.
    const types = [...new Set(couvrants.map((m) => m.type))].sort()
    const dansAmplitude =
      amplitude !== undefined && debut >= amplitude.debut && finTranche <= amplitude.fin

    // Hors amplitude, une tranche sans aucun type n'est pas un trou : c'est du
    // temps qui n'appartient pas à la journée.
    if (types.length === 0 && !dansAmplitude) {
      continue
    }

    tranches.push({
      debut,
      fin: finTranche,
      types,
      origines: new Set(couvrants.map((m) => m.origine)),
    })
  }

  const zones: ZoneQualifiee[] = []
  const zonesIndeterminees: ZoneIndeterminee[] = []

  for (const tranche of fusionnerAdjacentes(tranches)) {
    const duree = dureeEntreMillis(tranche.debut, tranche.fin)
    if (duree === 0) {
      continue
    }
    const debutISO = formatInstant(tranche.debut, zoneReference)
    const finISO = formatInstant(tranche.fin, zoneReference)

    if (tranche.types.length === 1) {
      zones.push({
        debut: debutISO,
        fin: finISO,
        duree,
        type: tranche.types[0]!,
        origine: tranche.origines.has('manuelle') ? 'manuelle' : 'segment',
        horsAmplitude:
          amplitude === undefined ||
          tranche.debut < amplitude.debut ||
          tranche.fin > amplitude.fin,
      })
      continue
    }

    if (tranche.types.length === 0) {
      zonesIndeterminees.push({ debut: debutISO, fin: finISO, duree, cause: 'trou' })
      continue
    }

    zonesIndeterminees.push({
      debut: debutISO,
      fin: finISO,
      duree,
      cause: 'chevauchement',
      typesEnConflit: tranche.types,
    })
  }

  return { zones, zonesIndeterminees }
}

function fusionnerAdjacentes(tranches: readonly Tranche[]): Tranche[] {
  const fusionnees: Tranche[] = []
  for (const tranche of tranches) {
    const precedente = fusionnees.at(-1)
    if (
      precedente !== undefined &&
      precedente.fin === tranche.debut &&
      memeClassification(precedente.types, tranche.types)
    ) {
      for (const origine of tranche.origines) {
        precedente.origines.add(origine)
      }
      precedente.fin = tranche.fin
      continue
    }
    fusionnees.push({ ...tranche, origines: new Set(tranche.origines) })
  }
  return fusionnees
}

function memeClassification(a: readonly TypeSegment[], b: readonly TypeSegment[]): boolean {
  return a.length === b.length && a.every((type, index) => type === b[index])
}

// ————————————————————————————————————————————————————————————————
// Durées par type
// ————————————————————————————————————————————————————————————————

function dureesParType(
  zones: readonly ZoneQualifiee[],
  tempsIndetermine: Minutes,
  dayId: string,
  amplitudeInconnue: boolean,
  causeAmplitude: CalculationWarning | undefined,
  warnings: readonly CalculationWarning[],
): Readonly<Record<TypeSegment, CalculationResult<Minutes>>> {
  const entrees = TYPES_SEGMENT.map((type) => {
    /**
     * Journée non close : il manque une prise, une fin, ou les deux. Sans
     * amplitude, la borne haute n'existe pas — répondre `0 h 00` reviendrait à
     * affirmer qu'il ne s'est rien passé, alors qu'on l'ignore. Le SPEC §0 est
     * explicite : mieux vaut « je ne peux pas calculer ça ».
     */
    if (amplitudeInconnue) {
      return [
        type,
        unknown<Minutes>(
          causeAmplitude ?? {
            code: CODES.JOURNEE_VIDE,
            message: "Cette journée n'est pas assez renseignée pour être bornée.",
            dayId,
          },
          { warnings },
        ),
      ] as const
    }

    const certain = zones
      .filter((z) => z.type === type)
      .reduce<number>((total, z) => total + z.duree, 0)

    const preuves = {
      inputs: zones
        .filter((z) => z.type === type)
        .map((z) => ({
          label: `Segment ${type}`,
          value: z.duree,
          origin: z.origine === 'manuelle' ? ('saisie_utilisateur' as const) : ('derive' as const),
          dayId,
        })),
      warnings: warnings.filter((w) => w.code === CODES.ZONE_NON_QUALIFIEE),
      // Une durée brute ne porte aucune RuleSource : il n'y a pas de règle
      // derrière `fin − début` (SPEC §4).
      sources: [],
    }

    if (tempsIndetermine === 0) {
      return [type, complete(minutes(certain), preuves)] as const
    }

    // Bornes du SPEC §6 : la zone non qualifiée ne compte pas du tout, ou compte
    // entièrement pour ce type. Jamais un milieu arbitraire.
    return [
      type,
      partial<Minutes>({ min: minutes(certain), max: minutes(certain + tempsIndetermine) }, preuves),
    ] as const
  })

  return Object.fromEntries(entrees) as Readonly<Record<TypeSegment, CalculationResult<Minutes>>>
}

function messageZoneIndeterminee(
  zone: ZoneIndeterminee,
  dayId: string,
  zoneReference: string,
): CalculationWarning {
  const plage = `${heureMuraleDe(zone.debut, zoneReference)} → ${heureMuraleDe(zone.fin, zoneReference)}`
  const duree = formatDuree(zone.duree).sexagesimal

  if (zone.cause === 'chevauchement') {
    const types = (zone.typesEnConflit ?? []).join(' et ')
    return {
      code: CODES.CHEVAUCHEMENT,
      message: `${plage} : ${types} se chevauchent sur ${duree}. Le moteur n'arbitre pas — dis-lui ce que c'était.`,
      dayId,
    }
  }

  return {
    code: CODES.ZONE_NON_QUALIFIEE,
    message: `${plage} : ${duree} non qualifiées. Coupure, disponibilité ou autre travail ? Appuie pour le dire.`,
    dayId,
  }
}

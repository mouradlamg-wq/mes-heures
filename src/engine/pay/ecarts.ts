import type { Cents, Minutes } from '../primitives/brands'
import { bornes, type CalculationResult, type Statut } from '../primitives/calculationResult'
import { centiemesEnMinutes } from '../primitives/roundingPolicy'
import type { PayCheck, PayPeriod } from '../domain'
import type { DetailIntervalle } from './detail'
import type { SynthesePeriode } from './synthese'

/**
 * Écran « Vérifier ma paie » (SPEC §11, DESIGN §11).
 *
 * Le vocabulaire est **écart**, jamais erreur. Un écart n'est pas une accusation :
 * c'est la différence entre ce que l'app a compté et ce qui est écrit sur la
 * fiche, et elle peut venir des deux côtés.
 *
 * Deux règles dures :
 *
 * - **on n'additionne jamais des heures et des euros** dans un même total ;
 * - **on ne convertit pas des heures en euros** sans taux horaire renseigné.
 */

export type Unite = 'duree' | 'montant' | 'quantite'

export type Ecart = {
  /** Signé : positif quand l'app compte plus que la fiche. */
  readonly valeur: number
  /**
   * L'écart tombe dans l'incertitude d'un résultat `partial`. Ce n'est alors
   * pas un écart avéré : la fiche est compatible avec ce que l'app sait.
   */
  readonly dansIncertitude: boolean
}

type Commun = {
  readonly code: string
  readonly libelle: string
  /** Renseigné quand la ligne est comparable : calcul connu **et** fiche saisie. */
  readonly ecart?: Ecart
  /** Journées qui composent la valeur, pour remonter aux saisies. */
  readonly dayIds: readonly string[]
}

export type LigneEcart = Commun &
  (
    | { readonly unite: 'duree'; readonly calcule: CalculationResult<Minutes>; readonly fiche?: Minutes }
    | { readonly unite: 'montant'; readonly calcule: CalculationResult<Cents>; readonly fiche?: Cents }
    | { readonly unite: 'quantite'; readonly calcule: CalculationResult<number>; readonly fiche?: number }
  )

export type Comparaison = {
  readonly periode: PayPeriod
  readonly lignes: readonly LigneEcart[]

  /** Le chiffre du compteur : l'écart d'heures supplémentaires. */
  readonly ecartHeuresSup?: Ecart
  /** Sa sous-ligne : l'écart en euros sur les indemnités. Jamais additionné. */
  readonly ecartIndemnites?: Ecart

  readonly lignesComparees: number
  readonly lignesIncalculables: number
  /** Statut de lecture de l'ensemble. */
  readonly statut: Statut
}

export function comparerAvecFiche(
  periode: PayPeriod,
  synthese: SynthesePeriode,
  detail: DetailIntervalle,
  fiche: PayCheck | undefined,
): Comparaison {
  const dayIds = detail.lignes.flatMap((l) => (l.sorte === 'travail' ? [l.dayId] : []))

  const lignes: LigneEcart[] = []

  // ————— Heures supplémentaires —————
  const heuresSupFiche =
    fiche?.heuresSupPayees === undefined ? undefined : centiemesEnMinutes(fiche.heuresSupPayees)
  lignes.push(
    ligneDuree(
      'HEURES_SUP',
      'Heures supplémentaires',
      synthese.heuresSup.duree,
      heuresSupFiche,
      dayIds,
    ),
  )

  // ————— Indemnités, une ligne par code —————
  for (const indemnite of synthese.indemnites) {
    const relevee = fiche?.indemnitesPayees?.find((i) => i.code === indemnite.code)

    // La fiche porte souvent la quantité **et** le montant. On compare le
    // montant quand il est là : c'est ce qui se retrouve sur le net.
    if (relevee?.montantCents !== undefined || relevee?.quantite === undefined) {
      lignes.push(
        ligneMontant(
          indemnite.code,
          indemnite.libelle,
          indemnite.montant,
          relevee?.montantCents,
          dayIds,
        ),
      )
      continue
    }

    lignes.push({
      code: indemnite.code,
      libelle: indemnite.libelle,
      unite: 'quantite',
      calcule: quantiteCalculee(indemnite.quantite, indemnite.montant.status),
      fiche: relevee.quantite,
      ...ecartDe(indemnite.quantite, relevee.quantite, indemnite.montant.status === 'partial'),
      dayIds,
    })
  }

  // ————— Temps rémunéré —————
  const tempsFiche =
    fiche?.heuresPayeesCentiemes === undefined
      ? undefined
      : centiemesEnMinutes(fiche.heuresPayeesCentiemes)
  lignes.push(
    ligneDuree('TEMPS_REMUNERE', 'Temps rémunéré du mois', detail.total, tempsFiche, dayIds),
  )

  // ————— Brut, seulement s'il a été relevé —————
  if (fiche?.brutCents !== undefined) {
    lignes.push(ligneMontant('BRUT', 'Brut du mois', synthese.brut, fiche.brutCents, dayIds))
  }

  const comparees = lignes.filter((l) => l.ecart !== undefined).length
  const incalculables = lignes.filter((l) => l.calcule.status === 'unknown').length

  const ligneHS = lignes.find((l) => l.code === 'HEURES_SUP')
  const ecartIndemnites = cumulIndemnites(lignes)

  return {
    periode,
    lignes,
    ...(ligneHS?.ecart === undefined ? {} : { ecartHeuresSup: ligneHS.ecart }),
    ...(ecartIndemnites === undefined ? {} : { ecartIndemnites }),
    lignesComparees: comparees,
    lignesIncalculables: incalculables,
    statut: statutDEnsemble(lignes),
  }
}

// ————————————————————————————————————————————————————————————————
// Construction des lignes
// ————————————————————————————————————————————————————————————————

function ligneDuree(
  code: string,
  libelle: string,
  calcule: CalculationResult<Minutes>,
  fiche: Minutes | undefined,
  dayIds: readonly string[],
): LigneEcart {
  return {
    code,
    libelle,
    unite: 'duree',
    calcule,
    ...(fiche === undefined ? {} : { fiche }),
    ...ecartDeResultat(calcule, fiche),
    dayIds,
  }
}

function ligneMontant(
  code: string,
  libelle: string,
  calcule: CalculationResult<Cents>,
  fiche: Cents | undefined,
  dayIds: readonly string[],
): LigneEcart {
  return {
    code,
    libelle,
    unite: 'montant',
    calcule,
    ...(fiche === undefined ? {} : { fiche }),
    ...ecartDeResultat(calcule, fiche),
    dayIds,
  }
}

/**
 * Écart entre un résultat du moteur et la valeur relevée.
 *
 * Rien n'est produit si l'un des deux manque : une ligne non comparée n'est
 * **pas** un écart de zéro. Sur un résultat `partial`, l'écart se mesure depuis
 * la borne la plus proche, et il est marqué comme compatible avec l'incertitude
 * quand la fiche tombe dans l'intervalle.
 */
function ecartDeResultat<T extends number>(
  calcule: CalculationResult<T>,
  fiche: number | undefined,
): { ecart?: Ecart } {
  if (fiche === undefined) {
    return {}
  }
  const b = bornes(calcule)
  if (b === undefined) {
    return {}
  }

  if (fiche >= b.min && fiche <= b.max) {
    // La fiche est compatible avec ce que l'app sait : l'écart le plus honnête
    // est zéro, mais on dit d'où il vient.
    return { ecart: { valeur: 0, dansIncertitude: b.min !== b.max } }
  }

  const valeur = fiche < b.min ? b.min - fiche : b.max - fiche
  return { ecart: { valeur, dansIncertitude: false } }
}

function ecartDe(
  calcule: number,
  fiche: number,
  incertain: boolean,
): { ecart?: Ecart } {
  return { ecart: { valeur: calcule - fiche, dansIncertitude: incertain } }
}

function quantiteCalculee(quantite: number, statut: Statut): CalculationResult<number> {
  // Une quantité d'indemnités est un décompte : elle suit le statut de la ligne
  // dont elle est issue.
  return statut === 'unknown'
    ? { status: 'unknown', inputs: [], steps: [], warnings: [], sources: [] }
    : { status: 'complete', value: quantite, inputs: [], steps: [], warnings: [], sources: [] }
}

/**
 * Somme des écarts **en euros** des seules lignes d'indemnités. Les heures n'y
 * entrent jamais : additionner des heures et des euros produirait un nombre qui
 * ne veut rien dire (DESIGN §11).
 */
function cumulIndemnites(lignes: readonly LigneEcart[]): Ecart | undefined {
  const ecarts = lignes.flatMap((l) =>
    l.unite === 'montant' && l.code !== 'BRUT' && l.code !== 'TEMPS_REMUNERE' && l.ecart !== undefined
      ? [l.ecart]
      : [],
  )
  if (ecarts.length === 0) {
    return undefined
  }
  return {
    valeur: ecarts.reduce<number>((total, e) => total + e.valeur, 0),
    dansIncertitude: ecarts.some((e) => e.dansIncertitude),
  }
}

function statutDEnsemble(lignes: readonly LigneEcart[]): Statut {
  if (lignes.every((l) => l.calcule.status === 'unknown')) {
    return 'unknown'
  }
  return lignes.some((l) => l.calcule.status !== 'complete') ? 'partial' : 'complete'
}

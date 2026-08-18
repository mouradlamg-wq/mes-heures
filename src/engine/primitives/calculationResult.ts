/**
 * Le contrat de sortie du moteur (SPEC §4, CLAUDE.md §7).
 *
 * Aucune fonction publique du moteur ne retourne un nombre nu. Elle retourne un
 * `CalculationResult`, qui porte la valeur *et* de quoi la déplier jusqu'aux
 * saisies et aux réglages qui l'ont produite.
 */

export type Statut = 'complete' | 'partial' | 'unknown'

export type CalculationInput = {
  /** Lisible par un conducteur : « Prise de service », pas « priseService ». */
  readonly label: string
  readonly value: number | string
  readonly origin: 'saisie_utilisateur' | 'reglage' | 'derive'
  readonly dayId?: string
}

export type CalculationStep = {
  readonly label: string
  readonly detail: string
  readonly value: number
}

export type CalculationWarning = {
  /** Identifiant technique, pour que l'UI sache quel réglage ouvrir. */
  readonly code: string
  /** Phrase en français, affichable telle quelle. */
  readonly message: string
  readonly dayId?: string
  /** Réglage à renseigner pour lever l'incertitude, s'il y en a un. */
  readonly reglageManquant?: string
}

export type RuleSource =
  | { readonly kind: 'legal'; readonly texte: string; readonly article: string }
  | { readonly kind: 'convention'; readonly libelle: string; readonly saisiPar: 'utilisateur' }
  | { readonly kind: 'personnalise'; readonly base?: RuleSource }

export type Range<T> = { readonly min: T; readonly max: T }

type Preuves = {
  readonly inputs: readonly CalculationInput[]
  readonly steps: readonly CalculationStep[]
  readonly warnings: readonly CalculationWarning[]
  readonly sources: readonly RuleSource[]
}

export type CalculationResult<T> = Preuves &
  (
    | { readonly status: 'complete'; readonly value: T; readonly range?: undefined }
    | { readonly status: 'partial'; readonly value?: undefined; readonly range: Range<T> }
    | { readonly status: 'unknown'; readonly value?: undefined; readonly range?: undefined }
  )

/** Ce qu'un appelant fournit ; tout est optionnel, les tableaux valent `[]`. */
export type PreuvesPartielles = {
  readonly inputs?: readonly CalculationInput[]
  readonly steps?: readonly CalculationStep[]
  readonly warnings?: readonly CalculationWarning[]
  readonly sources?: readonly RuleSource[]
}

function normaliser(preuves: PreuvesPartielles | undefined): Preuves {
  return {
    inputs: preuves?.inputs ?? [],
    steps: preuves?.steps ?? [],
    warnings: preuves?.warnings ?? [],
    sources: dedupliquerSources(preuves?.sources ?? []),
  }
}

export function complete<T>(value: T, preuves?: PreuvesPartielles): CalculationResult<T> {
  return { status: 'complete', value, ...normaliser(preuves) }
}

/**
 * Incertitude bornée (SPEC §6). Le `range` est plus utile qu'un simple
 * `partial` : il dit au conducteur si l'écart avec sa fiche entre dans la zone
 * d'incertitude ou non.
 *
 * `min === max` n'est pas une incertitude : on renvoie un `complete`. C'est
 * volontairement silencieux — c'est une normalisation, pas une correction de
 * donnée métier.
 */
export function partial<T extends number>(
  range: Range<T>,
  preuves?: PreuvesPartielles,
): CalculationResult<T> {
  if (range.min > range.max) {
    throw new RangeError(
      `Intervalle inversé : min ${String(range.min)} > max ${String(range.max)}. ` +
        "C'est un bug de calcul, pas un cas métier.",
    )
  }
  if (range.min === range.max) {
    return complete(range.min, preuves)
  }
  return { status: 'partial', range, ...normaliser(preuves) }
}

/**
 * « Je ne peux pas calculer ça. » Ce n'est pas une erreur : c'est le résultat
 * honnête d'un réglage absent. Il ne `throw` jamais.
 */
export function unknown<T>(
  raison: CalculationWarning,
  preuves?: PreuvesPartielles,
): CalculationResult<T> {
  const base = normaliser(preuves)
  return { status: 'unknown', ...base, warnings: [...base.warnings, raison] }
}

// ————————————————————————————————————————————————————————————————
// Lecture
// ————————————————————————————————————————————————————————————————

export function estComplete<T>(
  resultat: CalculationResult<T>,
): resultat is CalculationResult<T> & { status: 'complete'; value: T } {
  return resultat.status === 'complete'
}

/**
 * Bornes d'un résultat, quel que soit son statut. Un `complete` est un
 * intervalle de largeur nulle : c'est ce qui permet aux combinateurs de traiter
 * les deux cas de la même façon.
 */
export function bornes<T extends number>(resultat: CalculationResult<T>): Range<T> | undefined {
  if (resultat.status === 'complete') {
    return { min: resultat.value, max: resultat.value }
  }
  if (resultat.status === 'partial') {
    return resultat.range
  }
  return undefined
}

/** Une valeur est-elle compatible avec ce résultat ? Sert aux écarts de paie. */
export function contient<T extends number>(resultat: CalculationResult<T>, valeur: T): boolean {
  const b = bornes(resultat)
  if (b === undefined) {
    return false
  }
  return valeur >= b.min && valeur <= b.max
}

// ————————————————————————————————————————————————————————————————
// Combinaison
// ————————————————————————————————————————————————————————————————

function fusionnerPreuves(resultats: readonly CalculationResult<unknown>[]): Preuves {
  return {
    inputs: resultats.flatMap((r) => r.inputs),
    steps: resultats.flatMap((r) => r.steps),
    warnings: resultats.flatMap((r) => r.warnings),
    sources: dedupliquerSources(resultats.flatMap((r) => r.sources)),
  }
}

function concatener(a: Preuves, b: PreuvesPartielles | undefined): PreuvesPartielles {
  const c = normaliser(b)
  return {
    inputs: [...a.inputs, ...c.inputs],
    steps: [...a.steps, ...c.steps],
    warnings: [...a.warnings, ...c.warnings],
    sources: [...a.sources, ...c.sources],
  }
}

/**
 * Somme de résultats numériques, avec propagation stricte du statut
 * (CLAUDE.md §5) :
 *
 * - un seul `unknown` rend la somme `unknown` — on ne borne pas ce qu'on ignore ;
 * - sinon, un seul `partial` rend la somme `partial`, bornes additionnées ;
 * - sinon `complete`.
 *
 * Les preuves de tous les termes sont conservées : c'est ce qui permet de
 * remonter d'un total de période jusqu'à un `dayId`.
 */
export function sommer<T extends number>(
  resultats: readonly CalculationResult<T>[],
  construire: (valeur: number) => T,
  preuves?: PreuvesPartielles,
): CalculationResult<T> {
  const fusion = fusionnerPreuves(resultats)
  const toutes = concatener(fusion, preuves)

  const inconnu = resultats.find((r) => r.status === 'unknown')
  if (inconnu !== undefined) {
    const raison = inconnu.warnings.at(-1) ?? {
      code: 'terme_incalculable',
      message: "Un des éléments du total ne peut pas être calculé.",
    }
    return unknown<T>(raison, toutes)
  }

  let min = 0
  let max = 0
  for (const r of resultats) {
    const b = bornes(r)
    /* c8 ignore next 3 — les `unknown` ont déjà été écartés au-dessus. */
    if (b === undefined) {
      continue
    }
    min += b.min
    max += b.max
  }

  return partial({ min: construire(min), max: construire(max) }, toutes)
}

/**
 * Transforme la valeur (ou les deux bornes) d'un résultat en conservant ses
 * preuves et son statut. Sert à passer d'une durée à un montant sans perdre la
 * traçabilité.
 */
export function transformer<A extends number, B extends number>(
  resultat: CalculationResult<A>,
  transformation: (valeur: A) => B,
  preuves?: PreuvesPartielles,
): CalculationResult<B> {
  const toutes = concatener(
    {
      inputs: resultat.inputs,
      steps: resultat.steps,
      warnings: resultat.warnings,
      sources: resultat.sources,
    },
    preuves,
  )

  switch (resultat.status) {
    case 'complete':
      return complete(transformation(resultat.value), toutes)
    case 'partial':
      return partial(
        { min: transformation(resultat.range.min), max: transformation(resultat.range.max) },
        toutes,
      )
    case 'unknown':
      // La raison est déjà dans les warnings du résultat d'origine : on la
      // laisse telle quelle plutôt que de la reformuler et d'en perdre la cause.
      return { status: 'unknown', ...normaliser(toutes) }
  }
}

/** Ajoute des preuves à un résultat sans toucher à sa valeur ni à son statut. */
export function annoter<T>(
  resultat: CalculationResult<T>,
  preuves: PreuvesPartielles,
): CalculationResult<T> {
  const base = normaliser(
    concatener(
      {
        inputs: resultat.inputs,
        steps: resultat.steps,
        warnings: resultat.warnings,
        sources: resultat.sources,
      },
      preuves,
    ),
  )
  switch (resultat.status) {
    case 'complete':
      return { status: 'complete', value: resultat.value, ...base }
    case 'partial':
      return { status: 'partial', range: resultat.range, ...base }
    case 'unknown':
      return { status: 'unknown', ...base }
  }
}

// ————————————————————————————————————————————————————————————————
// Sources
// ————————————————————————————————————————————————————————————————

function cleDeSource(source: RuleSource): string {
  switch (source.kind) {
    case 'legal':
      return `legal|${source.texte}|${source.article}`
    case 'convention':
      return `convention|${source.libelle}`
    case 'personnalise':
      return `personnalise|${source.base === undefined ? '' : cleDeSource(source.base)}`
  }
}

function dedupliquerSources(sources: readonly RuleSource[]): readonly RuleSource[] {
  const vues = new Set<string>()
  const uniques: RuleSource[] = []
  for (const source of sources) {
    const cle = cleDeSource(source)
    if (!vues.has(cle)) {
      vues.add(cle)
      uniques.push(source)
    }
  }
  return uniques
}

/**
 * L'utilisateur a modifié une valeur issue d'un texte : la source cesse d'être
 * présentée comme légale (SPEC §4).
 */
export function personnaliser(base?: RuleSource): RuleSource {
  return base === undefined ? { kind: 'personnalise' } : { kind: 'personnalise', base }
}

/**
 * Types nominaux pour l'argent et les durées (CLAUDE.md §6).
 *
 * Ce sont des `number` à l'exécution, mais TypeScript refuse qu'on passe une
 * durée là où un montant est attendu, et refuse qu'un flottant issu d'un calcul
 * intermédiaire franchisse la frontière du moteur sans passer par un
 * constructeur qui vérifie qu'il est entier.
 */

declare const marqueCents: unique symbol
declare const marqueMinutes: unique symbol

/** Montant en centimes entiers. Aucun flottant ne franchit la frontière du moteur. */
export type Cents = number & { readonly [marqueCents]: 'Cents' }

/** Durée en minutes entières. La saisie est à la minute, jamais à la seconde. */
export type Minutes = number & { readonly [marqueMinutes]: 'Minutes' }

/**
 * Un montant peut être négatif : une régularisation ou une retenue existe sur
 * une fiche de paie.
 */
export function cents(valeur: number): Cents {
  if (!Number.isInteger(valeur)) {
    throw new TypeError(
      `Un montant se compte en centimes entiers, reçu : ${String(valeur)}. ` +
        "Passe par roundingPolicy avant de franchir la frontière du moteur.",
    )
  }
  return valeur as Cents
}

/**
 * Une durée négative n'existe pas dans le métier : si on en fabrique une, c'est
 * qu'une fin précède une prise de service, et c'est un bug — pas un cas à
 * afficher.
 */
export function minutes(valeur: number): Minutes {
  if (!Number.isInteger(valeur)) {
    throw new TypeError(`Une durée se compte en minutes entières, reçu : ${String(valeur)}.`)
  }
  if (valeur < 0) {
    throw new RangeError(`Une durée ne peut pas être négative, reçu : ${String(valeur)} min.`)
  }
  return valeur as Minutes
}

export const ZERO_CENTS = cents(0)
export const ZERO_MINUTES = minutes(0)

/** Addition close sur le type : évite un `as Cents` disséminé dans le moteur. */
export function ajouterCents(...valeurs: readonly Cents[]): Cents {
  return cents(valeurs.reduce<number>((total, v) => total + v, 0))
}

export function ajouterMinutes(...valeurs: readonly Minutes[]): Minutes {
  return minutes(valeurs.reduce<number>((total, v) => total + v, 0))
}

/** Différence de deux montants — peut être négative, c'est un écart. */
export function soustraireCents(a: Cents, b: Cents): Cents {
  return cents(a - b)
}

/**
 * Différence de deux durées, exprimée comme un écart signé donc *pas* un
 * `Minutes`. L'écran « Vérifier ma paie » a besoin du signe.
 */
export function ecartMinutes(a: Minutes, b: Minutes): number {
  return a - b
}

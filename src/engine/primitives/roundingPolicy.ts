import { cents, minutes, type Cents, type Minutes } from './brands'

/**
 * Le seul point d'arrondi du moteur (SPEC §10, CLAUDE.md §6).
 *
 * Règle unique : **demi vers le haut en valeur absolue**, symétrique pour les
 * négatifs. `0,5 → 1` et `−0,5 → −1`. C'est la règle scolaire française, celle
 * qu'un conducteur refera de tête pour vérifier ; `Math.round` de JavaScript
 * arrondit `−0,5` vers `0`, ce qui casserait la symétrie sur une régularisation
 * négative.
 *
 * Rien d'autre dans le moteur n'arrondit. Tout appel ici produit un
 * `CalculationStep` visible côté appelant.
 */
export function arrondir(valeurExacte: number): number {
  if (!Number.isFinite(valeurExacte)) {
    throw new TypeError(`Valeur non finie à arrondir : ${String(valeurExacte)}`)
  }
  const absolu = Math.abs(valeurExacte)
  // Math.round est ici l'implémentation de « demi vers le haut », appliquée à une
  // valeur positive : c'est le seul endroit du moteur où il a le droit d'exister.
  const arrondiAbsolu = Math.round(corrigerErreurBinaire(absolu))
  return valeurExacte < 0 ? -arrondiAbsolu : arrondiAbsolu
}

/**
 * `1,005 * 100` vaut `100.49999999999999` en binaire. Sans cette correction,
 * un demi exact issu d'un calcul en virgule flottante s'arrondirait vers le bas
 * une fois sur deux, de façon imprévisible. On ramène la valeur à sa
 * représentation décimale la plus courte avant de décider.
 */
function corrigerErreurBinaire(valeurPositive: number): number {
  return Number(valeurPositive.toPrecision(12))
}

/** Arrondit une valeur monétaire exacte en centimes entiers. */
export function arrondirEnCents(valeurExacte: number): Cents {
  return cents(arrondir(valeurExacte))
}

/** Arrondit une durée exacte en minutes entières. */
export function arrondirEnMinutes(valeurExacte: number): Minutes {
  return minutes(arrondir(valeurExacte))
}

/**
 * Convertit des minutes en centièmes d'heure, la notation des fiches de paie
 * françaises. `20 min → 0,33 h`. Arrondi au centième, une seule fois.
 */
export function minutesEnCentiemes(duree: Minutes): number {
  return centiemesEntiers(duree) / 100
}

/**
 * Même conversion, exprimée en **nombre entier de centièmes** (`500 min → 833`).
 * C'est cette forme que consomme le formateur : elle lui permet d'écrire
 * `8,33 h` par découpage d'un entier, sans jamais passer par `toFixed` ni par un
 * flottant.
 */
export function centiemesEntiers(duree: Minutes): number {
  return arrondir((duree * 100) / 60)
}

/**
 * Conversion inverse, pour comparer avec une fiche de paie libellée en
 * centièmes. `18,25 h → 1095 min`.
 */
export function centiemesEnMinutes(centiemes: number): Minutes {
  return arrondirEnMinutes(centiemes * 60)
}

/**
 * Applique un taux horaire à une durée. Le produit reste exact jusqu'au dernier
 * moment : on ne convertit pas la durée en heures décimales avant de multiplier,
 * ce qui introduirait un arrondi en cascade.
 */
export function valoriser(duree: Minutes, tauxHoraire: Cents): Cents {
  return arrondirEnCents((duree * tauxHoraire) / 60)
}

/**
 * Applique une majoration exprimée en pourcentage à un montant.
 * `majorationPct = 25` sur 100,00 € donne 125,00 €.
 */
export function majorer(montant: Cents, majorationPct: number): Cents {
  return arrondirEnCents(montant * (1 + majorationPct / 100))
}

/**
 * Valorisation majorée en **une** opération : durée × taux × (1 + majoration),
 * arrondie une seule fois. Enchaîner `valoriser` puis `majorer` arrondirait deux
 * fois et pourrait dériver d'un centime — c'est exactement ce que le SPEC §10
 * interdit.
 */
export function valoriserMajore(
  duree: Minutes,
  tauxHoraire: Cents,
  majorationPct: number,
): Cents {
  return arrondirEnCents((duree * tauxHoraire * (1 + majorationPct / 100)) / 60)
}

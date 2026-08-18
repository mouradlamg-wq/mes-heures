/**
 * Rend exhaustif un `switch` sur une union. Si un jour un membre est ajouté à
 * l'union sans être traité, la compilation échoue ici — et non à l'exécution
 * chez un conducteur.
 */
export function assertNever(valeur: never, contexte?: string): never {
  const details = contexte === undefined ? '' : ` (${contexte})`
  throw new Error(`Cas non traité${details} : ${JSON.stringify(valeur)}`)
}

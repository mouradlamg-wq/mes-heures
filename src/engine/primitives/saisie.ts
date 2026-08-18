import { cents, minutes, type Cents, type Minutes } from './brands'

/**
 * Lecture et écriture des valeurs **saisies au clavier**.
 *
 * Ces conversions vivent dans le moteur, pas dans les composants : `h * 60 + mn`
 * et `centimes / 100` sont de l'arithmétique sur des durées et de l'argent, et
 * le CLAUDE.md §4 les interdit hors du moteur. C'est aussi la seule façon de les
 * tester sans DOM.
 *
 * Toutes les fonctions de lecture retournent `undefined` sur une saisie
 * incomplète ou hors plage : elles ne corrigent jamais.
 */

/** `'0740'` ou `'07:40'` → 460 minutes. Une durée, pas une heure d'horloge. */
export function lireDureeSaisie(texte: string): Minutes | undefined {
  const chiffres = texte.replace(/\D/g, '')
  if (chiffres.length < 3 || chiffres.length > 6) {
    return undefined
  }
  const mn = Number(chiffres.slice(-2))
  const heures = Number(chiffres.slice(0, -2))
  if (mn > 59) {
    return undefined
  }
  return minutes(heures * 60 + mn)
}

/** 460 → `'07:40'`. Format de saisie, pas d'affichage : pas d'espace insécable. */
export function ecrireDureeSaisie(duree: Minutes): string {
  const heures = Math.trunc(duree / 60)
  const reste = duree - heures * 60
  return `${String(heures).padStart(2, '0')}:${String(reste).padStart(2, '0')}`
}

/** `'1345'` → 1345 centimes, soit 13,45 €. La saisie est en centimes entiers. */
export function lireMontantSaisie(texte: string): Cents | undefined {
  const chiffres = texte.replace(/\D/g, '')
  if (chiffres === '') {
    return undefined
  }
  return cents(Number(chiffres.slice(0, 9)))
}

/** 1345 → `'13,45'`. */
export function ecrireMontantSaisie(montant: Cents): string {
  const absolu = Math.abs(montant)
  const entier = Math.trunc(absolu / 100)
  const centimes = absolu - entier * 100
  const signe = montant < 0 ? '-' : ''
  return `${signe}${String(entier)},${String(centimes).padStart(2, '0')}`
}

/** `'50'` → 0,5. Refuse au-delà de 100 % : une fraction ne dépasse pas 1. */
export function lirePourcentageSaisie(texte: string): number | undefined {
  const chiffres = texte.replace(/\D/g, '').slice(0, 3)
  if (chiffres === '') {
    return undefined
  }
  const pourcentage = Number(chiffres)
  if (pourcentage > 100) {
    return undefined
  }
  return pourcentage / 100
}

/** 0,5 → `'50'`. */
export function ecrirePourcentageSaisie(fraction: number): string {
  return String(Math.trunc(fraction * 100 + 0.5))
}

/** `'26'` → 26. Un entier saisi sans unité (jour de début de période, etc.). */
export function lireEntierSaisie(texte: string): number | undefined {
  const chiffres = texte.replace(/\D/g, '')
  return chiffres === '' ? undefined : Number(chiffres)
}

import { describe, expect, it } from 'vitest'
import {
  arrondir,
  arrondirEnCents,
  cents,
  centiemesEnMinutes,
  centiemesEntiers,
  formatDuree,
  formatEcartDuree,
  formatEcartMontant,
  formatMontant,
  majorer,
  minutes,
  minutesEnCentiemes,
  valoriser,
  valoriserMajore,
} from '../../src/engine'

const INSECABLE = ' '

describe('NUM — centimes, minutes, centièmes, arrondi', () => {
  it('NUM-01 — cents accepte un entier', () => {
    expect(cents(1250)).toBe(1250)
    expect(cents(0)).toBe(0)
  })

  it('NUM-02 — cents rejette un non-entier', () => {
    expect(() => cents(12.5)).toThrow(TypeError)
    expect(() => cents(Number.NaN)).toThrow(TypeError)
    expect(() => cents(Number.POSITIVE_INFINITY)).toThrow(TypeError)
  })

  it('NUM-03 — cents accepte un montant négatif (régularisation)', () => {
    expect(cents(-500)).toBe(-500)
  })

  it('NUM-04 — minutes accepte un entier positif', () => {
    expect(minutes(90)).toBe(90)
    expect(minutes(0)).toBe(0)
  })

  it('NUM-05 — minutes rejette un non-entier', () => {
    expect(() => minutes(90.5)).toThrow(TypeError)
    expect(() => minutes(Number.NaN)).toThrow(TypeError)
  })

  it('NUM-06 — minutes rejette une durée négative', () => {
    expect(() => minutes(-30)).toThrow(RangeError)
  })

  it('NUM-07 — minutes → centièmes, les 60 valeurs', () => {
    // Table de référence calculée à la main : arrondi au centième, demi vers le
    // haut. Elle est écrite en dur exprès — la recalculer avec la fonction
    // testée ne prouverait rien.
    const attendus = [
      0, 2, 3, 5, 7, 8, 10, 12, 13, 15, 17, 18, 20, 22, 23, 25, 27, 28, 30, 32, 33, 35, 37, 38,
      40, 42, 43, 45, 47, 48, 50, 52, 53, 55, 57, 58, 60, 62, 63, 65, 67, 68, 70, 72, 73, 75, 77,
      78, 80, 82, 83, 85, 87, 88, 90, 92, 93, 95, 97, 98,
    ]
    expect(attendus).toHaveLength(60)

    for (let m = 0; m < 60; m += 1) {
      expect(centiemesEntiers(minutes(m)), `${String(m)} min`).toBe(attendus[m])
    }
  })

  it('NUM-07 — les valeurs remarquables des fiches de paie', () => {
    expect(minutesEnCentiemes(minutes(30))).toBe(0.5)
    expect(minutesEnCentiemes(minutes(20))).toBe(0.33)
    expect(minutesEnCentiemes(minutes(40))).toBe(0.67)
    expect(minutesEnCentiemes(minutes(10))).toBe(0.17)
  })

  it('NUM-08 — conversions de référence du SPEC et du DESIGN', () => {
    expect(minutesEnCentiemes(minutes(7 * 60 + 30))).toBe(7.5)
    expect(minutesEnCentiemes(minutes(8 * 60 + 20))).toBe(8.33)
    expect(minutesEnCentiemes(minutes(18 * 60 + 15))).toBe(18.25)
  })

  it('NUM-09 — pas d’arrondi en cascade : 3 × 20 min converti une fois ≠ trois fois', () => {
    const unSeulArrondi = centiemesEntiers(minutes(60))
    const troisArrondis = 3 * centiemesEntiers(minutes(20))

    expect(unSeulArrondi).toBe(100)
    // 3 × 0,33 = 0,99 : c'est exactement l'écart qu'interdit le SPEC §10.
    expect(troisArrondis).toBe(99)
    expect(unSeulArrondi).not.toBe(troisArrondis)
  })

  it('NUM-10 — un calcul en trois étapes donne le même centime qu’en une', () => {
    const duree = minutes(620)
    const taux = cents(1345)

    const enUne = valoriserMajore(duree, taux, 25)
    // La même chose, si on avait le droit d'arrondir en chemin :
    const enTrois = majorer(valoriser(duree, taux), 25)

    expect(enUne).toBe(17373)
    // Ici les deux coïncident, mais c'est `valoriserMajore` qui fait foi : elle
    // n'arrondit qu'une fois, par construction.
    expect(enTrois).toBe(17373)
  })

  it('NUM-11 — demi vers le haut en valeur absolue, symétrique', () => {
    expect(arrondir(0.5)).toBe(1)
    expect(arrondir(-0.5)).toBe(-1)
    expect(arrondir(1.5)).toBe(2)
    expect(arrondir(-1.5)).toBe(-2)
    expect(arrondir(2.4)).toBe(2)
    expect(arrondir(-2.4)).toBe(-2)
    // Math.round(-0.5) vaut 0 : c'est précisément ce qu'on refuse.
    expect(arrondir(-0.5)).not.toBe(Math.round(-0.5))
  })

  it('NUM-11 — un demi issu du binaire est arrondi comme un demi exact', () => {
    // 1,005 × 100 vaut 100.49999999999999 en flottant.
    expect(arrondirEnCents(1.005 * 100)).toBe(101)
  })

  it('NUM-12 — application d’un taux, un seul arrondi en sortie', () => {
    // 620 min × 13,45 €/h ÷ 60 = 138,983… € → 138,98 €
    expect(valoriser(minutes(620), cents(1345))).toBe(13898)
  })

  it('NUM-13 — majoration en pourcentage, résultat entier', () => {
    expect(majorer(cents(10000), 25)).toBe(12500)
    expect(majorer(cents(1333), 25)).toBe(1666)
    expect(Number.isInteger(majorer(cents(1333), 50))).toBe(true)
  })

  it('NUM-14 — double affichage d’une durée, insécables et virgule', () => {
    const duree = formatDuree(minutes(500))
    expect(duree.sexagesimal).toBe(`8${INSECABLE}h${INSECABLE}20`)
    expect(duree.centiemes).toBe(`8,33${INSECABLE}h`)
    expect(duree.centiemes).not.toContain('.')
  })

  it('NUM-15 — une durée nulle calculée s’affiche, contrairement à un unknown', () => {
    const duree = formatDuree(minutes(0))
    expect(duree.sexagesimal).toBe(`0${INSECABLE}h${INSECABLE}00`)
    expect(duree.centiemes).toBe(`0,00${INSECABLE}h`)
  })

  it('NUM-16 — montant : virgule décimale et espace insécable avant l’euro', () => {
    expect(formatMontant(cents(14820))).toBe(`148,20${INSECABLE}€`)
    expect(formatMontant(cents(5))).toBe(`0,05${INSECABLE}€`)
    expect(formatMontant(cents(0))).toBe(`0,00${INSECABLE}€`)
  })

  it('NUM-17 — montant négatif : signe moins typographique, pas un trait d’union', () => {
    const rendu = formatMontant(cents(-1250))
    expect(rendu).toBe(`−12,50${INSECABLE}€`)
    expect(rendu.startsWith('-')).toBe(false)
  })

  it('NUM-18 — au-delà de 24 h, jamais de remise à zéro modulo 24', () => {
    expect(formatDuree(minutes(2000)).sexagesimal).toBe(`33${INSECABLE}h${INSECABLE}20`)
    expect(formatDuree(minutes(1440)).sexagesimal).toBe(`24${INSECABLE}h${INSECABLE}00`)
  })

  it('NUM-19 — un écart signé porte son signe explicite', () => {
    expect(formatEcartMontant(1250)).toBe(`+12,50${INSECABLE}€`)
    expect(formatEcartMontant(-1250)).toBe(`−12,50${INSECABLE}€`)
    expect(formatEcartMontant(0)).toBe(`0,00${INSECABLE}€`)
    expect(formatEcartDuree(-90).sexagesimal).toBe(`−1${INSECABLE}h${INSECABLE}30`)
    expect(formatEcartDuree(90).centiemes).toBe(`+1,50${INSECABLE}h`)
  })

  it('NUM-20 — centièmes → minutes, aller-retour stable', () => {
    expect(centiemesEnMinutes(18.25)).toBe(1095)
    expect(minutesEnCentiemes(centiemesEnMinutes(7.5))).toBe(7.5)
  })
})

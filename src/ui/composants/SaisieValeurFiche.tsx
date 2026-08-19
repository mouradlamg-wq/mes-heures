import { useState } from 'react'
import {
  cents,
  ecrireMontantSaisie,
  lireMontantSaisie,
  minutes,
  minutesEnCentiemes,
  type Unite,
} from '../../engine'

/**
 * La valeur relevée sur la fiche de paie. **La seule valeur saisie par
 * l'utilisateur sur cet écran** — d'où son encadré (DESIGN §7).
 *
 * Elle n'est **jamais préremplie par une estimation** : y mettre le calcul de
 * l'app ferait disparaître l'écart avant même qu'on le cherche.
 *
 * Les heures se recopient telles qu'elles sont imprimées, en centièmes
 * (`17,00`), parce que c'est ce que le conducteur a sous les yeux.
 */
export function SaisieValeurFiche({
  unite,
  valeur,
  onChange,
}: {
  readonly unite: Unite
  /** Durées en minutes, montants en centimes, quantités telles quelles. */
  readonly valeur: number | undefined
  /** Rend la valeur dans l'unité de saisie : centièmes, centimes, quantité. */
  readonly onChange: (valeur: number | undefined) => void
}): React.JSX.Element {
  const canonique = ecrire(unite, valeur)
  const [saisie, setSaisie] = useState(canonique)
  const [dernier, setDernier] = useState(canonique)

  if (canonique !== dernier) {
    setDernier(canonique)
    setSaisie(canonique)
  }

  return (
    <input
      className="input ecart__fiche"
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={unite === 'quantite' ? '--' : '--,--'}
      aria-label="Valeur sur ta fiche"
      value={saisie}
      onChange={(evenement) => {
        const brut = evenement.target.value
        setSaisie(brut)
        onChange(lire(unite, brut))
      }}
    />
  )
}

function ecrire(unite: Unite, valeur: number | undefined): string {
  if (valeur === undefined) {
    return ''
  }
  switch (unite) {
    case 'duree':
      // Le moteur stocke des minutes ; la fiche, elle, est imprimée en
      // centièmes. Les constructeurs du moteur valident au passage.
      return String(minutesEnCentiemes(minutes(valeur))).replace('.', ',')
    case 'montant':
      return ecrireMontantSaisie(cents(valeur))
    case 'quantite':
      return String(valeur)
  }
}

function lire(unite: Unite, texte: string): number | undefined {
  const nettoye = texte.trim()
  if (nettoye === '') {
    return undefined
  }
  switch (unite) {
    case 'duree': {
      const nombre = Number(nettoye.replace(',', '.'))
      return Number.isFinite(nombre) ? nombre : undefined
    }
    case 'montant':
      return lireMontantSaisie(nettoye)
    case 'quantite': {
      const entier = Number(nettoye.replace(/\D/g, ''))
      return Number.isFinite(entier) ? entier : undefined
    }
  }
}

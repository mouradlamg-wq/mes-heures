import { useState } from 'react'
import { Aujourdhui } from '../ui/ecrans/Aujourdhui'
import { Reglages } from '../ui/ecrans/Reglages'

type Ecran = { readonly nom: 'aujourdhui' } | { readonly nom: 'reglages'; readonly vise?: string }

/**
 * Coquille de l'app. Deux écrans en phase 5 : la saisie, et les réglages —
 * parce qu'un `unknown` doit toujours pouvoir mener au réglage qui le lève
 * (DESIGN §6).
 */
export function App(): React.JSX.Element {
  const [ecran, setEcran] = useState<Ecran>({ nom: 'aujourdhui' })

  return (
    <main className="ecran">
      <div className="gouttiere barre-app">
        <nav className="nav" aria-label="Écrans">
          <button
            type="button"
            className="nav__lien"
            aria-current={ecran.nom === 'aujourdhui' ? 'page' : undefined}
            onClick={() => {
              setEcran({ nom: 'aujourdhui' })
            }}
          >
            Ma journée
          </button>
          <button
            type="button"
            className="nav__lien"
            aria-current={ecran.nom === 'reglages' ? 'page' : undefined}
            onClick={() => {
              setEcran({ nom: 'reglages' })
            }}
          >
            Réglages
          </button>
        </nav>
        <span className="barre-app__titre">Mes Heures</span>
      </div>

      {ecran.nom === 'aujourdhui' ? (
        <Aujourdhui
          onOuvrirReglages={(reglage) => {
            setEcran(reglage === undefined ? { nom: 'reglages' } : { nom: 'reglages', vise: reglage })
          }}
        />
      ) : (
        <Reglages
          reglageVise={ecran.vise}
          onRetour={() => {
            setEcran({ nom: 'aujourdhui' })
          }}
        />
      )}
    </main>
  )
}

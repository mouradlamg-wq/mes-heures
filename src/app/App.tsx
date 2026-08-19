import { useState } from 'react'
import type { ISODate } from '../engine'
import { Aujourdhui } from '../ui/ecrans/Aujourdhui'
import { MaPeriode } from '../ui/ecrans/MaPeriode'
import { VerifierMaPaie } from '../ui/ecrans/VerifierMaPaie'
import { EcranReleve } from '../ui/ecrans/EcranReleve'
import { Reglages } from '../ui/ecrans/Reglages'

type Ecran =
  | { readonly nom: 'aujourdhui'; readonly date?: ISODate }
  | { readonly nom: 'periode' }
  | { readonly nom: 'paie' }
  | { readonly nom: 'releve'; readonly ancre: ISODate }
  | { readonly nom: 'reglages'; readonly vise?: string }

const ONGLETS = [
  { nom: 'aujourdhui', libelle: 'Ma journée' },
  { nom: 'periode', libelle: 'Ma période' },
  { nom: 'paie', libelle: 'Ma paie' },
  { nom: 'reglages', libelle: 'Réglages' },
] as const

/**
 * Coquille de l'app.
 *
 * Pas de routeur : trois écrans, et un `unknown` doit toujours pouvoir mener au
 * réglage qui le lève (DESIGN §6) — c'est la seule navigation qui compte.
 */
export function App(): React.JSX.Element {
  const [ecran, setEcran] = useState<Ecran>({ nom: 'aujourdhui' })

  return (
    <main className="ecran">
      <div className="gouttiere barre-app">
        <nav className="nav" aria-label="Écrans">
          {ONGLETS.map((onglet) => (
            <button
              key={onglet.nom}
              type="button"
              className="nav__lien"
              aria-current={ecran.nom === onglet.nom ? 'page' : undefined}
              onClick={() => {
                setEcran({ nom: onglet.nom })
              }}
            >
              {onglet.libelle}
            </button>
          ))}
        </nav>
      </div>

      {ecran.nom === 'aujourdhui' ? (
        <Aujourdhui
          {...(ecran.date === undefined ? {} : { dateInitiale: ecran.date })}
          onOuvrirReglages={(reglage) => {
            setEcran(
              reglage === undefined ? { nom: 'reglages' } : { nom: 'reglages', vise: reglage },
            )
          }}
        />
      ) : ecran.nom === 'periode' ? (
        <MaPeriode
          onOuvrirJournee={(date) => {
            setEcran({ nom: 'aujourdhui', date })
          }}
          onOuvrirReglages={(reglage) => {
            setEcran(
              reglage === undefined ? { nom: 'reglages' } : { nom: 'reglages', vise: reglage },
            )
          }}
          onVerifierPaie={() => {
            setEcran({ nom: 'paie' })
          }}
        />
      ) : ecran.nom === 'paie' ? (
        <VerifierMaPaie
          onOuvrirReglages={(reglage) => {
            setEcran(
              reglage === undefined ? { nom: 'reglages' } : { nom: 'reglages', vise: reglage },
            )
          }}
          onEditerReleve={(debut) => {
            setEcran({ nom: 'releve', ancre: debut })
          }}
        />
      ) : ecran.nom === 'releve' ? (
        <EcranReleve
          ancre={ecran.ancre}
          onFermer={() => {
            setEcran({ nom: 'paie' })
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

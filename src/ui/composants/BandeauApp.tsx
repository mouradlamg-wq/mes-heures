import { useEffect, useState } from 'react'
import { enregistrerServiceWorker } from '../../app/pwa'

/**
 * Deux annonces discrètes, en pied d'écran : une mise à jour prête, et
 * l'installation sur l'écran d'accueil.
 *
 * Aucune des deux ne s'impose : une mise à jour ne s'applique jamais sans qu'on
 * la demande (une saisie en cours serait perdue), et l'invite d'installation
 * disparaît dès qu'on la refuse.
 */
export function BandeauApp(): React.JSX.Element | null {
  const [miseAJour, setMiseAJour] = useState<(() => void) | undefined>(undefined)
  const [installer, setInstaller] = useState<(() => Promise<void>) | undefined>(undefined)
  const [ecarte, setEcarte] = useState(false)

  useEffect(() => {
    enregistrerServiceWorker((etat) => {
      setMiseAJour(() => etat.appliquer)
    })
  }, [])

  useEffect(() => {
    const surInvite = (evenement: Event): void => {
      // On garde la main : le navigateur ne montre sa propre invite que si on
      // l'empêche de la montrer tout de suite.
      evenement.preventDefault()
      const invite = evenement as Event & { prompt: () => Promise<void> }
      setInstaller(() => async () => {
        await invite.prompt()
        setInstaller(undefined)
      })
    }

    globalThis.addEventListener('beforeinstallprompt', surInvite)
    return () => {
      globalThis.removeEventListener('beforeinstallprompt', surInvite)
    }
  }, [])

  if (miseAJour !== undefined) {
    return (
      <div className="bandeau">
        <p className="bandeau__texte">
          Une nouvelle version est prête. Elle s’appliquera quand tu le décideras —
          jamais au milieu d’une saisie.
        </p>
        <button type="button" className="btn btn-secondary" onClick={miseAJour}>
          Mettre à jour
        </button>
      </div>
    )
  }

  if (installer !== undefined && !ecarte) {
    return (
      <div className="bandeau">
        <p className="bandeau__texte">
          Installe l’app sur ton écran d’accueil : elle s’ouvre plus vite et
          fonctionne sans réseau.
        </p>
        <div className="raccourcis">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              void installer()
            }}
          >
            Installer
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setEcarte(true)
            }}
          >
            Plus tard
          </button>
        </div>
      </div>
    )
  }

  return null
}

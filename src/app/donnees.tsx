import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DateTime } from 'luxon'
import {
  BaseMesHeures,
  MODE_SAISIE_PAR_DEFAUT,
  Repository,
  settingsParDefaut,
  demanderStockagePersistant,
} from '../db'
import { ContexteDonnees, type Donnees } from './contexteDonnees'

/**
 * Point d'entrée unique vers les données. L'UI ne parle jamais à Dexie
 * directement : elle lit ce contexte, et les écrans reçoivent des réglages déjà
 * chargés.
 */

const base = new BaseMesHeures()
const repository = new Repository(base)

export function FournisseurDonnees({
  children,
}: {
  readonly children: ReactNode
}): React.JSX.Element {
  const [pret, setPret] = useState(false)

  useEffect(() => {
    let annule = false

    void (async () => {
      await base.open()

      // Une base neuve reçoit des réglages **vides**, sauf le fuseau.
      const existants = await repository.lireSettings()
      if (existants === undefined) {
        await repository.ecrireSettings(settingsParDefaut())
      }

      // `persist()` est une demande, pas une garantie : on lit le retour et on
      // le note, parce qu'un refus renforce les rappels de sauvegarde.
      const accord = await demanderStockagePersistant()
      await repository.noterStockagePersistant(accord === 'accorde')

      if (!annule) {
        setPret(true)
      }
    })()

    return () => {
      annule = true
    }
  }, [])

  const settings = useLiveQuery(async () => repository.lireSettings(), [], undefined)
  const modeSaisieHeure = useLiveQuery(
    async () => repository.lireModeSaisieHeure(),
    [],
    MODE_SAISIE_PAR_DEFAUT,
  )

  if (!pret || settings === undefined) {
    return (
      <main className="ecran gouttiere">
        <p className="mention">Ouverture de tes données…</p>
      </main>
    )
  }

  const zone = settings.timeZoneReference
  const maintenant = DateTime.now().setZone(zone)

  const donnees: Donnees = {
    repo: repository,
    base,
    settings,
    zone,
    aujourdhui: maintenant.toISODate() ?? '',
    maintenantMillis: maintenant.toMillis(),
    modeSaisieHeure,
  }

  return <ContexteDonnees.Provider value={donnees}>{children}</ContexteDonnees.Provider>
}

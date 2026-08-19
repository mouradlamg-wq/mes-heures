import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DateTime } from 'luxon'
import {
  etatSauvegarde,
  exporter,
  importer,
  serialiser,
  type EtatSauvegarde,
  type ResultatImport,
} from '../../db'
import { formatInstant, lireInstant } from '../../engine'
import { useDonnees } from '../../app/contexteDonnees'

/**
 * Sauvegarde (SPEC §12, DESIGN §10).
 *
 * Il n'y a **ni compte, ni serveur, ni synchronisation** : un fichier JSON est
 * le seul moyen de changer d'appareil, et le seul filet contre la perte. C'est
 * pourquoi cette section porte le seul usage d'alerte du rouge de toute l'app —
 * et il porte sur la perte de données, pas sur un calcul.
 */
export function Sauvegarde(): React.JSX.Element {
  const { repo, base, zone, maintenantMillis } = useDonnees()
  const [resultat, setResultat] = useState<ResultatImport | undefined>(undefined)
  const [enCours, setEnCours] = useState(false)
  const champFichier = useRef<HTMLInputElement>(null)

  const meta = useLiveQuery(
    async () => ({
      dernier: await repo.dernierExport(),
      stockage: await repo.stockagePersistant(),
    }),
    [],
    undefined,
  )

  const dernierMillis =
    meta?.dernier === undefined ? undefined : instantEnMillis(meta.dernier)
  const etat = etatSauvegarde(dernierMillis, maintenantMillis, meta?.stockage)

  const exporterMaintenant = async (): Promise<void> => {
    setEnCours(true)
    try {
      const instant = formatInstant(maintenantMillis, zone)
      const fichier = await exporter(base, instant)
      const contenu = serialiser(fichier)
      const nom = `mes-heures-${instant.slice(0, 10)}.json`

      await partagerOuTelecharger(nom, contenu)
      await repo.noterExport(instant)
      setResultat(undefined)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className={`sauvegarde sauvegarde--${etat.niveau}`}>
      <p className="sauvegarde__etat">{phraseEtat(etat, meta?.dernier, zone)}</p>

      <div className="raccourcis">
        <button
          type="button"
          className="btn btn-primary"
          disabled={enCours}
          onClick={() => {
            void exporterMaintenant()
          }}
        >
          Exporter mes données
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            champFichier.current?.click()
          }}
        >
          Importer une sauvegarde
        </button>
      </div>

      <input
        ref={champFichier}
        type="file"
        accept="application/json,.json"
        className="sauvegarde__fichier"
        onChange={(evenement) => {
          const fichier = evenement.target.files?.[0]
          evenement.target.value = ''
          if (fichier === undefined) {
            return
          }
          void (async () => {
            const contenu = await fichier.text()
            // Mode explicite, jamais implicite (SPEC §12, DON-12).
            const remplacer = globalThis.confirm(
              "Remplacer toutes tes données par celles du fichier ?\n\nAnnuler ajoutera le contenu du fichier à ce qui existe déjà.",
            )
            setResultat(await importer(base, contenu, remplacer ? 'remplacement' : 'fusion'))
          })()
        }}
      />

      {resultat === undefined ? null : resultat.status === 'refus' ? (
        <div className="incalculable">
          <p className="incalculable__phrase">{resultat.raison}</p>
          {resultat.details.length === 0 ? null : (
            <ul className="sauvegarde__details">
              {resultat.details.slice(0, 4).map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="field-consequence">
          Import terminé : {resultat.compte['journees']} journées,{' '}
          {resultat.compte['absences']} absences.
        </p>
      )}

      <span className="field-consequence">
        Le fichier ne contient que ce que tu as saisi. Aucun identifiant
        d’appareil, aucune donnée de navigation.
      </span>
    </div>
  )
}

/**
 * Partage système d'abord, téléchargement en repli.
 *
 * Sur un téléphone, le partage laisse choisir la destination — un message à
 * soi-même, un cloud, un mail. Le téléchargement, lui, laisse le fichier sur
 * l'appareil qu'on cherche justement à ne plus être seul à détenir : il ne
 * protège de rien tant qu'on ne le déplace pas.
 */
async function partagerOuTelecharger(nom: string, contenu: string): Promise<void> {
  const fichier = new File([contenu], nom, { type: 'application/json' })

  if (
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [fichier] }) &&
    typeof navigator.share === 'function'
  ) {
    try {
      await navigator.share({ files: [fichier], title: 'Sauvegarde Mes Heures' })
      return
    } catch {
      // Partage annulé ou indisponible : on retombe sur le téléchargement.
    }
  }

  const url = URL.createObjectURL(fichier)
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nom
  lien.click()
  URL.revokeObjectURL(url)
}

function instantEnMillis(iso: string): number | undefined {
  const lecture = lireInstant(iso)
  return lecture.status === 'ok' ? lecture.millis : undefined
}

function phraseEtat(etat: EtatSauvegarde, dernier: string | undefined, zone: string): string {
  if (etat.niveau === 'jamais') {
    return etat.message
  }
  const date =
    dernier === undefined
      ? ''
      : DateTime.fromISO(dernier, { zone }).setLocale('fr').toFormat('d LLLL yyyy')

  if (etat.niveau === 'ok') {
    return `Dernière sauvegarde le ${date}.`
  }
  return `${etat.message} (dernière sauvegarde le ${date})`
}

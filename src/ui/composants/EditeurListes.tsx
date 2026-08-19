import {
  lirePourcentageSaisie,
  ecrirePourcentageSaisie,
  lirePourcentageDirect,
  ecrirePourcentageDirect,
  formatDuree,
  minutes,
  type PalierCoupure,
  type TrancheHS,
} from '../../engine'
import { SaisieDuree } from './SaisieDuree'

/**
 * Les deux listes de réglages du SPEC §9 : tranches de majoration des heures
 * supplémentaires, et paliers de rémunération des coupures.
 *
 * **Aucun taux, aucun seuil n'est proposé par défaut** — ni 25 %, ni 50 %, ni
 * 8 h. Ils viennent de la convention, et l'app ne les connaît pas.
 */

export function EditeurTranches({
  tranches,
  onChanger,
}: {
  readonly tranches: readonly TrancheHS[] | undefined
  readonly onChanger: (tranches: readonly TrancheHS[] | undefined) => void
}): React.JSX.Element {
  const liste = tranches ?? []

  const modifier = (index: number, modification: Partial<TrancheHS>): void => {
    onChanger(liste.map((t, i) => (i === index ? { ...t, ...modification } : t)))
  }

  const ajouter = (): void => {
    // La nouvelle tranche démarre là où la précédente s'arrête : c'est la seule
    // façon d'en écrire une suite valide, et ce n'est pas une valeur métier.
    const derniere = liste.at(-1)
    const depart = derniere === undefined ? minutes(0) : (derniere.aMinutes ?? minutes(0))
    const fermee: readonly TrancheHS[] =
      derniere === undefined || derniere.aMinutes !== null
        ? liste
        : liste.slice(0, -1).concat({ ...derniere, aMinutes: depart })

    // Sans taux : c'est à toi de le renseigner, l'app n'en suppose aucun.
    onChanger([...fermee, { deMinutes: depart, aMinutes: null }])
  }

  return (
    <div className="field">
      <span className="field-label">Tranches de majoration</span>

      {liste.length === 0 ? (
        <span className="field-consequence">
          Aucune tranche. La durée de tes heures supplémentaires reste calculée, mais leur
          montant restera incalculable.
        </span>
      ) : null}

      <ul className="liste-reglages">
        {liste.map((tranche, index) => (
          <li key={`${String(index)}-${String(tranche.deMinutes)}`} className="ligne-reglage">
            <span className="ligne-reglage__texte">
              À partir de {formatDuree(tranche.deMinutes).sexagesimal}
              {tranche.aMinutes === null
                ? ' et au-delà'
                : ` jusqu’à ${formatDuree(tranche.aMinutes).sexagesimal}`}
            </span>

            <span className="ligne-reglage__champs">
              <label className="legende" htmlFor={`tranche-de-${String(index)}`}>
                De
              </label>
              <SaisieDuree
                identifiant={`tranche-de-${String(index)}`}
                valeur={tranche.deMinutes}
                onChange={(duree) => {
                  if (duree !== undefined) {
                    modifier(index, { deMinutes: duree })
                  }
                }}
              />

              {tranche.aMinutes === null ? null : (
                <>
                  <label className="legende" htmlFor={`tranche-a-${String(index)}`}>
                    À
                  </label>
                  <SaisieDuree
                    identifiant={`tranche-a-${String(index)}`}
                    valeur={tranche.aMinutes}
                    onChange={(duree) => {
                      if (duree !== undefined) {
                        modifier(index, { aMinutes: duree })
                      }
                    }}
                  />
                </>
              )}

              <label className="legende" htmlFor={`tranche-pct-${String(index)}`}>
                Majoration
              </label>
              <input
                id={`tranche-pct-${String(index)}`}
                className="input input--court"
                type="text"
                inputMode="numeric"
                placeholder="-- %"
                value={tranche.majorationPct === undefined ? '' : ecrirePourcentageDirect(tranche.majorationPct)}
                onChange={(evenement) => {
                  const pct = lirePourcentageDirect(evenement.target.value)
                  if (pct !== undefined) {
                    modifier(index, { majorationPct: pct })
                  }
                }}
              />
            </span>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const restantes = liste.filter((_, i) => i !== index)
                onChanger(restantes.length === 0 ? undefined : rouvrirDerniere(restantes))
              }}
            >
              Retirer
            </button>
          </li>
        ))}
      </ul>

      <button type="button" className="btn btn-ghost" onClick={ajouter}>
        + Ajouter une tranche
      </button>
      <span className="field-consequence">
        Les tranches doivent se suivre sans trou, et la dernière reste ouverte. Sinon l’app
        refuse de calculer plutôt que de deviner.
      </span>
    </div>
  )
}

export function EditeurPaliersCoupure({
  paliers,
  onChanger,
}: {
  readonly paliers: readonly PalierCoupure[] | undefined
  readonly onChanger: (paliers: readonly PalierCoupure[] | undefined) => void
}): React.JSX.Element {
  const liste = paliers ?? []

  return (
    <div className="field">
      <span className="field-label">Paliers de coupure rémunérée</span>

      {liste.length === 0 ? (
        <span className="field-consequence">
          Aucun palier : tes coupures ne sont pas comptées dans le temps rémunéré. L’app te le
          signalera sur chaque journée qui en contient.
        </span>
      ) : null}

      <ul className="liste-reglages">
        {liste.map((palier, index) => (
          <li key={`${String(index)}-${String(palier.auDelaDeMinutes)}`} className="ligne-reglage">
            <span className="ligne-reglage__texte">
              Au-delà de {formatDuree(palier.auDelaDeMinutes).sexagesimal}, payée à{' '}
              {ecrirePourcentageSaisie(palier.fraction)} %
            </span>

            <span className="ligne-reglage__champs">
              <label className="legende" htmlFor={`palier-seuil-${String(index)}`}>
                Au-delà de
              </label>
              <SaisieDuree
                identifiant={`palier-seuil-${String(index)}`}
                valeur={palier.auDelaDeMinutes}
                onChange={(duree) => {
                  if (duree !== undefined) {
                    onChanger(
                      liste.map((p, i) => (i === index ? { ...p, auDelaDeMinutes: duree } : p)),
                    )
                  }
                }}
              />

              <label className="legende" htmlFor={`palier-part-${String(index)}`}>
                Part payée
              </label>
              <input
                id={`palier-part-${String(index)}`}
                className="input input--court"
                type="text"
                inputMode="numeric"
                placeholder="-- %"
                value={ecrirePourcentageSaisie(palier.fraction)}
                onChange={(evenement) => {
                  const fraction = lirePourcentageSaisie(evenement.target.value)
                  if (fraction !== undefined) {
                    onChanger(liste.map((p, i) => (i === index ? { ...p, fraction } : p)))
                  }
                }}
              />
            </span>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const restants = liste.filter((_, i) => i !== index)
                onChanger(restants.length === 0 ? undefined : restants)
              }}
            >
              Retirer
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          onChanger([...liste, { auDelaDeMinutes: minutes(0), fraction: 0 }])
        }}
      >
        + Ajouter un palier
      </button>
    </div>
  )
}

/** La dernière tranche d'une suite doit rester ouverte. */
function rouvrirDerniere(tranches: readonly TrancheHS[]): readonly TrancheHS[] {
  const derniere = tranches.at(-1)
  if (derniere === undefined) {
    return tranches
  }
  return tranches.slice(0, -1).concat({ ...derniere, aMinutes: null })
}



import { useState } from 'react'
import {
  CODES_INDEMNITES_COURANTS,
  ecrireMontantSaisie,
  formatMontant,
  lireEntierSaisie,
  lireMontantSaisie,
  TYPES_SEGMENT,
  validerIndemnites,
  type IndemniteConfig,

} from '../../engine'
import { libelleDeclencheur, libelleType } from '../libelles'
import { ChampHeure } from './ChampHeure'
import { SaisieDuree } from './SaisieDuree'
import { TagStatut } from './Statut'
import { useDonnees } from '../../app/contexteDonnees'

/**
 * Configuration complète des indemnités (SPEC §8).
 *
 * **Rien n'est en dur.** Ni montant, ni plage, ni seuil, ni incompatibilité :
 * tout se saisit ici, depuis la convention ou une fiche de paie. Les codes
 * courants ne sont qu'une liste de départ, livrée **sans aucune valeur**.
 *
 * Une indemnité sans montant s'affiche `INCALCULABLE`, jamais `0,00 €` : c'est
 * une règle désactivée, pas une règle qui vaut zéro.
 */
export function EditeurIndemnites(): React.JSX.Element {
  const { repo, settings, modeSaisieHeure } = useDonnees()
  const [enEdition, setEnEdition] = useState<string | undefined>(undefined)
  const [ajout, setAjout] = useState(false)

  const problemes = validerIndemnites(settings.indemnites)

  const ecrire = (indemnites: readonly IndemniteConfig[]): void => {
    void repo.ecrireSettings({ ...settings, indemnites })
  }

  const modifier = (id: string, modification: Partial<IndemniteConfig>): void => {
    ecrire(settings.indemnites.map((i) => (i.id === id ? { ...i, ...modification } : i)))
  }

  const ajouter = (code: string, libelle: string): void => {
    const nouvelle: IndemniteConfig = {
      id: `ind-${code}-${String(settings.indemnites.length)}`,
      code,
      libelle,
      declencheur: 'quantite_manuelle',
      // Aucun montant : c'est à toi de le reprendre sur ta convention.
      source: { kind: 'convention', libelle: 'À compléter', saisiPar: 'utilisateur' },
    }
    ecrire([...settings.indemnites, nouvelle])
    setAjout(false)
    setEnEdition(nouvelle.id)
  }

  const supprimer = (id: string): void => {
    ecrire(settings.indemnites.filter((i) => i.id !== id))
    setEnEdition(undefined)
  }

  const editee = settings.indemnites.find((i) => i.id === enEdition)
  const dejaUtilises = new Set(settings.indemnites.map((i) => i.code))
  const proposables = CODES_INDEMNITES_COURANTS.filter((c) => !dejaUtilises.has(c.code))

  return (
    <div className="field">
      {problemes.length === 0 ? null : (
        <div className="incalculable">
          {problemes.map((probleme) => (
            <p key={probleme.message} className="incalculable__phrase">
              {probleme.message}
            </p>
          ))}
        </div>
      )}

      <ul className="liste-indemnites">
        {settings.indemnites.map((indemnite) => (
          <li key={indemnite.id} className="liste-indemnite">
            <button
              type="button"
              className="liste-indemnite__bouton"
              onClick={() => {
                setEnEdition(indemnite.id)
              }}
            >
              <span className="liste-indemnite__libelle">
                {indemnite.libelle}
                <br />
                <span className="liste-indemnite__code">
                  {indemnite.code} · {libelleDeclencheur(indemnite.declencheur)}
                </span>
              </span>
              {indemnite.montantCents === undefined ? (
                <TagStatut statut="unknown" />
              ) : (
                <span className="liste-indemnite__montant">
                  {formatMontant(indemnite.montantCents)}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {settings.indemnites.length === 0 ? (
        <span className="field-consequence">
          Aucune indemnité configurée. Tant qu’il n’y en a pas, l’app n’en comptera aucune —
          elle n’en invente jamais.
        </span>
      ) : null}

      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => {
          setAjout(true)
        }}
      >
        + Ajouter une indemnité
      </button>

      {ajout ? (
        <ChoixCode
          proposables={proposables}
          onChoisir={ajouter}
          onAnnuler={() => {
            setAjout(false)
          }}
        />
      ) : null}

      {editee === undefined ? null : (
        <FormulaireIndemnite
          indemnite={editee}
          autresCodes={settings.indemnites.filter((i) => i.id !== editee.id).map((i) => i.code)}
          modeSaisieHeure={modeSaisieHeure}
          onModifier={(modification) => {
            modifier(editee.id, modification)
          }}
          onSupprimer={() => {
            supprimer(editee.id)
          }}
          onFermer={() => {
            setEnEdition(undefined)
          }}
        />
      )}
    </div>
  )
}

/** Les codes courants sont une aide à la saisie, jamais une liste fermée. */
function ChoixCode({
  proposables,
  onChoisir,
  onAnnuler,
}: {
  readonly proposables: readonly { code: string; libelle: string }[]
  readonly onChoisir: (code: string, libelle: string) => void
  readonly onAnnuler: () => void
}): React.JSX.Element {
  const [libre, setLibre] = useState('')

  return (
    <dialog className="dialog" open aria-label="Ajouter une indemnité">
      <div className="dialog__corps">
        <h2 className="dialog__titre">Quelle indemnité ?</h2>
        <p className="dialog__texte">
          Ces codes sont des noms courants, livrés <strong>sans aucun montant</strong>. Si le
          tien ne s’y trouve pas, écris-le.
        </p>

        <div className="dialog__choix">
          {proposables.map((propose) => (
            <button
              key={propose.code}
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                onChoisir(propose.code, propose.libelle)
              }}
            >
              {propose.libelle}
            </button>
          ))}
        </div>

        <div className="field">
          <label className="field-label" htmlFor="code-libre">
            Ou le nom exact tel qu’il figure sur ta fiche
          </label>
          <input
            id="code-libre"
            className="input"
            type="text"
            autoComplete="off"
            value={libre}
            onChange={(evenement) => {
              setLibre(evenement.target.value)
            }}
          />
        </div>

        <div className="dialog__choix">
          <button
            type="button"
            className="btn btn-primary"
            disabled={libre.trim() === ''}
            onClick={() => {
              const nom = libre.trim()
              onChoisir(nom.toUpperCase().replace(/\s+/g, '_'), nom)
            }}
          >
            Ajouter cette ligne
          </button>
          <button type="button" className="btn btn-ghost" onClick={onAnnuler}>
            Annuler
          </button>
        </div>
      </div>
    </dialog>
  )
}

function FormulaireIndemnite({
  indemnite,
  autresCodes,
  modeSaisieHeure,
  onModifier,
  onSupprimer,
  onFermer,
}: {
  readonly indemnite: IndemniteConfig
  readonly autresCodes: readonly string[]
  readonly modeSaisieHeure: 'clavier' | 'selecteur'
  readonly onModifier: (modification: Partial<IndemniteConfig>) => void
  readonly onSupprimer: () => void
  readonly onFermer: () => void
}): React.JSX.Element {
  const typesEligibles = indemnite.typesSegmentEligibles ?? ['coupure']

  return (
    <dialog className="dialog" open aria-label="Configurer l’indemnité">
      <div className="dialog__corps">
        <h2 className="dialog__titre">{indemnite.libelle}</h2>

        <div className="field">
          <label className="field-label" htmlFor="ind-libelle">
            Nom sur ta fiche
          </label>
          <input
            id="ind-libelle"
            className="input"
            type="text"
            value={indemnite.libelle}
            onChange={(evenement) => {
              onModifier({ libelle: evenement.target.value })
            }}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="ind-montant">
            Montant unitaire
          </label>
          <input
            id="ind-montant"
            className="input"
            type="text"
            inputMode="decimal"
            placeholder="--,--"
            value={
              indemnite.montantCents === undefined
                ? ''
                : ecrireMontantSaisie(indemnite.montantCents)
            }
            onChange={(evenement) => {
              const lu = lireMontantSaisie(evenement.target.value)
              onModifier(lu === undefined ? sansMontant(indemnite) : { montantCents: lu })
            }}
          />
          {indemnite.montantCents === undefined ? (
            <span className="field-consequence">
              Sans montant, cette règle est désactivée : elle s’affichera
              « incalculable », jamais 0,00 €.
            </span>
          ) : null}
        </div>

        <div className="field">
          <span className="field-label">Quand elle se déclenche</span>
          <div className="seg seg--colonne">
            {(['plage_horaire', 'decouche', 'duree_service', 'quantite_manuelle'] as const).map(
              (declencheur) => (
                <button
                  key={declencheur}
                  type="button"
                  aria-pressed={indemnite.declencheur === declencheur}
                  onClick={() => {
                    onModifier({ declencheur })
                  }}
                >
                  {libelleDeclencheur(declencheur)}
                </button>
              ),
            )}
          </div>
        </div>

        {indemnite.declencheur === 'plage_horaire' ? (
          <>
            <div className="field">
              <span className="field-label">Plage à couvrir entièrement</span>
              <div className="bloc-horaire">
                <ChampHeure
                  label="De"
                  taille="normal"
                  mode={modeSaisieHeure}
                  valeur={indemnite.plageDebut}
                  onChange={(heure) => {
                    onModifier(heure === undefined ? sansPlage(indemnite, 'plageDebut') : { plageDebut: heure })
                  }}
                />
                <ChampHeure
                  label="À"
                  taille="normal"
                  mode={modeSaisieHeure}
                  valeur={indemnite.plageFin}
                  onChange={(heure) => {
                    onModifier(heure === undefined ? sansPlage(indemnite, 'plageFin') : { plageFin: heure })
                  }}
                />
              </div>
              <span className="field-consequence">
                Un seul segment doit recouvrir cette plage en entier. Si l’heure de fin est
                plus petite que celle de début, la plage traverse minuit.
              </span>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="ind-duree-min">
                Durée minimale du segment
              </label>
              <SaisieDuree
                identifiant="ind-duree-min"
                valeur={indemnite.dureeMinMinutes}
                onChange={(duree) => {
                  onModifier(duree === undefined ? sansDuree(indemnite) : { dureeMinMinutes: duree })
                }}
              />
            </div>

            <div className="field">
              <span className="field-label">Types de segment éligibles</span>
              <div className="cases">
                {TYPES_SEGMENT.map((type) => (
                  <label key={type} className="radio">
                    <input
                      type="checkbox"
                      checked={typesEligibles.includes(type)}
                      onChange={(evenement) => {
                        const suivants = evenement.target.checked
                          ? [...typesEligibles, type]
                          : typesEligibles.filter((t) => t !== type)
                        onModifier({ typesSegmentEligibles: suivants })
                      }}
                    />
                    {libelleType(type)}
                  </label>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {indemnite.declencheur === 'duree_service' ? (
          <div className="field">
            <label className="field-label" htmlFor="ind-amplitude">
              Amplitude minimale
            </label>
            <SaisieDuree
              identifiant="ind-amplitude"
              valeur={indemnite.amplitudeMinMinutes}
              onChange={(duree) => {
                onModifier(
                  duree === undefined ? sansAmplitude(indemnite) : { amplitudeMinMinutes: duree },
                )
              }}
            />
            <span className="field-consequence">
              Le seuil est inclusif : une amplitude exactement égale déclenche.
            </span>
          </div>
        ) : null}

        <div className="field">
          <label className="field-label" htmlFor="ind-max">
            Nombre maximum par journée
          </label>
          <input
            id="ind-max"
            className="input"
            type="text"
            inputMode="numeric"
            placeholder="1"
            value={indemnite.quantiteMaxParJour === undefined ? '' : String(indemnite.quantiteMaxParJour)}
            onChange={(evenement) => {
              const lu = lireEntierSaisie(evenement.target.value)
              onModifier(lu === undefined || lu < 1 ? sansMax(indemnite) : { quantiteMaxParJour: lu })
            }}
          />
          <span className="field-consequence">Vide : une seule par journée.</span>
        </div>

        {autresCodes.length === 0 ? null : (
          <div className="field">
            <span className="field-label">Incompatible avec</span>
            <div className="cases">
              {autresCodes.map((code) => {
                const coches = indemnite.incompatibleAvec ?? []
                return (
                  <label key={code} className="radio">
                    <input
                      type="checkbox"
                      checked={coches.includes(code)}
                      onChange={(evenement) => {
                        onModifier({
                          incompatibleAvec: evenement.target.checked
                            ? [...coches, code]
                            : coches.filter((c) => c !== code),
                        })
                      }}
                    />
                    {code}
                  </label>
                )
              })}
            </div>
            <span className="field-consequence">
              Quand deux incompatibles sont éligibles le même jour, l’app retient la plus
              élevée et le dit dans le détail.
            </span>
          </div>
        )}

        <div className="field">
          <label className="field-label" htmlFor="ind-source">
            D’où vient ce montant
          </label>
          <input
            id="ind-source"
            className="input"
            type="text"
            placeholder="Convention, article…"
            value={indemnite.source.kind === 'convention' ? indemnite.source.libelle : ''}
            onChange={(evenement) => {
              onModifier({
                source: {
                  kind: 'convention',
                  libelle: evenement.target.value,
                  saisiPar: 'utilisateur',
                },
              })
            }}
          />
        </div>

        <div className="dialog__choix">
          <button type="button" className="btn btn-primary" onClick={onFermer}>
            Terminé
          </button>
          <button type="button" className="btn btn-ghost" onClick={onSupprimer}>
            Supprimer cette indemnité
          </button>
        </div>
      </div>
    </dialog>
  )
}

// `exactOptionalPropertyTypes` distingue « absent » de « undefined » : on retire
// vraiment la clé plutôt que de la vider.
function sansMontant(i: IndemniteConfig): Partial<IndemniteConfig> {
  const copie = { ...i }
  delete copie.montantCents
  return copie
}

function sansPlage(i: IndemniteConfig, champ: 'plageDebut' | 'plageFin'): Partial<IndemniteConfig> {
  const copie = { ...i }
  delete copie[champ]
  return copie
}

function sansDuree(i: IndemniteConfig): Partial<IndemniteConfig> {
  const copie = { ...i }
  delete copie.dureeMinMinutes
  return copie
}

function sansAmplitude(i: IndemniteConfig): Partial<IndemniteConfig> {
  const copie = { ...i }
  delete copie.amplitudeMinMinutes
  return copie
}

function sansMax(i: IndemniteConfig): Partial<IndemniteConfig> {
  const copie = { ...i }
  delete copie.quantiteMaxParJour
  return copie
}


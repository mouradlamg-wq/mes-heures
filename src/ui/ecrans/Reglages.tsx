import { useEffect, useRef } from 'react'
import {
  CODES_INDEMNITES_COURANTS,
  ecrireDureeSaisie,
  ecrireMontantSaisie,
  ecrirePourcentageSaisie,
  formatMontant,
  lireDureeSaisie,
  lireEntierSaisie,
  lireMontantSaisie,
  lirePourcentageSaisie,
  type Cents,
  type Minutes,
  type ModeDecompteHS,
  type Settings,
} from '../../engine'
import { useDonnees } from '../../app/contexteDonnees'
import { TagStatut } from '../composants/Statut'

/**
 * Écran « Réglages » (DESIGN §10).
 *
 * **Un champ vide n'est pas neutre** : sous chaque champ non renseigné, une
 * ligne dit ce que son absence désactive. C'est la contrepartie visible de la
 * règle « absence de configuration = absence de donnée ».
 *
 * Aucun champ n'est prérempli avec une valeur plausible. L'app ne connaît ni ta
 * convention, ni tes tarifs.
 */
export function Reglages({
  reglageVise,
  onRetour,
}: {
  readonly reglageVise?: string | undefined
  readonly onRetour: () => void
}): React.JSX.Element {
  const { repo, settings } = useDonnees()
  const cible = useRef<HTMLDivElement>(null)

  useEffect(() => {
    cible.current?.scrollIntoView({ block: 'center' })
  }, [reglageVise])

  const modifier = (modification: Partial<Settings>): void => {
    void repo.ecrireSettings({ ...settings, ...modification })
  }

  const retirer = (champ: keyof Settings): void => {
    const copie = { ...settings }
    delete copie[champ]
    void repo.ecrireSettings(copie)
  }

  return (
    <>
      <div className="gouttiere jour-entete">
        <h1 className="jour-entete__date">Réglages</h1>
        <button type="button" className="btn btn-ghost" onClick={onRetour}>
          ← Ma journée
        </button>
      </div>

      <hr className="hr-section" />

      <Section titre="Période de paie">
        <ChampNombre
          identifiant="payPeriodConfig"
          vise={reglageVise}
          reference={cible}
          label="Jour de début de la période"
          aide="1 pour le mois civil, 26 si ton entreprise décompte du 26 au 25."
          consequence="Sans ce jour, aucune période ne peut être construite : ni heures sup, ni comparaison de fiche."
          valeur={settings.payPeriodConfig?.jourDebut}
          onChange={(valeur) => {
            if (valeur === undefined) {
              retirer('payPeriodConfig')
              return
            }
            modifier({ payPeriodConfig: { jourDebut: valeur } })
          }}
        />
      </Section>

      <hr className="hr-section" />

      <Section titre="Heures supplémentaires">
        <div className="field">
          <span className="field-label">Mode de décompte</span>
          <div className="seg">
            {(['hebdomadaire', 'mensuel', 'periode_reference'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={settings.modeDecompteHS === mode}
                onClick={() => {
                  modifier({ modeDecompteHS: mode })
                }}
              >
                {libelleMode(mode)}
              </button>
            ))}
          </div>
          {settings.modeDecompteHS === undefined ? (
            <span className="field-consequence">
              Sans ce mode, l'app ne sait pas sur quelle durée compter tes heures
              supplémentaires.
            </span>
          ) : null}
        </div>

        <ChampNombre
          identifiant="debutSemaine"
          vise={reglageVise}
          reference={cible}
          label="Premier jour de la semaine"
          aide="1 = lundi. Le lundi est le régime supplétif, mais un accord peut en décider autrement."
          consequence="Sans ce jour, le décompte hebdomadaire reste incalculable. L'app ne suppose pas le lundi."
          valeur={settings.debutSemaine}
          onChange={(valeur) => {
            if (valeur === undefined || valeur < 1 || valeur > 7) {
              retirer('debutSemaine')
              return
            }
            modifier({ debutSemaine: valeur as 1 | 2 | 3 | 4 | 5 | 6 | 7 })
          }}
        />

        <ChampDuree
          identifiant="dureeReferenceMinutes"
          vise={reglageVise}
          reference={cible}
          label="Durée de référence de la période de décompte"
          aide="En heures et minutes. C'est la durée à partir de laquelle tes heures deviennent supplémentaires."
          consequence="Sans elle, l'app ne peut pas dire à partir de quand tes heures deviennent supplémentaires."
          valeur={settings.dureeReferenceMinutes}
          onChange={(valeur) => {
            if (valeur === undefined) {
              retirer('dureeReferenceMinutes')
              return
            }
            modifier({ dureeReferenceMinutes: valeur })
          }}
        />

        <ChampMontant
          identifiant="tauxHoraireBaseCents"
          vise={reglageVise}
          reference={cible}
          label="Taux horaire de base"
          aide="Celui qui figure sur ta fiche de paie."
          consequence="Sans ce taux, le brut et le montant des heures supplémentaires restent incalculables."
          valeur={settings.tauxHoraireBaseCents}
          onChange={(valeur) => {
            if (valeur === undefined) {
              retirer('tauxHoraireBaseCents')
              return
            }
            modifier({ tauxHoraireBaseCents: valeur })
          }}
        />
      </Section>

      <hr className="hr-section" />

      <Section titre="Coupures et disponibilité">
        <ChampFraction
          identifiant="fractionDisponibiliteRemuneree"
          vise={reglageVise}
          reference={cible}
          label="Part rémunérée de la disponibilité"
          aide="En pourcentage. 50 si une heure d'attente est payée une demi-heure."
          consequence="Sans elle, toute journée contenant de la disponibilité devient incalculable. L'app ne choisit ni 0 %, ni 100 %."
          valeur={settings.fractionDisponibiliteRemuneree}
          onChange={(valeur) => {
            if (valeur === undefined) {
              retirer('fractionDisponibiliteRemuneree')
              return
            }
            modifier({ fractionDisponibiliteRemuneree: valeur })
          }}
        />
      </Section>

      <hr className="hr-section" />

      <Section titre="Indemnités">
        <p className="mention">
          L'app ne fournit aucun montant. Reprends-les sur ta convention ou sur une fiche de
          paie.
        </p>
        <ul className="liste-indemnites">
          {CODES_INDEMNITES_COURANTS.map((propose) => {
            const configuree = settings.indemnites.find((i) => i.code === propose.code)
            return (
              <li key={propose.code} className="liste-indemnite">
                <span className="liste-indemnite__libelle">
                  {propose.libelle}
                  <br />
                  <span className="liste-indemnite__code">{propose.code}</span>
                </span>
                {configuree?.montantCents === undefined ? (
                  <TagStatut statut="unknown" />
                ) : (
                  <span className="liste-indemnite__montant">
                    {formatMontant(configuree.montantCents)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        <p className="field-consequence">
          La configuration détaillée des indemnités (plages horaires,
          incompatibilités) arrive à l'écran suivant. Le moteur, lui, les traite déjà.
        </p>
      </Section>

      <hr className="hr-section" />

      <Section titre="Fuseau de référence">
        <p className="field-consequence">
          Semaine, période et journée sont définies dans <strong>{settings.timeZoneReference}</strong>,
          jamais dans le fuseau de ton téléphone.
        </p>
      </Section>
    </>
  )
}

function Section({
  titre,
  children,
}: {
  readonly titre: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="gouttiere reglages__section">
      <p className="kicker reglages__titre">{titre}</p>
      {children}
    </section>
  )
}

type ProprietesChamp<T> = {
  readonly identifiant: string
  readonly vise: string | undefined
  readonly reference: React.RefObject<HTMLDivElement | null>
  readonly label: string
  readonly aide: string
  readonly consequence: string
  readonly valeur: T | undefined
  readonly onChange: (valeur: T | undefined) => void
}

function Enveloppe({
  identifiant,
  vise,
  reference,
  label,
  aide,
  consequence,
  rempli,
  children,
}: {
  readonly identifiant: string
  readonly vise: string | undefined
  readonly reference: React.RefObject<HTMLDivElement | null>
  readonly label: string
  readonly aide: string
  readonly consequence: string
  readonly rempli: boolean
  readonly children: React.ReactNode
}): React.JSX.Element {
  const estVise = vise === identifiant
  return (
    <div className="field" ref={estVise ? reference : undefined} data-reglage={identifiant}>
      <label className="field-label" htmlFor={identifiant}>
        {label}
      </label>
      {children}
      <span className="field-consequence">{aide}</span>
      {rempli ? null : <span className="field-consequence">{consequence}</span>}
    </div>
  )
}

function ChampNombre(proprietes: ProprietesChamp<number>): React.JSX.Element {
  return (
    <Enveloppe {...proprietes} rempli={proprietes.valeur !== undefined}>
      <input
        id={proprietes.identifiant}
        className="input"
        type="text"
        inputMode="numeric"
        value={proprietes.valeur === undefined ? '' : String(proprietes.valeur)}
        onChange={(evenement) => {
          proprietes.onChange(lireEntierSaisie(evenement.target.value))
        }}
      />
    </Enveloppe>
  )
}

/** Saisie en `HH:mm`. La conversion en minutes est faite par le moteur. */
function ChampDuree(proprietes: ProprietesChamp<Minutes>): React.JSX.Element {
  return (
    <Enveloppe {...proprietes} rempli={proprietes.valeur !== undefined}>
      <input
        id={proprietes.identifiant}
        className="input"
        type="text"
        inputMode="numeric"
        placeholder="--:--"
        value={proprietes.valeur === undefined ? '' : ecrireDureeSaisie(proprietes.valeur)}
        onChange={(evenement) => {
          const lue = lireDureeSaisie(evenement.target.value)
          // Une saisie incomplète ne remplace pas la valeur : on attend qu'elle
          // soit lisible plutôt que d'écrire une durée à moitié tapée.
          if (lue !== undefined || evenement.target.value.replace(/\D/g, '') === '') {
            proprietes.onChange(lue)
          }
        }}
      />
    </Enveloppe>
  )
}

/** Saisie en euros, stockée en centimes entiers : aucun flottant ne passe. */
function ChampMontant(proprietes: ProprietesChamp<Cents>): React.JSX.Element {
  return (
    <Enveloppe {...proprietes} rempli={proprietes.valeur !== undefined}>
      <input
        id={proprietes.identifiant}
        className="input"
        type="text"
        inputMode="decimal"
        placeholder="0,00"
        value={proprietes.valeur === undefined ? '' : ecrireMontantSaisie(proprietes.valeur)}
        onChange={(evenement) => {
          proprietes.onChange(lireMontantSaisie(evenement.target.value))
        }}
      />
    </Enveloppe>
  )
}

/** Saisie en pourcentage, stockée en fraction 0..1. */
function ChampFraction(proprietes: ProprietesChamp<number>): React.JSX.Element {
  return (
    <Enveloppe {...proprietes} rempli={proprietes.valeur !== undefined}>
      <input
        id={proprietes.identifiant}
        className="input"
        type="text"
        inputMode="numeric"
        placeholder="%"
        value={
          proprietes.valeur === undefined ? '' : ecrirePourcentageSaisie(proprietes.valeur)
        }
        onChange={(evenement) => {
          const lue = lirePourcentageSaisie(evenement.target.value)
          if (lue !== undefined || evenement.target.value.replace(/\D/g, '') === '') {
            proprietes.onChange(lue)
          }
        }}
      />
    </Enveloppe>
  )
}

function libelleMode(mode: ModeDecompteHS): string {
  switch (mode) {
    case 'hebdomadaire':
      return 'Semaine'
    case 'mensuel':
      return 'Mois'
    case 'periode_reference':
      return 'Cycle'
  }
}

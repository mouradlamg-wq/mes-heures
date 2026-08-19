import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  comparerAvecFiche,
  detaillerIntervalle,
  formatDuree,
  formatEcartDuree,
  formatEcartMontant,
  formatIntervalleDuree,
  formatIntervalleMontant,
  formatMontant,
  formatSource,
  MENTIONS,
  periodePour,
  qualifierJournee,
  synthetiserPeriode,
  type Comparaison,
  type Ecart,
  type ISODate,
  type LigneEcart,
} from '../../engine'
import { nouvelId, useDonnees } from '../../app/contexteDonnees'
import { TagStatut } from '../composants/Statut'
import { SaisieValeurFiche } from '../composants/SaisieValeurFiche'

/** Étapes montrées dans un dépliant avant de résumer le reste. */
const ETAPES_VISIBLES = 8

/**
 * Écran « Vérifier ma paie » (DESIGN §11) — le plus délicat de l'app, parce
 * qu'il met en cause une fiche de paie.
 *
 * Le visuel est **froid** : aucune couleur d'alarme, aucun ton accusateur. Un
 * écart se lit en encre, avec son signe. Le rouge ne colore jamais un écart,
 * ni en positif ni en négatif — un écart favorable et un écart défavorable ont
 * exactement le même traitement.
 */
export function VerifierMaPaie({
  onOuvrirReglages,
  onEditerReleve,
}: {
  readonly onOuvrirReglages: (reglage?: string) => void
  readonly onEditerReleve: (debut: ISODate, fin: ISODate) => void
}): React.JSX.Element {
  const { repo, settings, zone, aujourdhui } = useDonnees()
  const [ancre] = useState<ISODate>(aujourdhui)
  const [depliee, setDepliee] = useState<string | undefined>(undefined)

  const periode = periodePour(ancre, settings)
  const bornes = periode.status === 'complete' ? periode.value : undefined

  const donnees = useLiveQuery(
    async () => {
      if (bornes === undefined) {
        return undefined
      }
      const jours = await repo.lireJourneesEntre(bornes.debut, bornes.fin)
      const qualifications = await repo.lireQualifications(jours.map((j) => j.id))
      const absences = await repo.lireAbsencesEntre(bornes.debut, bornes.fin)
      const saisies = await repo.lireSaisiesIndemnites(jours.map((j) => j.id))
      const fiche = await repo.lirePayCheck(bornes.id)
      return { jours, qualifications, absences, saisies, fiche }
    },
    [bornes?.id],
    undefined,
  )

  if (bornes === undefined) {
    return (
      <>
        <EnTete libelle="Vérifier ma paie" bornes={undefined} />
        <div className="gouttiere">
          <div className="incalculable">
            <TagStatut statut="unknown" />
            <p className="incalculable__phrase">
              {periode.warnings.at(-1)?.message ?? "La période de paie n'est pas réglée."}
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                onOuvrirReglages('payPeriodConfig')
              }}
            >
              Renseigner la période de paie →
            </button>
          </div>
        </div>
      </>
    )
  }

  if (donnees === undefined) {
    return (
      <>
        <EnTete libelle="Vérifier ma paie" bornes={bornes.label} />
        <div className="gouttiere">
          <p className="mention">Calcul en cours…</p>
        </div>
      </>
    )
  }

  const paires = donnees.jours.map((jour) => ({
    jour,
    journee: qualifierJournee(jour, zone, donnees.qualifications),
  }))
  const synthese = synthetiserPeriode(
    bornes,
    paires,
    settings,
    donnees.absences,
    donnees.saisies,
  )
  const detail = detaillerIntervalle(bornes.debut, bornes.fin, paires, settings, donnees.absences)
  const comparaison = comparerAvecFiche(bornes, synthese, detail, donnees.fiche)

  const ficheCourante = donnees.fiche
  const enregistrerFiche = (modification: object): void => {
    const base = ficheCourante ?? { id: nouvelId('fiche'), payPeriodId: bornes.id }
    void repo.enregistrerPayCheck({ ...base, ...modification })
  }

  return (
    <>
      <EnTete libelle="Vérifier ma paie" bornes={bornes.label} />

      <hr className="hr-section" />

      <CompteurEcart comparaison={comparaison} mois={bornes.label} />

      <hr className="hr-section" />

      {/* En tête de la liste, jamais en pied, jamais en accordéon (DESIGN §13). */}
      <div className="gouttiere ecart-mention">
        <p className="mention">{MENTIONS.ecarts}</p>
      </div>

      <hr className="hr-section" />

      <ul className="ecarts">
        {comparaison.lignes.map((ligne) => (
          <LigneDEcart
            key={ligne.code}
            ligne={ligne}
            ouverte={depliee === ligne.code}
            onBasculer={() => {
              // Une seule ligne dépliée à la fois (DESIGN §11).
              setDepliee(depliee === ligne.code ? undefined : ligne.code)
            }}
            onSaisir={(valeur) => {
              enregistrerFiche(valeurFiche(ligne, valeur, ficheCourante))
            }}
            onOuvrirReglages={onOuvrirReglages}
          />
        ))}
      </ul>

      <div className="pied">
        <hr className="hr-section" />
        <div className="gouttiere pied__action">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onEditerReleve(bornes.debut, bornes.fin)
            }}
          >
            Éditer le relevé de {bornes.label.toLowerCase()}
          </button>
        </div>
      </div>
    </>
  )
}

function EnTete({
  libelle,
  bornes,
}: {
  readonly libelle: string
  readonly bornes: string | undefined
}): React.JSX.Element {
  return (
    <div className="gouttiere periode-entete">
      <h1 className="periode-entete__titre">{libelle}</h1>
      {bornes === undefined ? null : <span className="legende">{bornes}</span>}
    </div>
  )
}

/**
 * Le compteur ne porte que du **certain**, et ne mélange jamais deux grandeurs :
 * l'écart d'heures supplémentaires en grand, l'écart monétaire en sous-ligne.
 */
function CompteurEcart({
  comparaison,
  mois,
}: {
  readonly comparaison: Comparaison
  readonly mois: string
}): React.JSX.Element {
  const heures = comparaison.ecartHeuresSup
  const euros = comparaison.ecartIndemnites

  return (
    <section className="compteur gouttiere">
      <p className="kicker">Écart constaté — {mois}</p>

      {heures === undefined ? (
        <p className="compteur__phrase">
          {comparaison.lignesComparees === 0
            ? "Recopie les lignes de ta fiche ci-dessous : tant qu'il n'y a rien à comparer, il n'y a pas d'écart à montrer."
            : "L'écart sur les heures supplémentaires n'est pas calculable."}
        </p>
      ) : (
        <p className="compteur__valeur compteur__valeur--total">
          {formatEcartDuree(heures.valeur).sexagesimal}
        </p>
      )}

      {euros === undefined ? null : (
        <p className="compteur__centiemes">
          en heures supplémentaires, {formatEcartMontant(euros.valeur)} en indemnités
        </p>
      )}

      <div className="compteur__tags">
        <TagStatut statut={comparaison.statut} />
        {comparaison.lignesIncalculables > 0 ? (
          <span className="tag tag-neutre tag-valeur">
            {comparaison.lignesIncalculables} ligne
            {comparaison.lignesIncalculables > 1 ? 's' : ''} incalculable
            {comparaison.lignesIncalculables > 1 ? 's' : ''}
          </span>
        ) : null}
        <span className="tag tag-neutre tag-valeur">
          {comparaison.lignesComparees} ligne{comparaison.lignesComparees > 1 ? 's' : ''} comparée
          {comparaison.lignesComparees > 1 ? 's' : ''}
        </span>
      </div>
    </section>
  )
}

function LigneDEcart({
  ligne,
  ouverte,
  onBasculer,
  onSaisir,
  onOuvrirReglages,
}: {
  readonly ligne: LigneEcart
  readonly ouverte: boolean
  readonly onBasculer: () => void
  readonly onSaisir: (valeur: number | undefined) => void
  readonly onOuvrirReglages: (reglage?: string) => void
}): React.JSX.Element {
  const depliable = ligne.calcule.steps.length > 0

  if (ligne.calcule.status === 'unknown') {
    const cause = ligne.calcule.warnings.at(-1)
    return (
      <li className="ecart ecart--incalculable">
        <div className="ecart__entete">
          <span className="ecart__libelle">{ligne.libelle}</span>
          <TagStatut statut="unknown" />
        </div>
        <div className="incalculable">
          <p className="incalculable__phrase">
            {cause?.message ?? "Je ne peux pas calculer cette ligne."}
          </p>
          {cause?.reglageManquant === undefined ? null : (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                onOuvrirReglages(cause.reglageManquant)
              }}
            >
              Renseigner ce réglage →
            </button>
          )}
        </div>
      </li>
    )
  }

  const partielle = ligne.calcule.status === 'partial'

  return (
    <li className={`ecart ${partielle ? 'ecart--partielle' : ''}`}>
      {/*
        La ligne n'est pas un bouton d'un seul tenant : elle contient un champ de
        saisie, et un contrôle dans un bouton est du HTML invalide — le champ
        devient impossible à remplir. Le dépliage a donc son propre bouton, en
        pleine largeur sous les valeurs.
      */}
      <div className="ecart__corps">
        <div className="ecart__entete">
          <span className="ecart__libelle">{ligne.libelle}</span>
          <TagStatut statut={ligne.calcule.status} />
        </div>

        <div className="ecart__valeurs">
          <div className="ecart__colonne">
            <span className="legende">Toi</span>
            <span className="ecart__valeur">{valeurCalculee(ligne)}</span>
          </div>

          {/* Sur un résultat partiel, la colonne « ta fiche » disparaît : on ne
              compare pas une borne (DESIGN §11). */}
          {partielle ? null : (
            <div className="ecart__colonne ecart__colonne--fiche">
              <span className="legende">Ta fiche</span>
              <SaisieValeurFiche unite={ligne.unite} valeur={ligne.fiche} onChange={onSaisir} />
            </div>
          )}

          <div className="ecart__colonne ecart__colonne--ecart">
            <span className="legende">Écart</span>
            <span className="ecart__valeur ecart__valeur--ecart">
              {rendreEcart(ligne, ligne.ecart)}
            </span>
          </div>
        </div>
      </div>

      {depliable ? (
        <button
          type="button"
          className="ecart__depliant"
          onClick={onBasculer}
          aria-expanded={ouverte}
        >
          {ouverte
            ? 'Replier le détail'
            : `${String(ligne.calcule.steps.length)} étape${ligne.calcule.steps.length > 1 ? 's' : ''} · appuie pour voir le détail`}
        </button>
      ) : null}

      {ouverte ? <Preuves ligne={ligne} /> : null}
    </li>
  )
}

/**
 * Dépliant de preuves (DESIGN §7) : c'est la traduction visuelle de « le moteur
 * produit des preuves, pas des nombres ».
 */
function Preuves({ ligne }: { readonly ligne: LigneEcart }): React.JSX.Element {
  return (
    <div className="preuves">
      <p className="kicker">Comment j’arrive à {valeurCalculee(ligne)}</p>
      {/*
        Un mois produit une étape par journée : les afficher toutes noierait la
        preuve sous sa propre longueur. On en montre assez pour comprendre le
        calcul, et on annonce le reste — les journées complètes restent
        atteignables par l'écran « Ma période ».
      */}
      <ol className="preuves__etapes">
        {ligne.calcule.steps.slice(0, ETAPES_VISIBLES).map((etape, index) => (
          <li key={`${etape.label}-${String(index)}`} className="preuves__etape">
            <span className="preuves__label">{etape.label}</span>
            <span className="preuves__detail">{etape.detail}</span>
          </li>
        ))}
      </ol>
      {ligne.calcule.steps.length > ETAPES_VISIBLES ? (
        <p className="preuves__sources">
          et {ligne.calcule.steps.length - ETAPES_VISIBLES} autres étapes du même genre.
        </p>
      ) : null}
      {ligne.calcule.sources.length === 0 ? null : (
        <p className="preuves__sources">
          {ligne.calcule.sources.map((source) => formatSource(source)).join(' · ')}
        </p>
      )}
      <p className="preuves__jours">
        {ligne.dayIds.length} journée{ligne.dayIds.length > 1 ? 's' : ''} composent cette valeur.
      </p>
    </div>
  )
}

// ————————————————————————————————————————————————————————
// Mise en forme — aucune arithmétique métier
// ————————————————————————————————————————————————————————

function valeurCalculee(ligne: LigneEcart): string {
  switch (ligne.unite) {
    case 'duree': {
      const r = ligne.calcule
      switch (r.status) {
        case 'complete':
          return formatDuree(r.value).sexagesimal
        case 'partial':
          return formatIntervalleDuree(r.range.min, r.range.max).sexagesimal
        case 'unknown':
          return ''
      }
      break
    }
    case 'montant': {
      const r = ligne.calcule
      switch (r.status) {
        case 'complete':
          return formatMontant(r.value)
        case 'partial':
          return formatIntervalleMontant(r.range.min, r.range.max)
        case 'unknown':
          return ''
      }
      break
    }
    case 'quantite': {
      const r = ligne.calcule
      return r.status === 'complete' ? String(r.value) : ''
    }
  }
  return ''
}

/**
 * Un écart nul s'écrit « aucun » et non `0,00 €` : l'absence d'écart est une
 * information, pas un vide (DESIGN §11).
 */
function rendreEcart(ligne: LigneEcart, ecart: Ecart | undefined): string {
  if (ecart === undefined) {
    return 'non comparé'
  }
  if (ecart.valeur === 0) {
    return ecart.dansIncertitude ? 'compatible' : 'aucun'
  }
  if (ligne.unite === 'duree') {
    return formatEcartDuree(ecart.valeur).sexagesimal
  }
  if (ligne.unite === 'montant') {
    return formatEcartMontant(ecart.valeur)
  }
  return ecart.valeur > 0 ? `+${String(ecart.valeur)}` : String(ecart.valeur)
}

/** Construit la modification de fiche correspondant à la ligne saisie. */
function valeurFiche(
  ligne: LigneEcart,
  valeur: number | undefined,
  fiche: { indemnitesPayees?: readonly { code: string }[] } | undefined,
): object {
  if (ligne.code === 'HEURES_SUP') {
    return valeur === undefined ? { heuresSupPayees: undefined } : { heuresSupPayees: valeur }
  }
  if (ligne.code === 'TEMPS_REMUNERE') {
    return valeur === undefined
      ? { heuresPayeesCentiemes: undefined }
      : { heuresPayeesCentiemes: valeur }
  }
  if (ligne.code === 'BRUT') {
    return { brutCents: valeur }
  }

  const autres = (fiche?.indemnitesPayees ?? []).filter((i) => i.code !== ligne.code)
  if (valeur === undefined) {
    return { indemnitesPayees: autres }
  }
  const saisie =
    ligne.unite === 'montant'
      ? { code: ligne.code, montantCents: valeur }
      : { code: ligne.code, quantite: valeur }
  return { indemnitesPayees: [...autres, saisie] }
}

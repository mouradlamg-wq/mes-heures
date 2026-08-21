import { useState } from 'react'
import { ecrireDureeSaisie, formatDuree, lireDureeSaisie, type Minutes } from '../../engine'

/**
 * Saisie d'une durée au clavier numérique : on tape les heures puis les
 * minutes, sans séparateur. `15140` vaut 151 h 40.
 *
 * Le champ garde **sa propre chaîne** pendant la frappe. C'est indispensable :
 * une durée n'est lisible qu'à partir de trois chiffres, donc dans un champ
 * purement contrôlé les deux premières touches n'ont rien à réécrire, l'affichage
 * repart à vide, et le champ devient impossible à remplir.
 *
 * La ligne sous le champ relit la saisie à voix haute, **en centièmes aussi** :
 * c'est sous cette forme qu'une durée de référence figure sur une fiche de paie
 * française, et c'est ce qui permet de vérifier qu'on a tapé le bon nombre.
 */
export function SaisieDuree({
  identifiant,
  valeur,
  onChange,
}: {
  readonly identifiant: string
  readonly valeur: Minutes | undefined
  readonly onChange: (duree: Minutes | undefined) => void
}): React.JSX.Element {
  const canonique = valeur === undefined ? '' : ecrireDureeSaisie(valeur)

  const [saisie, setSaisie] = useState(canonique)
  const [dernierCanonique, setDernierCanonique] = useState(canonique)

  // La valeur enregistrée vient de changer. Si elle dit déjà la même chose que
  // ce qui est tapé, on ne touche à rien — sinon on réécrirait « 151 » en
  // « 01:51 » sous les doigts de l'utilisateur, au troisième chiffre.
  if (canonique !== dernierCanonique) {
    setDernierCanonique(canonique)
    if (lireDureeSaisie(saisie) !== lireDureeSaisie(canonique)) {
      setSaisie(canonique)
    }
  }

  return (
    <>
      <input
        id={identifiant}
        className="input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="--:--"
        value={saisie}
        onBlur={() => {
          // Une saisie invalide reste affichée telle quelle : la remplacer par
          // le dernier préfixe valide enregistré ferait apparaître un nombre
          // différent de celui tapé, sans un mot d'explication.
          if (lireDureeSaisie(saisie) !== undefined || saisie === '') {
            setSaisie(canonique)
          }
        }}
        onChange={(evenement) => {
          const chiffres = evenement.target.value.replace(/\D/g, '').slice(0, 6)
          setSaisie(chiffres)

          if (chiffres === '') {
            onChange(undefined)
            return
          }
          const lue = lireDureeSaisie(chiffres)
          // Une saisie encore trop courte n'écrase rien : elle attend la suite.
          if (lue !== undefined) {
            onChange(lue)
          }
        }}
      />
      <LectureDuree saisie={saisie} />
    </>
  )
}

/** Relit la saisie en cours. Les deux derniers chiffres sont les minutes. */
function LectureDuree({ saisie }: { readonly saisie: string }): React.JSX.Element {
  if (saisie === '') {
    return (
      <span className="field-consequence">
        Tape les heures puis les minutes, sans séparateur : « 15140 » pour 151 h 40.
      </span>
    )
  }

  const lue = lireDureeSaisie(saisie)
  if (lue === undefined) {
    // Les deux derniers chiffres sont toujours lus comme des minutes : au-delà
    // de 59, aucune suite de chiffres ne peut rendre la saisie valide. Le dire
    // évite de laisser croire que continuer à taper va résoudre le problème —
    // c'est aussi la confusion la plus probable : une valeur recopiée telle
    // quelle depuis une fiche de paie, où elle est écrite en centièmes.
    const minutesTapees = saisie.length >= 2 ? Number(saisie.slice(-2)) : undefined
    if (minutesTapees !== undefined && minutesTapees > 59) {
      return (
        <span className="field-consequence field-consequence--alerte">
          {minutesTapees} ne peut pas être des minutes (jusqu’à 59 seulement). Si tu recopies un
          nombre écrit en centièmes sur ta fiche, ce n’est pas ce format : « 151,67 » s’écrit
          151 h 40 en heures et minutes.
        </span>
      )
    }
    return (
      <span className="field-consequence">
        Continue : les deux derniers chiffres seront les minutes.
      </span>
    )
  }

  return (
    <span className="field-consequence">
      Se lit {formatDuree(lue).sexagesimal}, soit {formatDuree(lue).centiemes} sur ta fiche.
    </span>
  )
}

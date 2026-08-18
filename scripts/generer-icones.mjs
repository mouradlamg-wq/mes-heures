import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

/**
 * Fabrique les icônes de la PWA à partir du dessin source de `docs/aperçu`.
 *
 * Script de **build**, lancé à la main quand le dessin change :
 * `node scripts/generer-icones.mjs`. Rien de tout ceci ne tourne dans l'app.
 *
 * Deux traitements distincts, parce que les systèmes n'attendent pas la même
 * chose :
 *
 * - `any` — le carré arrondi tel quel, **coins transparents**. Le système pose
 *   l'icône telle qu'elle est dessinée.
 * - `maskable` — un carré **plein bord à bord**. Android y découpe la forme de
 *   son choix (cercle, goutte, squircle) ; un coin transparent y deviendrait un
 *   angle vide.
 *
 * Le dessin source a des coins **noirs opaques** — un artefact de sa génération.
 * Laissés tels quels, ils donneraient quatre angles noirs sur l'écran d'accueil.
 */

const RACINE = fileURLToPath(new URL('..', import.meta.url))
const SOURCE = join(RACINE, 'docs/aperçu/ChatGPT Image 18 août 2026, 20_37_34.png')
const PUBLIC = join(RACINE, 'public')

/**
 * Le fond du dessin est orange vif — plus de 200 sur le rouge partout. Tout
 * pixel nettement sombre **rencontré depuis un bord** appartient donc au coin
 * noir ou à son anticrénelage, jamais au volant : le balayage s'arrête au
 * premier pixel clair et n'entre jamais dans le dessin.
 */
const SEUIL_FOND = 170

function estCoin(data, index) {
  return data[index] < SEUIL_FOND && data[index + 1] < SEUIL_FOND && data[index + 2] < SEUIL_FOND
}

/** Proportion du pixel couverte par un carré à coins arrondis, en 4 sous-points. */
function couverture(x, y, taille, rayon) {
  let dedans = 0
  for (const dx of [0.25, 0.75]) {
    for (const dy of [0.25, 0.75]) {
      const px = x + dx
      const py = y + dy
      const cx = Math.min(Math.max(px, rayon), taille - rayon)
      const cy = Math.min(Math.max(py, rayon), taille - rayon)
      const distance = Math.hypot(px - cx, py - cy)
      if (distance <= rayon) {
        dedans += 1
      }
    }
  }
  return dedans / 4
}

/**
 * Découpe un carré à coins arrondis dans une image pleine.
 *
 * On redessine l'arrondi plutôt que d'essayer de récupérer celui du fichier
 * source : son anticrénelage part du noir, et le récupérer laisserait un liseré
 * sombre autour de l'icône.
 */
function masqueArrondi(source, proportionRayon) {
  const sortie = new PNG({ width: source.width, height: source.height })
  source.data.copy(sortie.data)

  const rayon = source.width * proportionRayon
  for (let y = 0; y < sortie.height; y += 1) {
    for (let x = 0; x < sortie.width; x += 1) {
      const i = (y * sortie.width + x) << 2
      sortie.data[i + 3] = Math.round(255 * couverture(x, y, sortie.width, rayon))
    }
  }
  return sortie
}

/**
 * Prolonge le fond dans les coins, en reprenant le pixel utile le plus proche
 * sur la même ligne. Le fond est un dégradé quasi vertical : l'extension
 * horizontale ne laisse donc aucun raccord visible.
 */
function coinsRemplis(source) {
  const sortie = new PNG({ width: source.width, height: source.height })
  source.data.copy(sortie.data)

  for (let y = 0; y < sortie.height; y += 1) {
    const ligne = y * sortie.width

    let gauche = 0
    while (gauche < sortie.width && estCoin(sortie.data, (ligne + gauche) << 2)) {
      gauche += 1
    }
    let droite = sortie.width - 1
    while (droite >= 0 && estCoin(sortie.data, (ligne + droite) << 2)) {
      droite -= 1
    }
    // Ligne entièrement dans le coin : rien à prolonger, on la laisse au
    // remplissage vertical du passage suivant.
    if (gauche > droite) {
      continue
    }

    for (let x = 0; x < gauche; x += 1) {
      copierPixel(sortie, ligne + gauche, ligne + x)
    }
    for (let x = droite + 1; x < sortie.width; x += 1) {
      copierPixel(sortie, ligne + droite, ligne + x)
    }
  }

  // Les toutes premières et dernières lignes peuvent être noires de bout en
  // bout : on les reprend de la ligne utile la plus proche.
  for (let y = 0; y < sortie.height; y += 1) {
    if (!estCoin(sortie.data, (y * sortie.width) << 2)) {
      continue
    }
    const sourceY = y < sortie.height / 2 ? premiereLigneUtile(sortie) : derniereLigneUtile(sortie)
    for (let x = 0; x < sortie.width; x += 1) {
      copierPixel(sortie, sourceY * sortie.width + x, y * sortie.width + x)
    }
  }

  for (let i = 3; i < sortie.data.length; i += 4) {
    sortie.data[i] = 255
  }
  return sortie
}

function premiereLigneUtile(png) {
  for (let y = 0; y < png.height; y += 1) {
    if (!estCoin(png.data, (y * png.width) << 2)) {
      return y
    }
  }
  return 0
}

function derniereLigneUtile(png) {
  for (let y = png.height - 1; y >= 0; y -= 1) {
    if (!estCoin(png.data, (y * png.width) << 2)) {
      return y
    }
  }
  return png.height - 1
}

function copierPixel(png, indexSource, indexCible) {
  const s = indexSource << 2
  const c = indexCible << 2
  png.data[c] = png.data[s]
  png.data[c + 1] = png.data[s + 1]
  png.data[c + 2] = png.data[s + 2]
  png.data[c + 3] = png.data[s + 3]
}

/**
 * Réduction par moyenne de blocs, **alpha prémultiplié**. Sans la
 * prémultiplication, les pixels transparents des coins tireraient la couleur
 * des pixels voisins vers le noir et cerneraient l'icône d'un liseré sombre.
 */
function reduire(source, taille) {
  const sortie = new PNG({ width: taille, height: taille })
  const facteur = source.width / taille

  for (let y = 0; y < taille; y += 1) {
    const y0 = Math.floor(y * facteur)
    const y1 = Math.min(source.height, Math.floor((y + 1) * facteur))

    for (let x = 0; x < taille; x += 1) {
      const x0 = Math.floor(x * facteur)
      const x1 = Math.min(source.width, Math.floor((x + 1) * facteur))

      let r = 0
      let v = 0
      let b = 0
      let a = 0
      let n = 0

      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * source.width + sx) << 2
          const alpha = source.data[i + 3] / 255
          r += source.data[i] * alpha
          v += source.data[i + 1] * alpha
          b += source.data[i + 2] * alpha
          a += source.data[i + 3]
          n += 1
        }
      }

      const j = (y * taille + x) << 2
      const alphaMoyen = a / n
      const poids = alphaMoyen === 0 ? 0 : n * (alphaMoyen / 255)
      sortie.data[j] = poids === 0 ? 0 : Math.round(r / poids)
      sortie.data[j + 1] = poids === 0 ? 0 : Math.round(v / poids)
      sortie.data[j + 2] = poids === 0 ? 0 : Math.round(b / poids)
      sortie.data[j + 3] = Math.round(alphaMoyen)
    }
  }
  return sortie
}

function ecrire(png, nom) {
  const chemin = join(PUBLIC, nom)
  writeFileSync(chemin, PNG.sync.write(png, { deflateLevel: 9 }))
  const ko = (readFileSync(chemin).length / 1024).toFixed(1)
  console.warn(`${nom} — ${png.width}×${png.height}, ${ko} ko`)
}

const source = PNG.sync.read(readFileSync(SOURCE))
const plein = coinsRemplis(source)
// 22 % : la proportion du « squircle » des écrans d'accueil.
const transparent = masqueArrondi(plein, 0.22)

ecrire(reduire(transparent, 192), 'icon-192.png')
ecrire(reduire(transparent, 512), 'icon-512.png')
ecrire(reduire(plein, 512), 'icon-512-maskable.png')
// iOS ignore `maskable` et applique son propre arrondi : il lui faut une icône
// opaque, sans coin transparent.
ecrire(reduire(plein, 180), 'apple-touch-icon.png')

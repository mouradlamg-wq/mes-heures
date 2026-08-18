import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * ARC — le test qui garde le moteur testable (CLAUDE.md §4).
 *
 * Il est aussi important que les tests de calcul : dès qu'un import de React ou
 * un `Date.now()` s'installe dans `src/engine`, le moteur cesse d'être
 * vérifiable sans navigateur, et la promesse « juste ou absent » devient
 * invérifiable.
 */

const RACINE = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(RACINE, 'src')

async function fichiersSous(dossier: string): Promise<string[]> {
  const entrees = await readdir(dossier, { withFileTypes: true, recursive: true })
  return entrees
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => join(e.parentPath, e.name))
}

function lire(chemin: string): string {
  return readFileSync(chemin, 'utf8')
}

/** Retire commentaires et littéraux de chaîne : on analyse du code, pas de la prose. */
function codeSeul(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
}

const fichiersMoteur = await fichiersSous(join(SRC, 'engine'))
const tousLesFichiers = await fichiersSous(SRC)

function court(chemin: string): string {
  return relative(RACINE, chemin).split(sep).join('/')
}

/** Chaque fichier du moteur, passé au crible d'un motif interdit. */
function aucunDansLeMoteur(motif: RegExp, exceptions: readonly string[] = []): void {
  const coupables: string[] = []
  for (const fichier of fichiersMoteur) {
    const nom = court(fichier)
    if (exceptions.some((e) => nom.endsWith(e))) {
      continue
    }
    if (motif.test(codeSeul(lire(fichier)))) {
      coupables.push(nom)
    }
  }
  expect(coupables).toEqual([])
}

function imports(source: string): string[] {
  const trouves: string[] = []
  const motif = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = motif.exec(source)) !== null) {
    trouves.push(m[1]!)
  }
  return trouves
}

describe('ARC — pureté du moteur et règle des dépendances', () => {
  it('le moteur contient bien des fichiers à analyser', () => {
    expect(fichiersMoteur.length).toBeGreaterThan(5)
  })

  it('ARC-01 — aucun import de react dans le moteur', () => {
    for (const fichier of fichiersMoteur) {
      expect(imports(lire(fichier)), court(fichier)).not.toContain('react')
    }
  })

  it('ARC-02 — aucun import de dexie dans le moteur', () => {
    for (const fichier of fichiersMoteur) {
      const trouves = imports(lire(fichier))
      expect(trouves, court(fichier)).not.toContain('dexie')
      expect(trouves, court(fichier)).not.toContain('dexie-react-hooks')
    }
  })

  it('ARC-03 — le moteur n’importe ni db, ni ui, ni pdf, ni app', () => {
    for (const fichier of fichiersMoteur) {
      for (const spec of imports(lire(fichier))) {
        expect(spec, court(fichier)).not.toMatch(/(^|\/)(db|ui|pdf|app)(\/|$)/)
      }
    }
  })

  it('ARC-04 — le moteur ne référence ni window, ni document, ni localStorage, ni navigator', () => {
    aucunDansLeMoteur(/\b(window|document|localStorage|sessionStorage|navigator)\b/)
  })

  it('ARC-05 — le moteur ne lit pas l’horloge : le temps courant est un paramètre', () => {
    aucunDansLeMoteur(/\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)/)
  })

  it('ARC-06 — le moteur n’utilise pas Intl hors du module de formatage', () => {
    aucunDansLeMoteur(/\bIntl\b/, ['primitives/format.ts'])
  })

  it('ARC-07 — la persistance n’importe du moteur que des types', () => {
    for (const fichier of tousLesFichiers.filter((f) => court(f).startsWith('src/db/'))) {
      const source = lire(fichier)
      for (const ligne of source.split('\n')) {
        if (/from\s+['"][^'"]*engine/.test(ligne) && /^\s*import\s/.test(ligne)) {
          expect(ligne, court(fichier)).toMatch(/import\s+type\s|import\s*\{[^}]*\btype\b/)
        }
      }
    }
  })

  it('ARC-10 — Luxon est la seule bibliothèque de date', () => {
    for (const fichier of tousLesFichiers) {
      for (const spec of imports(lire(fichier))) {
        expect(spec, court(fichier)).not.toMatch(/^(date-fns|moment|dayjs)($|\/)/)
      }
    }
  })

  it('ARC-11 — aucun `?? 0` ni `|| 0` dans le moteur : un réglage absent n’est pas zéro', () => {
    aucunDansLeMoteur(/(\?\?|\|\|)\s*0(?![.\d])/)
  })

  it('ARC-12 — aucun fuseau en dur dans le moteur', () => {
    // Ici on cherche dans la source **brute** : un littéral de chaîne est
    // exactement ce qu'on traque.
    for (const fichier of fichiersMoteur) {
      expect(lire(fichier), court(fichier)).not.toMatch(/['"]Europe\/Paris['"]/)
    }
  })

  it('ARC-14 — aucun toFixed dans le moteur : un seul point d’arrondi', () => {
    aucunDansLeMoteur(/\.toFixed\s*\(/)
  })

  it('ARC-14 — Math.round n’existe que dans roundingPolicy', () => {
    aucunDansLeMoteur(/\bMath\.round\s*\(/, ['primitives/roundingPolicy.ts'])
  })

  it('ARC-09 — src/ui ne contient aucune arithmétique métier', () => {
    // Les durées et les montants ne se calculent pas dans un composant : ni
    // `h * 60`, ni `centimes / 100`, ni `+` sur deux valeurs métier. Tout passe
    // par le moteur, qui est le seul testable sans DOM (CLAUDE.md §4).
    const composants = tousLesFichiers.filter((f) => /^src\/(ui|pdf)\//.test(court(f)))
    expect(composants.length).toBeGreaterThan(3)

    for (const fichier of composants) {
      const code = codeSeul(lire(fichier))
      // Multiplication ou division par une constante de temps ou d'argent.
      expect(code, court(fichier)).not.toMatch(/[*/]\s*(60|100|1000|3600)\b/)
      expect(code, court(fichier)).not.toMatch(/\b(60|100)\s*[*/]/)
      // Arithmétique sur un identifiant métier du glossaire (CLAUDE.md §15).
      expect(code, court(fichier)).not.toMatch(
        /\b(duree|montant|amplitude|tempsRemunere|heuresSup|minutes|cents|Cents|Minutes)\w*\s*[+\-*/]\s*\w/,
      )
      expect(code, court(fichier)).not.toMatch(/\btoFixed\s*\(/)
    }
  })

  it('ARC-13 — hors du moteur, on n’importe que sa surface publique', () => {
    const consommateurs = tousLesFichiers.filter((f) =>
      /^src\/(ui|pdf|app|db)\//.test(court(f)),
    )
    for (const fichier of consommateurs) {
      for (const spec of imports(lire(fichier))) {
        if (!spec.includes('engine')) {
          continue
        }
        // `../engine` et `../../engine` sont la surface publique ;
        // `../engine/pay/heuresSup` est un contournement.
        expect(spec, court(fichier)).toMatch(/(^|\/)engine$/)
      }
    }
  })

  it('ARC-18 — aucun montant ni taux en dur dans le code de production', () => {
    // `brands.ts` définit `ZERO_CENTS` : c'est l'élément neutre d'une addition,
    // pas un tarif. C'est la seule exception, et elle est nommée.
    const aExaminer = tousLesFichiers.filter(
      (f) => !court(f).endsWith('src/engine/primitives/brands.ts'),
    )
    for (const fichier of aExaminer) {
      const code = codeSeul(lire(fichier))
      // Un montant en dur, c'est un appel `cents(1345)` ou un `montantCents: 1345`.
      expect(code, court(fichier)).not.toMatch(/\bcents\s*\(\s*\d/)
      expect(code, court(fichier)).not.toMatch(/\bmontantCents\s*[:=]\s*\d/)
      expect(code, court(fichier)).not.toMatch(/\bmajorationPct\s*[:=]\s*\d/)
      expect(code, court(fichier)).not.toMatch(/\bdureeReferenceMinutes\s*[:=]\s*\d/)
    }
  })

  it('ARC-15 — aucun console.log laissé en place', () => {
    for (const fichier of tousLesFichiers) {
      expect(codeSeul(lire(fichier)), court(fichier)).not.toMatch(/\bconsole\.log\s*\(/)
    }
  })

  it('ARC-17 — aucun appel réseau nulle part : l’app est hors ligne par construction', () => {
    for (const fichier of tousLesFichiers) {
      const code = codeSeul(lire(fichier))
      expect(code, court(fichier)).not.toMatch(/\bfetch\s*\(/)
      expect(code, court(fichier)).not.toMatch(/\bXMLHttpRequest\b/)
      expect(code, court(fichier)).not.toMatch(/\bnew\s+WebSocket\b/)
    }
  })
})

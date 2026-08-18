import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Contrôles sur la feuille de styles elle-même. Ils tiennent hors du DOM :
 * ce qu'on vérifie ici, ce sont les **règles** du DESIGN.md, pas un rendu.
 */
const RACINE = fileURLToPath(new URL('../..', import.meta.url))
const MODERNIST = readFileSync(join(RACINE, 'src/ui/styles/modernist.css'), 'utf8')
const APP_CSS = readFileSync(join(RACINE, 'src/ui/styles/app.css'), 'utf8')

describe('INT — feuille de styles', () => {
  it('INT-13 — les cibles tactiles font au moins 44 px', () => {
    expect(MODERNIST).toContain('--cible-tactile: 44px')
    expect(MODERNIST).toMatch(/\.btn\s*\{[^}]*min-height:\s*var\(--cible-tactile\)/)
    // Une ligne de segment fait 46 px (DESIGN §8).
    expect(APP_CSS).toMatch(/\.segment\s*\{[^}]*min-height:\s*46px/)
  })

  it('INT-14 — rayon 0 partout, aucune ombre hors dialogue', () => {
    expect(MODERNIST).toMatch(/--radius-sm:\s*0/)
    expect(MODERNIST).toMatch(/--radius-md:\s*0/)
    expect(MODERNIST).toMatch(/--radius-lg:\s*0/)
    expect(MODERNIST).toMatch(/--shadow-sm:\s*none/)
    expect(MODERNIST).toMatch(/--shadow-md:\s*none/)

    // `--shadow-lg` n'est employée qu'une fois, par le dialogue modal.
    const usages = [...`${MODERNIST}${APP_CSS}`.matchAll(/box-shadow:\s*var\(--shadow-lg\)/g)]
    expect(usages).toHaveLength(1)
    expect(MODERNIST).toMatch(/\.dialog\s*\{[^}]*box-shadow:\s*var\(--shadow-lg\)/)
  })

  it('INT-15 — aucune couleur d’erreur : le rouge ne colore ni écart ni échec', () => {
    for (const feuille of [MODERNIST, APP_CSS]) {
      // Le vocabulaire du SPEC est « écart », pas « erreur », et le visuel doit
      // rester aussi neutre que le mot (DESIGN §3).
      expect(feuille).not.toMatch(/\.(erreur|error|danger|success|succes|warning)\b/)
      expect(feuille).not.toMatch(/color:\s*(green|red|#0f0|#f00)\b/i)
    }
    // Un seul accent dans tout le système, celui du DESIGN §3.
    expect(MODERNIST).toContain('#ec3013')
  })

  it('les composants ne portent aucune valeur visuelle en dur', () => {
    // Tout hex, toute police et tout rayon vivent dans modernist.css.
    expect(APP_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(APP_CSS).not.toMatch(/border-radius:\s*(?!var\()/)
    expect(APP_CSS).not.toMatch(/font-family:\s*(?!var\()/)
  })
})

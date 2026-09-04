# Mes Heures

**PWA locale et hors ligne, sans compte ni serveur.** Un conducteur d'autocar saisit sa
journée en quinze secondes le soir, sur son téléphone, à une main — puis vérifie sa fiche
de paie ligne par ligne.

<p align="center">
  <img src="docs/aper%C3%A7u/Capture%20d'%C3%A9cran%202026-08-18%20200128.png"
       alt="Écran Ma période : temps rémunéré affiché en fourchette, tableau des journées, une journée partielle et une journée incalculable"
       width="360">
</p>

---

## Le problème

Une fiche de paie de conducteur agrège des heures supplémentaires, des coupures
partiellement rémunérées, de la disponibilité comptée à une fraction, des découchers et
des indemnités de repas. Le conducteur, lui, n'a que ses horaires et un bulletin. Entre
les deux, il n'y a rien : pas moyen de savoir si les 12 h 30 du 17 mars ont été payées, ni
à quel titre.

L'app comble exactement ce trou. Elle ne remplace pas la paie et ne prétend rien sur le
droit : elle rend le calcul **vérifiable**.

## Les trois règles qui tiennent tout le reste

**1. Juste ou absent.** Aucun chiffre plausible et faux. Tout résultat porte un statut :
`complete`, `partial` avec une fourchette explicite, ou `unknown` avec sa cause et un lien
vers le réglage à remplir. Sur la capture ci-dessus, une journée sans fin de service
n'affiche ni `0 h`, ni un tiret — elle affiche « incalculable, fin de service manquante ».

**2. Le moteur produit des preuves, pas des nombres.** Chaque valeur se déplie jusqu'aux
saisies et aux réglages qui l'ont produite. Aucune fonction publique du moteur ne renvoie
un nombre nu : elle renvoie un `CalculationResult<T>` portant ses `inputs`, ses `steps`
lisibles par un humain, et ses `sources`.

**3. Aucune valeur réglementaire ou tarifaire en dur.** Ni un taux horaire, ni un seuil de
35 h, ni une majoration de 25 %, ni le montant d'un repas. Tout vient des réglages, y
compris la liste des indemnités et leurs déclencheurs. Un réglage absent est une **donnée
absente**, jamais un zéro : la durée reste calculée, le montant devient `unknown` en
nommant le réglage manquant. Un test d'architecture fait échouer le build si une constante
métier entre dans le moteur.

## Où vont les données

Nulle part. Elles vivent dans l'IndexedDB du navigateur, sur l'appareil. Pas de compte,
pas de synchronisation, pas d'analytics, pas de télémétrie, **aucun appel réseau au
runtime** — les polices sont embarquées, le service worker met tout en cache à
l'installation. La sauvegarde est un export JSON que l'utilisateur déclenche lui-même, et
dont l'import est validé par Zod : un fichier corrompu est refusé proprement, sans toucher
aux données existantes.

## Architecture

Le pipeline est l'architecture. Chaque étage est pur, testé seul, et ne saute jamais
par-dessus le précédent — si l'étage N rend un `partial`, l'étage N+1 propage le statut et
la fourchette au lieu de les résoudre.

```
saisie brute
  → normalizeTimes()     heure locale → instant, changements d'heure compris
  → qualify()            chevauchements, trous, complétude
  → tempsRemunere()
  → splitIntoPayPeriods()
  → heuresSup()
  → indemnites()
  → CalculationResult + preuves
```

```
src/engine/   100 % pur — aucun import de React, Dexie, window, Date.now()
src/db/       Dexie, schéma versionné, export/import validé par Zod
src/ui/       écrans et composants — zéro arithmétique métier
src/pdf/      relevé imprimable — consomme la sortie du moteur, ne recalcule rien
tests/cases/  la table de cas limites, écrite avant le code, un test par ligne
```

Sens des dépendances : `ui → engine`, `ui → db`, `pdf → engine`. Jamais l'inverse.

## Tests

**314 tests**, dont une table de cas limites d'environ 215 lignes en Markdown reliée aux
tests par un méta-test bidirectionnel : une ligne sans test échoue, un test sans ligne
aussi. Les tests tournent sous `TZ=America/New_York`, volontairement différent de la zone
de référence, pour faire tomber toute fuite de fuseau navigateur. La conversion
minutes → centièmes est vérifiée sur les 60 valeurs, exhaustivement.

## Stack

Vite · React 19 · TypeScript `strict` (avec `noUncheckedIndexedAccess` et
`exactOptionalPropertyTypes`) · Luxon, seule bibliothèque de date · Dexie · Zod · Vitest ·
`vite-plugin-pwa`. Argent en centimes entiers, types nominaux `Cents` et `Minutes`, un
**seul** point d'arrondi, en sortie.

```
pnpm dev · pnpm test · pnpm typecheck · pnpm lint · pnpm build · pnpm preview
pnpm verify   # typecheck + lint + test + build
```

## Installer

### Depuis GitHub Pages (le plus simple)

Chaque push sur `main` reconstruit l'app et la publie automatiquement
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) sur :

**<https://mouradlamg-wq.github.io/mes-heures/>**

Ouvre ce lien sur le téléphone (n'importe quel réseau) → menu ⋮ → **Installer
l'application**. Une fois installée, l'app fonctionne sans réseau ; les mises à jour ne
s'appliquent jamais en silence (`registerType: 'prompt'`) — un bandeau propose de les
appliquer, jamais au milieu d'une saisie.

`dist/` n'est jamais commité : c'est ce seul workflow qui construit et publie ce qui est
servi sur ce lien. Rien n'est envoyé nulle part au runtime — la page publiée reste la même
app 100 % locale, juste téléchargée une fois depuis GitHub Pages au lieu d'un `pnpm preview`.

### Sans rien mettre en ligne (Android, par USB)

Chrome n'installe une PWA que depuis une origine sécurisée — HTTPS, ou `localhost`. Le
transfert de port permet d'obtenir la seconde sans rien publier.

1. `pnpm build` puis `pnpm preview` sur le PC (sert sur le port 4173).
2. Sur le téléphone : Options pour les développeurs → **Débogage USB**, puis branche-le.
3. Sur le PC, dans Chrome : `chrome://inspect/#devices` → **Port forwarding** → `4173`
   vers `localhost:4173`.
4. Sur le téléphone, ouvre `http://localhost:4173` → menu ⋮ → **Installer l'application**.

Débranche : l'app démarre depuis l'écran d'accueil et fonctionne sans réseau.

## Hors périmètre, volontairement

Alertes de conformité au règlement européen (RSE) · valorisation des absences — l'app
compte les jours par type, rien de plus · notifications programmées · multi-utilisateur,
compte, synchronisation, partage · export vers un service tiers.

L'app **ne dit rien** sur la conformité au règlement européen et l'écrit à l'écran. Elle ne
tranche aucune question de convention collective : quand une règle dépend du droit, elle
devient un réglage, et en l'absence de réglage elle affiche les hypothèses au lieu d'en
choisir une.

## Documents

`SPEC-mes-heures-v4.md` est la vérité métier. `Claude.md` dit comment travailler,
`DESIGN.md` décrit le rendu, `docs/phases/` contient un rapport par phase livrée — ce qui
est fait, ce qui est supposé, ce qui reste ambigu, ce qui est de la dette assumée.

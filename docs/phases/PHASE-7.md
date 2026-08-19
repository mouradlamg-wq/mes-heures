# Phase 7 — Vérifier ma paie et relevé imprimable

`pnpm verify` vert. 311 tests (+21). `ARC-08` passe de déclaré à appliqué.

## Fait

### Le moteur des écarts

`comparerAvecFiche` produit une ligne par grandeur comparable : heures
supplémentaires, chaque indemnité, temps rémunéré, et le brut s'il a été relevé.

Trois refus qui font tout l'intérêt de l'écran :

- **Une ligne non recopiée n'est pas un écart de zéro** (`ECA-02`). Elle affiche
  « non comparé ». Sans cette règle, une fiche à moitié saisie annoncerait des
  écarts partout, et l'écran perdrait toute crédibilité au premier usage.
- **Le compteur ne mélange jamais heures et euros** (`ECA-07`). Deux grandeurs,
  deux valeurs : l'écart d'heures sup en grand, l'écart d'indemnités en
  sous-ligne. Le cumul monétaire ignore le brut et le temps rémunéré (`ECA-08`).
- **Une fiche qui tombe dans l'incertitude n'est pas fautive** (`ECA-04`,
  `PAI-42`). Si l'app borne entre 8 h et 12 h et que la fiche dit 10 h, l'écart
  est marqué *compatible*. Hors de l'intervalle, il se mesure depuis la borne la
  plus proche (`ECA-05`) — jamais depuis un milieu inventé.

Les heures de la fiche se lisent **en centièmes** (`ECA-06`), parce que c'est
sous cette forme qu'elles sont imprimées : `17,00` vaut 17 h 00, pas 17 minutes.

### L'écran

Conforme au DESIGN §11 : mention obligatoire en tête de liste, quatre états de
ligne, dépliant de preuves, une seule ligne ouverte à la fois. Le champ
« ta fiche » n'est **jamais prérempli** — y mettre le calcul de l'app ferait
disparaître l'écart avant qu'on le cherche.

Vérifié à la main : `8 h 20` calculées contre `17,00` recopié → écart `−8 h 40` ;
la fiche corrigée en `8,33` → « aucun », et le compteur suit dans le même rendu.

### Le relevé imprimable

Gabarit HTML + `window.print()`, comme décidé au §16.1 : aucune dépendance, hors
ligne, et l'« Enregistrer en PDF » du système produit le fichier.

`src/pdf/Releve.tsx` **ne calcule rien** : il reçoit `DetailIntervalle`,
`SynthesePeriode` et `Comparaison` déjà produits, et met en page. `ARC-08` le
vérifie mécaniquement — aucune multiplication par 60 ou 100, aucune arithmétique
sur un identifiant métier, aucun `Date.now()`, aucun import de Dexie.

La feuille `@media print` force l'encre noire sur blanc quel que soit le thème de
l'appareil, évite qu'une journée soit coupée en deux pages, et masque la
navigation.

## Supposé

1. **`PayCheck.indemnitesPayees` accepte désormais un `montantCents`** en plus de
   la quantité. Une fiche porte souvent les deux, et la maquette compare des
   montants. Extension additive du SPEC §9 : quand le montant est là, c'est lui
   qu'on compare — c'est ce qui se retrouve sur le net.
2. **La ligne d'écart n'est pas un bouton d'un seul tenant**, contrairement au
   DESIGN §11. Un contrôle de saisie dans un `<button>` est du HTML invalide, et
   rendait le champ « ta fiche » impossible à remplir. Le dépliage a son propre
   bouton, pleine largeur, à 44 px.
3. **Le dépliant montre au plus 8 étapes**, puis annonce le reste. Un mois produit
   une étape par journée : les afficher toutes noyait la preuve sous sa propre
   longueur.
4. **La marque « Mes Heures » a quitté la barre de navigation** : à quatre
   onglets elle débordait, et elle n'apprend rien à qui est déjà dans l'app.

## Ambigu

1. **Que doit contenir le relevé remis à l'employeur ?** J'ai mis la synthèse, le
   détail par journée, les écarts s'il y en a, et une phrase de provenance. Si tu
   veux y ajouter tes lieux de prise et de fin, ou au contraire retirer les
   écarts d'un document destiné à circuler, dis-le-moi.
2. **Le brut n'apparaît que si tu l'as relevé.** Il est de toute façon `unknown`
   dès qu'il y a une absence dans le mois (SPEC §1).

## Dette

- **`ARC-16`** reste la seule ligne déclarée sans test : le contrôle mécanique des
  signatures publiques du moteur.
- **Aucun test de bout en bout sur les deux écrans montés.** `ECA-01` à `ECA-15`
  testent `comparerAvecFiche` ; le parcours et l'impression ont été vérifiés à la
  main.
- **Le bundle dépasse 500 ko** et Vite le signale. Luxon et Dexie en sont
  l'essentiel ; à découper en phase 8 si le démarrage est lent.
- **`DESIGN.md` décrit encore le bouton `Valider la journée`** (§7, §8) et
  interdit le sélecteur d'heure (§8, §14), tous deux modifiés sur ta demande.

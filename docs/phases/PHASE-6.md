# Phase 6 — Ma semaine / Ma période, et les icônes

`pnpm verify` vert. 291 tests (+30).

## Fait

### Icônes PWA

Le dessin fourni est un carré arrondi de 1254 px **à coins noirs opaques** — un
artefact de sa génération. Laissés tels quels, ils auraient donné quatre angles
noirs autour de l'icône sur l'écran d'accueil.

`scripts/generer-icones.mjs` produit quatre fichiers, à la main quand le dessin
change. Deux traitements, parce que les systèmes n'attendent pas la même chose :

- **`any`** (192 et 512) — fond prolongé dans les coins, puis découpe d'un carré
  arrondi antialiasé à 22 %. On redessine l'arrondi plutôt que de récupérer celui
  du fichier, dont l'anticrénelage part du noir et laisserait un liseré sombre.
- **`maskable`** (512) et **`apple-touch-icon`** (180) — carré **plein bord à
  bord**, alpha 255 partout. Android y découpe la forme de son choix, iOS applique
  son propre arrondi : un coin transparent y deviendrait un angle vide.

La réduction se fait par moyenne de blocs en **alpha prémultiplié** : sans ça, les
pixels transparents tireraient la couleur voisine vers le noir. Contrôlé après
génération — `maskable` n'a aucun pixel transparent, `any` en a 10 562, tous dans
les angles.

`pngjs` est une dépendance de **développement** : rien de tout ceci ne tourne dans
l'app.

La barre système prend désormais le fond de l'app (`#f2efec` en clair, `#131211`
en sombre) et non la couleur de marque : un bandeau rouge au-dessus d'un écran
crème se lit comme une alerte.

### Écran « Ma semaine / Ma période »

Conforme à la maquette : segmented `Semaine | Période` avec l'unique aplat rouge
de l'écran, total en double affichage, tableau à filets, ligne hachurée pour un
jour partiel, tag et cause pour un jour incalculable, pied avec la mention et
« Voir l'écart avec ma fiche ».

**Le total additionne les journées calculables**, et compte les autres à part
(`SEM-06`). Sommer strictement aurait produit un `unknown` : une seule journée
sans réglage aurait masqué dix-neuf journées parfaitement connues. Le chiffre ne
circule jamais sans son décompte — l'avertissement est dans le résultat lui-même
(`SEM-07`), et `statutDeLecture` force `partial` dès qu'une journée est écartée,
même si toutes les retenues sont certaines (`SEM-09`).

**Une ligne par jour du calendrier**, y compris les jours sans rien : c'est ce qui
distingue un repos d'un oubli de saisie (`SEM-01`, `SEM-02`).

Les bornes viennent des réglages, et `bornesDe` est extrait pour être testable
sans écran : sans `payPeriodConfig` ou sans `debutSemaine`, l'écran refuse et
renvoie au champ à remplir (`SEM-12`, `SEM-13`). Le lundi n'est jamais supposé.

### Un défaut du moteur trouvé par l'écran

Le tableau a révélé qu'une journée avec une prise de service **mais sans fin**
déclarait `0 h 00` de conduite **certaines**. Le moteur ne sait rien de cette
journée : répondre zéro affirmait qu'il ne s'y était rien passé.

Corrigé — sans amplitude, aucune durée par type n'est `complete` : le statut est
`unknown` et la cause est nommée. `QUA-10` a été réécrit et un second test compare
explicitement une journée **ouverte** (`unknown`) et la même journée **close à la
même minute** (`0 h 00`, légitime).

C'est le genre de bug qu'aucun test unitaire n'attrape tant qu'on ne regarde pas
un mois entier d'un coup.

## Supposé

1. **Le total exclut les journées incalculables** au lieu de devenir `unknown`.
   C'est un écart assumé à `PRV-19` (« partial + unknown = unknown ») : la règle
   du moteur reste valable pour un calcul, mais un tableau de trente jours est une
   **lecture**, et masquer vingt journées connues pour une manquante ne rend
   service à personne. Le décompte l'accompagne toujours.
2. **La colonne « Conduite » d'un jour partiel affiche l'intervalle**, là où la
   maquette montre une valeur unique. Une zone non qualifiée peut être de la
   conduite : donner la seule borne basse serait plus lisible, mais faux.
3. **Une cellule inconnue reste vide**, là où la maquette met `—`. Le `DESIGN.md`
   §14 interdit le tiret à la place d'un `unknown` ; le statut et sa cause sont
   portés une fois par ligne, dans la dernière colonne.
4. **Le mode de saisie et les bornes de semaine sont relus à chaque rendu.** Sur
   trente et un jours c'est sans conséquence ; sur un an, à mesurer.

## Ambigu

1. **Les sous-totaux de la maquette.** Elle affiche `21,15 – 21,40 h` sous
   `169 h 15 – 170 h 45`, alors que ces durées valent `169,25 – 170,75 h`. J'ai
   produit les vrais centièmes. Si `21,15` désignait autre chose — un écart, un
   cumul d'heures sup — dis-le-moi, ce n'est pas ce que j'ai compris.
2. **Que fait « Voir l'écart avec ma fiche » ?** Le bouton existe et ne mène
   nulle part : l'écran « Vérifier ma paie » est la phase 7.

## Dette

- **Le précache atteint 1,1 Mo**, dont 500 ko pour les trois PNG. Les icônes 512
  pèsent 230 ko chacune ; un dessin plus plat les réduirait beaucoup. À regarder
  en phase 8 si le premier chargement est lent en 4G.
- **Aucun test de bout en bout sur l'écran monté** : `SEM-01` à `SEM-14` testent
  `detaillerIntervalle` et `bornesDe`, pas le composant avec Dexie. Le parcours a
  été vérifié à la main dans le navigateur.
- **`ARC-08` et `ARC-16`** restent déclarés sans test : `src/pdf` n'existe pas.
- **`DESIGN.md` décrit encore le bouton `Valider la journée`** (§7 et §8), retiré
  du code sur ta demande. À resynchroniser.

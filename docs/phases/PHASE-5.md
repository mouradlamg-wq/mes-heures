# Phase 5 — Design system et saisie

`pnpm verify` vert. 258 tests (+17). Les deux maquettes de `docs/aperçu` et le
`DESIGN.md` mis à jour ont servi de référence.

## Fait

### Le design system, reconstruit

`src/ui/styles/modernist.css` porte **tous** les tokens du DESIGN §2 : rampes
`--color-accent-100…900` et `--color-neutral-100…900`, `--space-*`,
`--radius-*` à 0, `--shadow-*`, `--filet-section` / `--filet-ligne`,
`--cible-tactile`. Les classes `.btn` `.tag` `.input` `.field` `.seg` `.radio`
`.table` `.hr` `.card` `.dialog` s'y composent.

`src/ui/styles/app.css` ne contient **aucun hex, aucune police, aucun rayon** —
un test le vérifie. Le jour où le vrai fichier Modernist arrive, il remplace
celui-ci sans toucher au reste.

**Archivo est vendorisée** dans `public/fonts/` (variable, latin + latin-ext,
67 ko). Aucun CDN, aucun appel réseau : l'app démarre hors ligne, et la police
est précachée par Workbox.

**Thème sombre** : quatre tokens redéfinis, plus le basculement du DESIGN §12 —
texte rouge en `accent-400`, hachure sur `accent-900`/`800`. Les blocs de
media queries sont placés **après** les valeurs de base, sinon un `:root` plat
plus bas dans le fichier gagnerait à spécificité égale et annulerait le thème.
Vérifié à l'écran dans les deux modes.

### L'écran « Aujourd'hui »

Ordre vertical du DESIGN §8 respecté. Sur la journée de la maquette, **chaque
chiffre correspond au dessin** : amplitude 12 h 30, segments 3 h 40 / 2 h 40 /
1 h 30 / 4 h 20 / 0 h 20, temps rémunéré 8 h 20 – 9 h 50. Le moteur et le dessin
disent la même chose, ce qui est le meilleur signe que ni l'un ni l'autre ne
ment.

**La liste montre les zones du moteur, pas les segments bruts.** C'est le
correctif le plus important de la phase : en affichant les segments saisis, une
tranche qualifiée à la main disparaissait de l'écran au moment même où
l'utilisateur venait de la renseigner. Désormais la liste rend `journee.zones`,
donc une qualification fusionne visiblement avec la coupure voisine —
`09:20–12:00` devient `09:20–13:30` (`INT-10`).

**Le geste central marche** : un appui sur la zone hachurée, un choix de type, et
dans le même rendu le tag passe `PARTIEL → CERTAIN`, le pied passe de
`8 h 20 – 9 h 50` à `8 h 20`, et la hachure disparaît. Aucun rechargement. La
règle du DESIGN §6 — « un en-tête certain au-dessus d'une ligne encore hachurée
est un bug » — est tenue par construction, puisque les deux viennent du même
appel au moteur.

**Ligne de segment à 46 px, cliquable sur toute sa largeur**, l'édition dans un
dialogue. J'avais d'abord mis les champs en ligne : les rangées faisaient 180 px,
le pied passait sous la ligne de flottaison, et la règle « une journée à cinq
segments tient sans scroll » tombait.

**Saisie à quatre chiffres** : `0540` → `05:40`, les deux points s'écrivent
seuls. `inputmode="numeric"`, aucun `<select>`, aucun `type="time"` — vérifié par
`INT-09`. `25:00` est refusé par une phrase sous le champ, **et la saisie reste
telle quelle** : aucun 23:00 fabriqué à la place (`INT-08`).

**Ambiguïté DST** : dialogue à deux choix explicites, et seulement dans ce cas.

### L'écran « Réglages »

Livré parce qu'un `unknown` doit pouvoir mener au réglage qui le lève. Chaque
champ vide affiche **ce que son absence désactive** : « Sans ce jour, aucune
période ne peut être construite », « Sans elle, toute journée contenant de la
disponibilité devient incalculable. L'app ne choisit ni 0 %, ni 100 % ». Aucun
champ n'est prérempli.

### Arithmétique remontée dans le moteur

`ARC-09` est passé de déclaré à **appliqué**, et il a mordu tout de suite : la
conversion `HH:mm ↔ minutes` et `euros ↔ centimes` vivaient dans les composants.
Elles sont maintenant dans `engine/primitives/saisie.ts` et
`engine/time/validerHeureHorloge`, donc testables sans DOM. Le test interdit
désormais toute multiplication par 60 ou 100 dans `src/ui` et `src/pdf`.

## Supposé

1. **Une ligne de segment s'édite dans un dialogue**, pas en ligne. Le DESIGN §7
   décrit la ligne comme un affichage et §8 la dit « cliquable sur toute sa
   largeur » ; le dialogue est ma lecture de ce qu'ouvre ce clic. Si tu préfères
   un dépliant sous la ligne, c'est un changement local.
2. **L'identifiant d'une journée non encore enregistrée est `brouillon-<date>`**,
   dérivé et non tiré au sort : stable d'une frappe à l'autre, et la contrainte
   d'unicité de `dateRattachement` empêche toute collision.
3. **Une heure de fin antérieure à la prise est interprétée comme le lendemain.**
   C'est le cas nominal d'un service de nuit. Rien n'est corrigé en silence : si
   la prise n'est pas saisie, le refus reste affiché.
4. **« Dupliquer hier » recopie les heures murales, pas les instants** : un
   service de 05:40 reste un service de 05:40 même si le changement d'heure est
   passé entre les deux jours.
5. **La navigation est un simple va-et-vient entre deux écrans.** Pas de routeur :
   il n'y a que deux écrans, et la phase 6 en ajoutera au plus deux.

## Ambigu

1. **Le bouton « Valider la journée » ne fait rien pour l'instant.** La saisie est
   enregistrée en continu, à chaque frappe — il n'y a donc rien à valider.
   Est-ce qu'il doit disparaître, ou marquer explicitement une journée comme
   relue ? Un marqueur « relu » n'est pas dans le SPEC, et je ne l'ajoute pas
   sans que tu le demandes.
2. **Le compteur affiche les indemnités à `0,00 €`** quand aucune n'est
   configurée. C'est cohérent avec `IND-27` — ne rien avoir configuré est un état
   légitime, donc un vrai zéro — mais à l'écran ça ressemble à un manque. Faut-il
   plutôt écrire « aucune indemnité réglée » ?
3. **Les questions de la phase 3 restent ouvertes** et ce sont elles qui rendent
   l'app utile : part rémunérée de la disponibilité, paliers de coupure, mode et
   durée de référence des heures sup, tranches de majoration.

## Dette

- **Les icônes PWA manquent toujours.** `public/` n'a que les polices ;
  `vite.config.ts` déclare trois PNG qui n'existent pas. L'installation sur
  l'écran d'accueil échouera — c'est la phase 8, mais c'est le seul défaut
  visible de bout en bout.
- **« Modèle… » est désactivé** : les `DayTemplate` existent en base et dans les
  types, aucun écran ne les crée. Le bouton dit maintenant pourquoi il est
  éteint, conformément au DESIGN §6.
- **Le bundle fait 490 ko** (150 ko gzip), dont l'essentiel est Luxon et Dexie.
  À regarder en phase 8 si le démarrage sur un téléphone modeste est lent.
- **Aucun test de bout en bout sur l'écran complet** : `INT-10` à `INT-12` testent
  la fonction qui construit la liste, pas le composant monté avec Dexie. Le
  parcours a été vérifié à la main dans le navigateur, pas automatiquement.
- **`ARC-08` et `ARC-16`** restent déclarés sans test : `src/pdf` n'existe pas, et
  le contrôle des signatures publiques du moteur n'est pas mécanisé.

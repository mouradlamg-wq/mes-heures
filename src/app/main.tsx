import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const racine = document.getElementById('root')

if (racine === null) {
  throw new Error("L'élément #root est absent de index.html")
}

createRoot(racine).render(
  <StrictMode>
    <main>
      <h1>Mes Heures</h1>
      <p>
        Le moteur de calcul et la persistance sont en place. Les écrans arrivent à la phase 5.
      </p>
    </main>
  </StrictMode>,
)

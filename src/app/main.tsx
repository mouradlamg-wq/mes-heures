import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../ui/styles/modernist.css'
import '../ui/styles/app.css'
import { App } from './App'
import { FournisseurDonnees } from './donnees'

const racine = document.getElementById('root')

if (racine === null) {
  throw new Error("L'élément #root est absent de index.html")
}

createRoot(racine).render(
  <StrictMode>
    <FournisseurDonnees>
      <App />
    </FournisseurDonnees>
  </StrictMode>,
)

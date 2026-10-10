import { Route, Routes } from 'react-router-dom'
import Cardapio from './pages/Cardapio'
import Painel from './pages/Painel'
import Admin from './pages/Admin'
import Monitor from './pages/Monitor'
import Assinar from './pages/Assinar'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<p className="p-8">GetZap Delivery</p>} />
      <Route path="/painel/*" element={<Painel />} />
      <Route path="/admin/*" element={<Admin />} />
      <Route path="/monitor" element={<Monitor />} />
      <Route path="/assinar" element={<Assinar />} />
      <Route path="/:slug" element={<Cardapio />} />
    </Routes>
  )
}

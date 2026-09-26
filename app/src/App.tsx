import { Route, Routes } from 'react-router-dom'
import Cardapio from './pages/Cardapio'
import Painel from './pages/Painel'
import Admin from './pages/Admin'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<p className="p-8">GetZap Delivery</p>} />
      <Route path="/painel/*" element={<Painel />} />
      <Route path="/admin/*" element={<Admin />} />
      <Route path="/:slug" element={<Cardapio />} />
    </Routes>
  )
}

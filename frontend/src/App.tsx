// src/App.tsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './components/Home'
import SplitPanelLayout from './components/SplitPanelLayout'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/program" element={<SplitPanelLayout />} />
      </Routes>
    </Router>
  )
}

export default App

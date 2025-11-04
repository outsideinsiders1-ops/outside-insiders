// src/App.jsx
// Main app component - handles routing only

import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'

// Lazy load admin panel for better performance
const AdminPanel = lazy(() => import('./components/Admin/AdminPanel'))

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route 
          path="/admin" 
          element={
            <Suspense fallback={<div>Loading admin panel...</div>}>
              <AdminPanel />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App

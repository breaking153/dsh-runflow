import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { FlowApp } from './App.tsx'

const root = document.getElementById('root')
if (root === null) throw new Error('Missing #root')
createRoot(root).render(<StrictMode><FlowApp /></StrictMode>)

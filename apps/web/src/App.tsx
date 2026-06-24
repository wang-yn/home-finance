import './App.css'
import { AdminApp } from './components/AdminApp'
import { DeviceApp } from './components/DeviceApp'

function App() {
  const pathname = window.location.pathname
  return pathname === '/admin' || pathname.startsWith('/admin/') ? <AdminApp /> : <DeviceApp />
}

export default App

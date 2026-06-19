import './App.css'
import { useState } from 'react'
import { AdminApp } from './components/AdminApp'
import { DeviceApp } from './components/DeviceApp'

type AppMode = 'device' | 'admin'

function App() {
  const [mode, setMode] = useState<AppMode>('device')

  return (
    <>
      <div className="mode-switch" role="tablist" aria-label="应用模式">
        <button type="button" className={mode === 'device' ? 'active' : ''} onClick={() => setMode('device')}>
          设备端
        </button>
        <button type="button" className={mode === 'admin' ? 'active' : ''} onClick={() => setMode('admin')}>
          管理后台
        </button>
      </div>
      {mode === 'device' ? <DeviceApp /> : <AdminApp />}
    </>
  )
}

export default App

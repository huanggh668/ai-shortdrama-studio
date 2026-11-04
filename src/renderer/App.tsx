import { useEffect } from 'react'
import type { JSX } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import TitleBar from '@/components/TitleBar'
import Sidebar from '@/components/Sidebar'
import TaskDock from '@/components/TaskDock'
import Toasts from '@/components/Toasts'
import ProjectsPage from '@/pages/ProjectsPage'
import WorkspacePage from '@/pages/WorkspacePage'
import SettingsPage from '@/pages/SettingsPage'
import { useAppStore } from '@/stores/appStore'

export default function App(): JSX.Element {
  const ready = useAppStore((state) => state.ready)
  const init = useAppStore((state) => state.init)

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) {
    return (
      <div className="boot-screen">
        <Loader2 size={22} className="spin text-amber-brand" />
        <span>正在装载创作工作台</span>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/project/:id/:tab?" element={<WorkspacePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <TaskDock />
      <Toasts />
    </div>
  )
}

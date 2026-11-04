import React from 'react'
import ReactDOM from 'react-dom/client'
import { convertFileSrc } from '@tauri-apps/api/core'
import App from '@renderer/App'
import { setAssetUrlBuilder } from '@renderer/lib/paths'
import { installApi, installDragAndDrop, installStartupFile } from './api'
import '@renderer/styles/app.css'
import '@renderer/styles/preview.css'
import '@renderer/styles/editor.css'

installApi()
setAssetUrlBuilder((path) => convertFileSrc(path))
installDragAndDrop()
installStartupFile()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

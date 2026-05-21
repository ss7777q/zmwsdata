import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import {
  getBrowserCompatEnvironment,
  hasForcedLegacyAccess,
  rememberForcedLegacyAccess,
  supportsRequiredBrowserFeatures,
} from './lib/browser-compat'

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}

function setStyles(element: HTMLElement, styles: Partial<CSSStyleDeclaration>) {
  Object.assign(element.style, styles)
}

function appendText(parent: HTMLElement, tagName: string, text: string, styles: Partial<CSSStyleDeclaration>) {
  const element = document.createElement(tagName)
  element.textContent = text
  setStyles(element, styles)
  parent.appendChild(element)
  return element
}

function renderUnsupportedBrowserNotice(onContinue: () => void) {
  const root = document.getElementById('root')
  if (!root) throw new Error('Root element #root not found')
  root.textContent = ''

  const main = document.createElement('main')
  setStyles(main, {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f1f5f9',
    color: '#0f172a',
    fontFamily: 'Arial, Microsoft YaHei, sans-serif',
    padding: '24px',
    boxSizing: 'border-box',
  })

  const panel = document.createElement('section')
  setStyles(panel, {
    width: 'min(560px, 100%)',
    background: '#ffffff',
    border: '1px solid #dbe3ef',
    borderRadius: '8px',
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
    padding: '28px',
    boxSizing: 'border-box',
  })

  main.appendChild(panel)
  appendText(panel, 'p', '浏览器兼容性提示', {
    margin: '0 0 10px',
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#475569',
  })
  appendText(panel, 'h1', '当前浏览器版本过旧', {
    margin: '0 0 14px',
    fontSize: '24px',
    lineHeight: '1.25',
    fontWeight: '700',
    color: '#0f172a',
  })
  appendText(panel, 'p', '当前环境可能无法正确解析本站样式和部分功能。请更新浏览器，或切换到 Chrome、Edge、360 极速模式后再访问。', {
    margin: '0 0 20px',
    fontSize: '15px',
    lineHeight: '1.8',
    color: '#334155',
  })

  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = '仍然继续访问'
  setStyles(button, {
    border: '0',
    borderRadius: '6px',
    background: '#1e40af',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: '700',
    lineHeight: '1',
    padding: '12px 16px',
    cursor: 'pointer',
  })
  button.addEventListener('click', onContinue)
  panel.appendChild(button)

  appendText(panel, 'p', '继续访问后可能出现页面错位、样式缺失或功能异常。', {
    margin: '12px 0 0',
    fontSize: '13px',
    lineHeight: '1.6',
    color: '#64748b',
  })
  root.appendChild(main)
}

const compatEnv = getBrowserCompatEnvironment()

if (supportsRequiredBrowserFeatures(compatEnv) || hasForcedLegacyAccess(compatEnv.localStorage)) {
  renderApp()
} else {
  renderUnsupportedBrowserNotice(() => {
    rememberForcedLegacyAccess(compatEnv.localStorage)
    document.getElementById('root')!.textContent = ''
    renderApp()
  })
}

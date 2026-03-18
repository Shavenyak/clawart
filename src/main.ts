import './style.css'
import { bootstrapMuseumApp } from './app'

const mountNode = document.querySelector<HTMLDivElement>('#app')

if (!mountNode) {
  throw new Error('Unable to find #app mount node.')
}

bootstrapMuseumApp(mountNode)

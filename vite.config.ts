import react from '@vitejs/plugin-react'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

/**
 * Dev server only: the render studio (/?studio) posts still images of the 3D models here,
 * and they are written to public/renders/<name>.webp (strict name/type/size checks).
 */
function saveRenders(): Plugin {
  return {
    name: 'dev-save-renders',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/save-render', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          try {
            const { name, dataUrl } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { name: string; dataUrl: string }
            if (!/^[a-z0-9-]{1,40}$/.test(name)) throw new Error('bad name')
            const m = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
            if (!m) throw new Error('not a webp data URL')
            const buf = Buffer.from(m[1], 'base64')
            if (buf.length > 500_000) throw new Error('too large')
            const dir = fileURLToPath(new URL('./public/renders/', import.meta.url))
            mkdirSync(dir, { recursive: true })
            writeFileSync(dir + name + '.webp', buf)
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, bytes: buf.length }))
          } catch (e) {
            res.statusCode = 400
            res.end(String(e))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), saveRenders()],
  build: {
    // three.js + React Three Fiber form one lazy chunk (~1 MB raw, ~262 KB gzip) that loads only when a game opens
    chunkSizeWarningLimit: 1100,
  },
})

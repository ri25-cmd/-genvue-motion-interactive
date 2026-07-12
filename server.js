// Custom Next.js server with Socket.IO for real-time drawing sync.
// Runs the GenVue Motion Interactive controller + display on one process.
// NOTE: this file is NOT processed by the Next.js compiler, so it uses
// plain CommonJS that Node can run directly.
const { createServer } = require('http')
const next = require('next')
const { Server } = require('socket.io')

const port = parseInt(process.env.PORT || '3000', 10)
// Cross-platform prod switch: `node server.js --prod` (no shell env-var syntax
// needed on Windows). Otherwise runs in dev mode.
const prod = process.env.NODE_ENV === 'production' || process.argv.includes('--prod')
if (prod) process.env.NODE_ENV = 'production'
const dev = !prod
const app = next({ dev })
const handle = app.getRequestHandler()

// Authoritative canvas state, kept in memory so a display that joins (or
// refreshes) mid-session immediately receives the current drawing.
let strokes = []
const strokeIndex = new Map()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res))

  const io = new Server(httpServer, {
    // Keep the drawing responsive over local Wi-Fi.
    cors: { origin: '*' },
  })

  io.on('connection', (socket) => {
    // Send the current canvas so late-joining displays stay in sync.
    socket.emit('canvas:sync', strokes)

    socket.on('draw:start', (s) => {
      const stroke = {
        id: s.id,
        tool: s.tool,
        color: s.color,
        size: s.size,
        points: [{ x: s.x, y: s.y }],
      }
      strokes.push(stroke)
      strokeIndex.set(s.id, stroke)
      socket.broadcast.emit('draw:start', s)
    })

    socket.on('draw:move', (p) => {
      const stroke = strokeIndex.get(p.id)
      if (stroke) stroke.points.push({ x: p.x, y: p.y })
      socket.broadcast.emit('draw:move', p)
    })

    socket.on('draw:end', (p) => {
      socket.broadcast.emit('draw:end', p)
    })

    // Full-state replacement (undo / redo / clear). The controller is the
    // source of truth for these; we store it and relay to displays.
    socket.on('canvas:set', (next) => {
      strokes = Array.isArray(next) ? next : []
      strokeIndex.clear()
      for (const stroke of strokes) strokeIndex.set(stroke.id, stroke)
      socket.broadcast.emit('canvas:sync', strokes)
    })
  })

  httpServer.listen(port, () => {
    console.log(`> GenVue ready on http://localhost:${port} (${dev ? 'dev' : 'production'})`)
  })
})

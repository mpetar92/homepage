require('dotenv').config()
const path = require('path')
const bcrypt = require('bcryptjs')
const fastify = require('fastify')({ logger: true })
const { MongoClient } = require('mongodb')

// MongoDB connection
let db
let client

const connectMongoDB = async () => {
  try {
    const uri = process.env.MONGODB_URI
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not set')
    }
    
    client = new MongoClient(uri)
    await client.connect()
    db = client.db('dashboard')
    console.log('Connected to MongoDB')
  } catch (error) {
    console.error('MongoDB connection error:', error)
    process.exit(1)
  }
}

// Register plugins
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/'
})

fastify.register(require('@fastify/cors'), {
  origin: true,
  credentials: true
})

fastify.register(require('@fastify/cookie'), {
  secret: process.env.SESSION_SECRET || 'fallback-secret-key'
})

// Session store using MongoDB
class MongoSessionStore {
  constructor(db) {
    this.db = db
    this.collection = db.collection('sessions')
  }

  async get(sessionId) {
    try {
      const session = await this.collection.findOne({ _id: sessionId })
      return session ? session.data : null
    } catch (error) {
      console.error('Session get error:', error)
      return null
    }
  }

  async set(sessionId, session) {
    try {
      await this.collection.replaceOne(
        { _id: sessionId },
        {
          _id: sessionId,
          data: session,
          expires: new Date(Date.now() + (session.cookie?.maxAge || 86400000))
        },
        { upsert: true }
      )
    } catch (error) {
      console.error('Session set error:', error)
    }
  }

  async destroy(sessionId) {
    try {
      await this.collection.deleteOne({ _id: sessionId })
    } catch (error) {
      console.error('Session destroy error:', error)
    }
  }
}

// Hash admin password on startup
let adminPasswordHash
async function initializeAuth() {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
  adminPasswordHash = await bcrypt.hash(adminPassword, 12)
  console.log('Admin authentication initialized')
}

// Initialize session store after MongoDB connection
let sessionStore
async function initializeSession() {
  sessionStore = new MongoSessionStore(db)
  
  fastify.register(require('@fastify/session'), {
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    store: sessionStore,
    cookie: {
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours default
      sameSite: 'lax'
    },
    saveUninitialized: false
  })
  
  console.log('Session store initialized')
}

// Auth middleware
function requireAuth(request, reply, done) {
  console.log('Auth check:', {
    sessionId: request.session?.sessionId,
    authenticated: request.session?.authenticated,
    url: request.url
  })
  
  if (!request.session?.authenticated) {
    if (request.url.startsWith('/api/')) {
      reply.code(401).send({ error: 'Authentication required' })
      return
    } else {
      reply.redirect('/login')
      return
    }
  }
  done()
}

// Public routes (no auth required)
fastify.get('/login', async (request, reply) => {
  // If already authenticated, redirect to dashboard
  if (request.session?.authenticated) {
    return reply.redirect('/')
  }
  return reply.sendFile('login.html')
})

// Login API endpoint
fastify.post('/api/login', async (request, reply) => {
  try {
    console.log('Login attempt:', { username: request.body.username })
    
    const { username, password, remember } = request.body
    
    if (!username || !password) {
      reply.code(400).send({ error: 'Username and password required' })
      return
    }
    
    // Check credentials
    const adminUsername = process.env.ADMIN_USERNAME || 'admin'
    const isValidUsername = username === adminUsername
    const isValidPassword = await bcrypt.compare(password, adminPasswordHash)
    
    console.log('Credential check:', { isValidUsername, isValidPassword })
    
    if (!isValidUsername || !isValidPassword) {
      // Add delay to prevent brute force attacks
      await new Promise(resolve => setTimeout(resolve, 1000))
      reply.code(401).send({ error: 'Invalid credentials' })
      return
    }
    
    // Set session
    request.session.authenticated = true
    request.session.username = username
    request.session.loginTime = new Date().toISOString()
    
    // Extend session if remember me is checked
    if (remember) {
      request.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000 // 30 days
    } else {
      request.session.cookie.maxAge = 24 * 60 * 60 * 1000 // 1 day
    }
    
    console.log('Session created:', {
      sessionId: request.session.sessionId,
      authenticated: request.session.authenticated,
      username: request.session.username
    })
    
    reply.send({ success: true, message: 'Login successful' })
  } catch (error) {
    console.error('Login error:', error)
    reply.code(500).send({ error: 'Login failed' })
  }
})

// Logout endpoint
fastify.post('/api/logout', async (request, reply) => {
  try {
    const sessionId = request.session?.sessionId
    console.log('Logout:', { sessionId })
    
    if (sessionId && sessionStore) {
      await sessionStore.destroy(sessionId)
    }
    
    request.session.destroy()
    reply.send({ success: true, message: 'Logout successful' })
  } catch (error) {
    console.error('Logout error:', error)
    reply.code(500).send({ error: 'Logout failed' })
  }
})

// Check auth status
fastify.get('/api/auth', async (request, reply) => {
  const isAuth = request.session?.authenticated
  console.log('Auth status check:', {
    sessionId: request.session?.sessionId,
    authenticated: isAuth,
    username: request.session?.username
  })
  
  if (isAuth) {
    return {
      authenticated: true,
      username: request.session.username,
      loginTime: request.session.loginTime
    }
  } else {
    return { authenticated: false }
  }
})

// Dashboard homepage (protected)
fastify.get('/', { preHandler: requireAuth }, async (request, reply) => {
  return reply.sendFile('index.html')
})

// Protected API routes
fastify.register(async function (fastify) {
  // Add auth middleware to all routes in this context
  fastify.addHook('preHandler', requireAuth)
  
  // API status route
  fastify.get('/api/status', async (request, reply) => {
    return { 
      message: 'Personal Dashboard API is running!',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      status: 'healthy',
      user: request.session.username
    }
  })

  // Tasks API
  fastify.get('/api/tasks', async (request, reply) => {
    try {
      const collection = db.collection('tasks')
      const tasks = await collection.find({}).sort({ created: -1 }).toArray()
      return { tasks }
    } catch (error) {
      reply.code(500).send({ error: 'Failed to fetch tasks' })
    }
  })

  fastify.post('/api/tasks', async (request, reply) => {
    try {
      const { text, completed = false } = request.body
      if (!text) {
        reply.code(400).send({ error: 'Task text is required' })
        return
      }
      
      const collection = db.collection('tasks')
      const newTask = {
        text,
        completed,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        createdBy: request.session.username
      }
      
      const result = await collection.insertOne(newTask)
      return { 
        message: 'Task created successfully',
        id: result.insertedId,
        task: newTask
      }
    } catch (error) {
      reply.code(500).send({ error: 'Failed to create task' })
    }
  })

  fastify.put('/api/tasks', async (request, reply) => {
    try {
      const { tasks } = request.body
      if (!Array.isArray(tasks)) {
        reply.code(400).send({ error: 'Tasks must be an array' })
        return
      }
      
      const collection = db.collection('tasks')
      
      // Clear existing tasks and insert new ones
      await collection.deleteMany({})
      if (tasks.length > 0) {
        const tasksWithDates = tasks.map(task => ({
          ...task,
          created: task.created || new Date().toISOString(),
          updated: new Date().toISOString(),
          createdBy: request.session.username
        }))
        await collection.insertMany(tasksWithDates)
      }
      
      return { message: 'Tasks updated successfully' }
    } catch (error) {
      reply.code(500).send({ error: 'Failed to update tasks' })
    }
  })

  // Notes API
  fastify.get('/api/notes', async (request, reply) => {
    try {
      const collection = db.collection('notes')
      const noteDoc = await collection.findOne({ type: 'quick_notes' })
      return { notes: noteDoc?.content || '' }
    } catch (error) {
      reply.code(500).send({ error: 'Failed to fetch notes' })
    }
  })

  fastify.post('/api/notes', async (request, reply) => {
    try {
      const { notes } = request.body
      
      const collection = db.collection('notes')
      await collection.replaceOne(
        { type: 'quick_notes' },
        {
          type: 'quick_notes',
          content: notes || '',
          updated: new Date().toISOString(),
          updatedBy: request.session.username
        },
        { upsert: true }
      )
      
      return { message: 'Notes saved successfully' }
    } catch (error) {
      reply.code(500).send({ error: 'Failed to save notes' })
    }
  })

  // System info API
  fastify.get('/api/system', async (request, reply) => {
    try {
      // Get basic system information
      const uptime = process.uptime()
      const uptimeHours = Math.floor(uptime / 3600)
      const uptimeMinutes = Math.floor((uptime % 3600) / 60)
      const uptimeString = `${uptimeHours}h ${uptimeMinutes}m`
      
      // Count running services (Docker containers)
      let servicesCount = 4 // Default assumption
      try {
        const { exec } = require('child_process')
        const { promisify } = require('util')
        const execAsync = promisify(exec)
        
        const { stdout } = await execAsync('docker ps --format "table {{.Names}}" | wc -l')
        const containerCount = parseInt(stdout.trim()) - 1 // Subtract header
        servicesCount = containerCount > 0 ? containerCount : 4
      } catch (error) {
        // If docker command fails, use default
      }
      
      return {
        uptime: uptimeString,
        services: servicesCount,
        timestamp: new Date().toISOString(),
        user: request.session.username
      }
    } catch (error) {
      reply.code(500).send({ error: 'Failed to get system info' })
    }
  })

  // Weather API (placeholder)
  fastify.get('/api/weather', async (request, reply) => {
    try {
      return {
        location: 'Belgrade, RS',
        temperature: Math.round(Math.random() * 30 + 5),
        description: 'Partly cloudy',
        feelsLike: Math.round(Math.random() * 30 + 5),
        humidity: Math.round(Math.random() * 40 + 40),
        windSpeed: Math.round(Math.random() * 20 + 5),
        icon: 'fa-cloud-sun',
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      reply.code(500).send({ error: 'Failed to get weather data' })
    }
  })

  // Events/Calendar API
  fastify.get('/api/events', async (request, reply) => {
    try {
      const collection = db.collection('events')
      const today = new Date().toISOString().split('T')[0]
      
      const todayEvents = await collection.find({
        date: { $regex: `^${today}` }
      }).toArray()
      
      return { events: todayEvents }
    } catch (error) {
      reply.code(500).send({ error: 'Failed to fetch events' })
    }
  })

  fastify.post('/api/events', async (request, reply) => {
    try {
      const { title, date, time, description } = request.body
      if (!title || !date) {
        reply.code(400).send({ error: 'Title and date are required' })
        return
      }
      
      const collection = db.collection('events')
      const newEvent = {
        title,
        date,
        time: time || '',
        description: description || '',
        created: new Date().toISOString(),
        createdBy: request.session.username
      }
      
      const result = await collection.insertOne(newEvent)
      return { 
        message: 'Event created successfully',
        id: result.insertedId,
        event: newEvent
      }
    } catch (error) {
      reply.code(500).send({ error: 'Failed to create event' })
    }
  })
})

// Health check route (public)
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  }
})

// Redirect all other routes to login if not authenticated
fastify.setNotFoundHandler(function (request, reply) {
  if (request.session?.authenticated) {
    reply.code(404).send({ error: 'Not found' })
  } else {
    reply.redirect('/login')
  }
})

// Start server
const start = async () => {
  try {
    await initializeAuth()
    await connectMongoDB()
    await initializeSession()
    
    const port = process.env.PORT || 3000
    const host = '0.0.0.0'
    
    await fastify.listen({ port, host })
    console.log(`Secured Personal Dashboard running on http://${host}:${port}`)
    console.log(`Admin username: ${process.env.ADMIN_USERNAME || 'admin'}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...')
  try {
    await client.close()
    await fastify.close()
    process.exit(0)
  } catch (error) {
    console.error('Error during shutdown:', error)
    process.exit(1)
  }
})

start()

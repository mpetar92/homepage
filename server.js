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
    this.initialized = false
  }

  // Initialize the session store with TTL index
  async initialize() {
    if (this.initialized) return

    try {
      // Create TTL index on expires field for automatic cleanup
      await this.collection.createIndex(
        { expires: 1 },
        { expireAfterSeconds: 0 }
      )
      console.log('Session store TTL index created')
      this.initialized = true
    } catch (error) {
      console.error('Session store initialization error:', error)
    }
  }

  // Fastify session store interface methods
  async get(sessionId, callback) {
    try {
      const session = await this.collection.findOne({
        _id: sessionId,
        expires: { $gt: new Date() } // Only get non-expired sessions
      })

      if (session && session.data) {
        console.log('Session retrieved:', { sessionId, hasData: true })
        if (callback) callback(null, session.data)
        return session.data
      }

      // If session expired or doesn't exist, clean it up
      if (session) {
        await this.collection.deleteOne({ _id: sessionId })
        console.log('Expired session cleaned up:', { sessionId })
      }

      if (callback) callback(null, null)
      return null
    } catch (error) {
      console.error('Session get error:', error)
      if (callback) callback(error, null)
      return null
    }
  }

  async set(sessionId, session, callback) {
    try {
      if (!this.initialized) {
        await this.initialize()
      }

      const expiresIn = session.cookie?.maxAge || 86400000 // Default 24 hours
      const expiresAt = new Date(Date.now() + expiresIn)

      console.log('Setting session:', {
        sessionId,
        hasData: !!session,
        expiresAt: expiresAt.toISOString(),
        maxAge: expiresIn
      })

      const result = await this.collection.replaceOne(
        { _id: sessionId },
        {
          _id: sessionId,
          data: session,
          expires: expiresAt,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        { upsert: true }
      )

      console.log('Session set result:', {
        sessionId,
        modified: result.modifiedCount,
        upserted: result.upsertedCount
      })

      if (callback) callback(null)
    } catch (error) {
      console.error('Session set error:', error)
      if (callback) callback(error)
      else throw error
    }
  }

  async destroy(sessionId, callback) {
    try {
      const result = await this.collection.deleteOne({ _id: sessionId })
      console.log('Session destroyed:', { sessionId, deleted: result.deletedCount })
      if (callback) callback(null)
    } catch (error) {
      console.error('Session destroy error:', error)
      if (callback) callback(error)
    }
  }

  // Optional: Get session statistics
  async getStats() {
    try {
      const totalSessions = await this.collection.countDocuments({})
      const activeSessions = await this.collection.countDocuments({
        expires: { $gt: new Date() }
      })
      return {
        total: totalSessions,
        active: activeSessions,
        expired: totalSessions - activeSessions
      }
    } catch (error) {
      console.error('Session stats error:', error)
      return { total: 0, active: 0, expired: 0 }
    }
  }

  // Optional: Manual cleanup of expired sessions
  async cleanup() {
    try {
      const result = await this.collection.deleteMany({
        expires: { $lt: new Date() }
      })
      console.log(`Cleaned up ${result.deletedCount} expired sessions`)
      return result.deletedCount
    } catch (error) {
      console.error('Session cleanup error:', error)
      return 0
    }
  }
}

// Hash admin password on startup
let adminPasswordHash
async function initializeAuth() {
  const adminPassword = process.env.ADMIN_PASSWORD
  adminPasswordHash = await bcrypt.hash(adminPassword, 12)
  console.log('Admin authentication initialized')
}

// Initialize session store after MongoDB connection
let sessionStore

// Register main plugin that contains all routes
fastify.register(async function (fastify) {
  // Initialize MongoDB session store
  sessionStore = new MongoSessionStore(db)

  try {
    // Try to register session plugin with MongoDB store
    await fastify.register(require('@fastify/session'), {
      secret: process.env.SESSION_SECRET || 'fallback-secret-key',
      store: sessionStore, // Use MongoDB session store
      cookie: {
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours default
        sameSite: 'lax'
      },
      saveUninitialized: false
    })
    console.log('MongoDB session store initialized successfully')
  } catch (error) {
    console.warn('MongoDB session store failed, falling back to in-memory sessions:', error.message)
    // Fallback to in-memory sessions
    await fastify.register(require('@fastify/session'), {
      secret: process.env.SESSION_SECRET || 'fallback-secret-key',
      cookie: {
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours default
        sameSite: 'lax'
      },
      saveUninitialized: false
    })
    sessionStore = null // Disable custom session store
    console.log('In-memory session store initialized as fallback')
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
      const adminUsername = process.env.ADMIN_USERNAME
      const isValidUsername = username === adminUsername
      const isValidPassword = password == process.env.ADMIN_PASSWORD

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

      console.log('Sending response...')
      return reply.send({ success: true, message: 'Login successful' })
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

    // GitHub Analysis API
    const GitHubAnalyzer = require('./services/githubAnalyzer')
    const githubAnalyzer = new GitHubAnalyzer()

    // Get saved analysis reports
    fastify.get('/api/github/reports', async (request, reply) => {
      try {
        const collection = db.collection('github_reports')
        const reports = await collection.find({}).sort({ generatedAt: -1 }).limit(20).toArray()

        return {
          reports: reports.map(report => ({
            id: report._id,
            repository: report.metadata?.repository,
            period: report.metadata?.analyzedPeriod,
            generatedAt: report.metadata?.generatedAt,
            summary: {
              totalCommits: report.summary?.totalCommits || 0,
              totalPrs: report.summary?.totalPrs || 0,
              activeContributors: report.summary?.activeContributors || 0
            }
          }))
        }
      } catch (error) {
        console.error('Error fetching reports:', error)
        reply.code(500).send({ error: 'Failed to fetch reports' })
      }
    })

    // Get specific analysis report by ID
    fastify.get('/api/github/reports/:id', async (request, reply) => {
      try {
        const { id } = request.params
        const { ObjectId } = require('mongodb')

        if (!ObjectId.isValid(id)) {
          return reply.code(400).send({ error: 'Invalid report ID' })
        }

        const collection = db.collection('github_reports')
        const report = await collection.findOne({ _id: new ObjectId(id) })

        if (!report) {
          return reply.code(404).send({ error: 'Report not found' })
        }

        return report
      } catch (error) {
        console.error('Error fetching report:', error)
        reply.code(500).send({ error: 'Failed to fetch report' })
      }
    })

    // Generate new analysis report (user-triggered)

    // Delete analysis report
    fastify.delete('/api/github/reports/:id', async (request, reply) => {
      try {
        const { id } = request.params
        const { ObjectId } = require('mongodb')

        if (!ObjectId.isValid(id)) {
          return reply.code(400).send({ error: 'Invalid report ID' })
        }

        const collection = db.collection('github_reports')
        const result = await collection.deleteOne({ _id: new ObjectId(id) })

        if (result.deletedCount === 0) {
          return reply.code(404).send({ error: 'Report not found' })
        }

        return { message: 'Report deleted successfully' }
      } catch (error) {
        console.error('Error deleting report:', error)
        reply.code(500).send({ error: 'Failed to delete report' })
      }
    })

    // Get quick repository status
    fastify.get('/api/github/status', async (request, reply) => {
      try {
        const { owner, repo } = request.query
        const repoOwner = owner || process.env.GITHUB_OWNER || 'everli'
        const repoName = repo || process.env.GITHUB_REPO || 'ev3rli'

        if (!process.env.GITHUB_TOKEN) {
          return reply.code(503).send({
            error: 'GitHub API credentials not configured',
            message: 'Please set GITHUB_TOKEN environment variable'
          })
        }

        const status = await githubAnalyzer.getQuickStatus(repoOwner, repoName)
        return status
      } catch (error) {
        console.error('GitHub status error:', error)
        reply.code(500).send({
          error: 'Failed to get repository status',
          message: error.message
        })
      }
    })

    // Get recent commits only
    fastify.get('/api/github/commits', async (request, reply) => {
      try {
        const { owner, repo, days } = request.query
        const repoOwner = owner || process.env.GITHUB_OWNER || 'everli'
        const repoName = repo || process.env.GITHUB_REPO || 'ev3rli'
        const analysisDays = parseInt(days) || 7

        if (!process.env.GITHUB_TOKEN) {
          return reply.code(503).send({
            error: 'GitHub API credentials not configured',
            message: 'Please set GITHUB_TOKEN environment variable'
          })
        }

        const commits = await githubAnalyzer.fetchRecentCommits(repoOwner, repoName, analysisDays)
        return {
          commits,
          metadata: {
            repository: `${repoOwner}/${repoName}`,
            period: `${analysisDays} days`,
            count: commits.length
          }
        }
      } catch (error) {
        console.error('GitHub commits error:', error)
        reply.code(500).send({
          error: 'Failed to fetch commits',
          message: error.message
        })
      }
    })

    // Session management endpoints (admin only)
    fastify.get('/api/sessions/stats', async (request, reply) => {
      try {
        if (sessionStore) {
          const stats = await sessionStore.getStats()
          return {
            ...stats,
            timestamp: new Date().toISOString()
          }
        }
        return { message: 'Session store not available' }
      } catch (error) {
        console.error('Session stats error:', error)
        reply.code(500).send({ error: 'Failed to get session stats' })
      }
    })

    fastify.post('/api/sessions/cleanup', async (request, reply) => {
      try {
        if (sessionStore) {
          const cleaned = await sessionStore.cleanup()
          return {
            message: 'Session cleanup completed',
            cleanedSessions: cleaned,
            timestamp: new Date().toISOString()
          }
        }
        return { message: 'Session store not available' }
      } catch (error) {
        console.error('Session cleanup error:', error)
        reply.code(500).send({ error: 'Failed to cleanup sessions' })
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

  // GitHub Analysis API - Generate endpoint (with Basic Auth support)
  const GitHubAnalyzer = require('./services/githubAnalyzer')
  const githubAnalyzer = new GitHubAnalyzer()

  // Generate new analysis report (supports both session auth and Basic Auth)
  fastify.post('/api/github/reports/generate', async (request, reply) => {
    try {
      let authenticatedUser = null;

      // Check for session authentication first
      if (request.session?.authenticated) {
        authenticatedUser = request.session.username;
      } else {
        // Check for Basic Auth header
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Basic ')) {
          reply.code(401).send({ error: 'Unauthorized - Basic Auth required' });
          return;
        }

        // Decode basic auth header
        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
        const [username, password] = credentials.split(':');

        // Check against environment variables
        const validUsername = process.env.BASIC_AUTH_USERNAME || process.env.ADMIN_USERNAME;
        const validPassword = process.env.BASIC_AUTH_PASSWORD;

        if (!validUsername || !validPassword) {
          reply.code(503).send({
            error: 'Basic Auth not configured',
            message: 'Please set BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD environment variables'
          });
          return;
        }

        if (username !== validUsername || password !== validPassword) {
          reply.code(401).send({ error: 'Invalid credentials' });
          return;
        }

        authenticatedUser = username;
      }

      const { owner, repo, days } = request.body
      const repoOwner = owner || process.env.GITHUB_OWNER || 'everli'
      const repoName = repo || process.env.GITHUB_REPO || 'ev3rli'
      const analysisDays = parseInt(days) || 7

      if (!process.env.GITHUB_TOKEN || !process.env.OPENAI_API_KEY) {
        return reply.code(503).send({
          error: 'GitHub and OpenAI API credentials not configured',
          message: 'Please set GITHUB_TOKEN and OPENAI_API_KEY environment variables'
        })
      }

      // Generate the analysis
      const analysis = await githubAnalyzer.generateRepositoryReport(repoOwner, repoName, analysisDays)

      // Save to database
      const collection = db.collection('github_reports')
      const reportDoc = {
        ...analysis,
        createdBy: authenticatedUser,
        createdAt: new Date().toISOString()
      }

      const result = await collection.insertOne(reportDoc)

      return {
        message: 'Report generated and saved successfully',
        reportId: result.insertedId,
        report: analysis
      }
    } catch (error) {
      console.error('GitHub analysis generation error:', error)
      reply.code(500).send({
        error: 'Failed to generate analysis report',
        message: error.message
      })
    }
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
})

// Start server
const start = async () => {
  try {
    await initializeAuth()
    await connectMongoDB()

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

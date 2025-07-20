require('dotenv').config()
const path = require('path')
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

// Register static file serving
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/'
})

// Register CORS
fastify.register(require('@fastify/cors'), {
  origin: true
})

// Dashboard homepage
fastify.get('/', async (request, reply) => {
  return reply.sendFile('index.html')
})

// API status route
fastify.get('/api/status', async (request, reply) => {
  return { 
    message: 'Personal Dashboard API is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    status: 'healthy'
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
      updated: new Date().toISOString()
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
        updated: new Date().toISOString()
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
        updated: new Date().toISOString()
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
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    reply.code(500).send({ error: 'Failed to get system info' })
  }
})

// Weather API (placeholder - you'd integrate with a real weather service)
fastify.get('/api/weather', async (request, reply) => {
  try {
    // Placeholder weather data
    // In production, you'd integrate with OpenWeatherMap, AccuWeather, etc.
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

// Events/Calendar API (placeholder)
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
      created: new Date().toISOString()
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

// Health check route
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  }
})

// Start server
const start = async () => {
  try {
    await connectMongoDB()
    
    const port = process.env.PORT || 3000
    const host = '0.0.0.0'
    
    await fastify.listen({ port, host })
    console.log(`Personal Dashboard running on http://${host}:${port}`)
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

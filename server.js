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
    db = client.db('myapp')
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

// Homepage route - serve the HTML file
fastify.get('/', async (request, reply) => {
  return reply.sendFile('index.html')
})

// API status route
fastify.get('/api/status', async (request, reply) => {
  return { 
    message: 'Fastify + MongoDB API is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    status: 'healthy'
  }
})

// Get all items/projects
fastify.get('/api/items', async (request, reply) => {
  try {
    const collection = db.collection('items')
    const items = await collection.find({}).toArray()
    return { items }
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch items' })
  }
})

// Create new item/project
fastify.post('/api/items', async (request, reply) => {
  try {
    const { name, description, technologies, github, demo } = request.body
    if (!name) {
      reply.code(400).send({ error: 'Name is required' })
      return
    }
    
    const collection = db.collection('items')
    const newItem = {
      name,
      description: description || '',
      technologies: technologies || [],
      github: github || '',
      demo: demo || '',
      createdAt: new Date()
    }
    
    const result = await collection.insertOne(newItem)
    return { 
      message: 'Item created successfully',
      id: result.insertedId,
      item: newItem
    }
  } catch (error) {
    reply.code(500).send({ error: 'Failed to create item' })
  }
})

// Get single item by ID
fastify.get('/api/items/:id', async (request, reply) => {
  try {
    const { ObjectId } = require('mongodb')
    const collection = db.collection('items')
    const item = await collection.findOne({ _id: new ObjectId(request.params.id) })
    
    if (!item) {
      reply.code(404).send({ error: 'Item not found' })
      return
    }
    
    return { item }
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch item' })
  }
})

// Contact form submission
fastify.post('/api/contact', async (request, reply) => {
  try {
    const { name, email, subject, message } = request.body
    
    if (!name || !email || !subject || !message) {
      reply.code(400).send({ error: 'All fields are required' })
      return
    }
    
    const collection = db.collection('contacts')
    const contactMessage = {
      name,
      email,
      subject,
      message,
      createdAt: new Date(),
      status: 'new'
    }
    
    const result = await collection.insertOne(contactMessage)
    
    // In a real application, you might want to send an email notification here
    console.log('New contact message received:', contactMessage)
    
    return { 
      message: 'Contact message received successfully',
      id: result.insertedId
    }
  } catch (error) {
    reply.code(500).send({ error: 'Failed to submit contact form' })
  }
})

// Get contact messages (for admin)
fastify.get('/api/contacts', async (request, reply) => {
  try {
    const collection = db.collection('contacts')
    const contacts = await collection.find({}).sort({ createdAt: -1 }).toArray()
    return { contacts }
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch contacts' })
  }
})

// Health check route
fastify.get('/health', async (request, reply) => {
  return { status: 'OK', timestamp: new Date().toISOString() }
})

// Start server
const start = async () => {
  try {
    await connectMongoDB()
    
    const port = process.env.PORT || 3000
    const host = '0.0.0.0'
    
    await fastify.listen({ port, host })
    console.log(`Server running on http://${host}:${port}`)
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

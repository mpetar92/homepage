require('dotenv').config()
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

// Register CORS
fastify.register(require('@fastify/cors'), {
  origin: true
})

// Health check route
fastify.get('/', async (request, reply) => {
  return { 
    message: 'Fastify + MongoDB API is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  }
})

// Get all items
fastify.get('/api/items', async (request, reply) => {
  try {
    const collection = db.collection('items')
    const items = await collection.find({}).toArray()
    return { items }
  } catch (error) {
    reply.code(500).send({ error: 'Failed to fetch items' })
  }
})

// Create new item
fastify.post('/api/items', async (request, reply) => {
  try {
    const { name, description } = request.body
    if (!name) {
      reply.code(400).send({ error: 'Name is required' })
      return
    }
    
    const collection = db.collection('items')
    const newItem = {
      name,
      description: description || '',
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

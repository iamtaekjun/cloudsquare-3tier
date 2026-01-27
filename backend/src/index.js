import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
})

// Initialize database table
async function initDB() {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS todos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    console.log('Database initialized')
  } catch (err) {
    console.error('Database initialization failed:', err.message)
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Get all todos
app.get('/api/todos', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM todos ORDER BY created_at DESC')
    res.json(rows)
  } catch (err) {
    console.error('Error fetching todos:', err)
    res.status(500).json({ error: 'Failed to fetch todos' })
  }
})

// Create todo
app.post('/api/todos', async (req, res) => {
  const { title } = req.body
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' })
  }

  try {
    const [result] = await pool.execute(
      'INSERT INTO todos (title) VALUES (?)',
      [title.trim()]
    )
    const [rows] = await pool.execute('SELECT * FROM todos WHERE id = ?', [result.insertId])
    res.status(201).json(rows[0])
  } catch (err) {
    console.error('Error creating todo:', err)
    res.status(500).json({ error: 'Failed to create todo' })
  }
})

// Update todo
app.patch('/api/todos/:id', async (req, res) => {
  const { id } = req.params
  const { title, completed } = req.body

  try {
    const updates = []
    const values = []

    if (title !== undefined) {
      updates.push('title = ?')
      values.push(title.trim())
    }
    if (completed !== undefined) {
      updates.push('completed = ?')
      values.push(completed)
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' })
    }

    values.push(id)
    await pool.execute(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`, values)

    const [rows] = await pool.execute('SELECT * FROM todos WHERE id = ?', [id])
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Todo not found' })
    }
    res.json(rows[0])
  } catch (err) {
    console.error('Error updating todo:', err)
    res.status(500).json({ error: 'Failed to update todo' })
  }
})

// Delete todo
app.delete('/api/todos/:id', async (req, res) => {
  const { id } = req.params

  try {
    const [result] = await pool.execute('DELETE FROM todos WHERE id = ?', [id])
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Todo not found' })
    }
    res.status(204).send()
  } catch (err) {
    console.error('Error deleting todo:', err)
    res.status(500).json({ error: 'Failed to delete todo' })
  }
})

// Start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
})

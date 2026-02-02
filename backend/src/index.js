import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto from 'crypto'
import mysql from 'mysql2/promise'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import multer from 'multer'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

// NCP Object Storage (S3 호환)
const s3 = new S3Client({
  region: 'kr-standard',
  endpoint: 'https://kr.object.ncloudstorage.com',
  credentials: {
    accessKeyId: process.env.NCP_ACCESS_KEY,
    secretAccessKey: process.env.NCP_SECRET_KEY
  }
})
const BUCKET_NAME = process.env.NCP_BUCKET_NAME
const upload = multer({ storage: multer.memoryStorage() })

// NCP KMS 암호화/복호화
const KMS_KEY_TAG = process.env.NCP_KMS_KEY_TAG
const NCP_ACCESS_KEY = process.env.NCP_ACCESS_KEY
const NCP_SECRET_KEY = process.env.NCP_SECRET_KEY

function makeSignature(method, url, timestamp) {
  const space = ' '
  const newLine = '\n'
  const message = method + space + url + newLine + timestamp + newLine + NCP_ACCESS_KEY
  const hmac = crypto.createHmac('sha256', NCP_SECRET_KEY)
  return hmac.update(message).digest('base64')
}

async function kmsEncrypt(plaintext) {
  const timestamp = Date.now().toString()
  const url = `/keys/v2/${KMS_KEY_TAG}/encrypt`
  const signature = makeSignature('POST', url, timestamp)
  const body = JSON.stringify({ plaintext: Buffer.from(plaintext).toString('base64') })

  const res = await fetch(`https://kms.apigw.ntruss.com/keys/v2/${KMS_KEY_TAG}/encrypt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ncp-apigw-timestamp': timestamp,
      'x-ncp-iam-access-key': NCP_ACCESS_KEY,
      'x-ncp-apigw-signature-v2': signature
    },
    body
  })
  const data = await res.json()
  console.log('KMS encrypt response:', JSON.stringify(data))
  if (data.code !== 'SUCCESS') throw new Error(`KMS encrypt failed: ${JSON.stringify(data)}`)
  return data.data.ciphertext
}

async function kmsDecrypt(ciphertext) {
  const timestamp = Date.now().toString()
  const url = `/keys/v2/${KMS_KEY_TAG}/decrypt`
  const signature = makeSignature('POST', url, timestamp)
  const body = JSON.stringify({ ciphertext })

  const res = await fetch(`https://kms.apigw.ntruss.com/keys/v2/${KMS_KEY_TAG}/decrypt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ncp-apigw-timestamp': timestamp,
      'x-ncp-iam-access-key': NCP_ACCESS_KEY,
      'x-ncp-apigw-signature-v2': signature
    },
    body
  })
  const data = await res.json()
  if (data.code !== 'SUCCESS') throw new Error(`KMS decrypt failed: ${data.msg}`)
  return Buffer.from(data.data.plaintext, 'base64').toString('utf8')
}

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
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        due_date DATE DEFAULT (CURRENT_DATE),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    // Add due_date column if not exists (for existing tables)
    await pool.execute(`
      ALTER TABLE todos ADD COLUMN IF NOT EXISTS due_date DATE DEFAULT (CURRENT_DATE)
    `).catch(() => {})
    // Add image_url column if not exists
    const [cols] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'todos' AND COLUMN_NAME = 'image_url'`,
      [process.env.DB_NAME]
    )
    if (cols.length === 0) {
      await pool.execute('ALTER TABLE todos ADD COLUMN image_url VARCHAR(512) DEFAULT NULL')
    }
    console.log('Database initialized')
  } catch (err) {
    console.error('Database initialization failed:', err.message)
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Presigned URL 발급 (이미지 업로드용)
app.get('/api/upload-url', async (req, res) => {
  try {
    const { filename, contentType } = req.query
    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' })
    }
    const key = `images/${Date.now()}-${filename}`
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      ACL: 'public-read'
    })
    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 })
    const imageUrl = `https://kr.object.ncloudstorage.com/${BUCKET_NAME}/${key}`
    res.json({ uploadUrl, imageUrl })
  } catch (err) {
    console.error('Error generating presigned URL:', err)
    res.status(500).json({ error: 'Failed to generate upload URL' })
  }
})

// WAS 경유 업로드 (비교 테스트용)
app.post('/api/upload-direct', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }
    const key = `images/${Date.now()}-${req.file.originalname}`
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: 'public-read'
    }))
    const imageUrl = `https://kr.object.ncloudstorage.com/${BUCKET_NAME}/${key}`
    res.json({ imageUrl })
  } catch (err) {
    console.error('Error uploading file:', err)
    res.status(500).json({ error: 'Failed to upload file' })
  }
})

// Get all todos (with optional date filter)
app.get('/api/todos', async (req, res) => {
  try {
    const { date } = req.query
    let query = 'SELECT * FROM todos'
    let params = []

    if (date) {
      query += ' WHERE due_date = ?'
      params.push(date)
    }
    query += ' ORDER BY created_at DESC'

    const [rows] = await pool.execute(query, params)
    for (const row of rows) {
      try { row.title = await kmsDecrypt(row.title) } catch { /* 기존 평문 데이터 호환 */ }
    }
    res.json(rows)
  } catch (err) {
    console.error('Error fetching todos:', err)
    res.status(500).json({ error: 'Failed to fetch todos' })
  }
})

// Get todos count by date (for calendar dots)
app.get('/api/todos/calendar', async (req, res) => {
  try {
    const { year, month } = req.query
    const [rows] = await pool.execute(
      `SELECT due_date, COUNT(*) as count, SUM(completed) as completed_count
       FROM todos
       WHERE YEAR(due_date) = ? AND MONTH(due_date) = ?
       GROUP BY due_date`,
      [year, month]
    )
    res.json(rows)
  } catch (err) {
    console.error('Error fetching calendar data:', err)
    res.status(500).json({ error: 'Failed to fetch calendar data' })
  }
})

// Create todo
app.post('/api/todos', async (req, res) => {
  const { title, due_date, image_url } = req.body
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' })
  }

  try {
    const dateValue = due_date || new Date().toISOString().split('T')[0]
    const encryptedTitle = await kmsEncrypt(title.trim())
    const [result] = await pool.execute(
      'INSERT INTO todos (title, due_date, image_url) VALUES (?, ?, ?)',
      [encryptedTitle, dateValue, image_url || null]
    )
    const [rows] = await pool.execute('SELECT * FROM todos WHERE id = ?', [result.insertId])
    rows[0].title = await kmsDecrypt(rows[0].title)
    res.status(201).json(rows[0])
  } catch (err) {
    console.error('Error creating todo:', err)
    res.status(500).json({ error: 'Failed to create todo' })
  }
})

// Update todo
app.patch('/api/todos/:id', async (req, res) => {
  const { id } = req.params
  const { title, completed, due_date, image_url } = req.body

  try {
    const updates = []
    const values = []

    if (title !== undefined) {
      updates.push('title = ?')
      values.push(await kmsEncrypt(title.trim()))
    }
    if (completed !== undefined) {
      updates.push('completed = ?')
      values.push(completed)
    }
    if (due_date !== undefined) {
      updates.push('due_date = ?')
      values.push(due_date)
    }
    if (image_url !== undefined) {
      updates.push('image_url = ?')
      values.push(image_url)
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
    try { rows[0].title = await kmsDecrypt(rows[0].title) } catch { /* 평문 호환 */ }
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

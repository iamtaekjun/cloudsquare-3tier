import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto from 'crypto'
import mysql from 'mysql2/promise'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import multer from 'multer'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import cron from 'node-cron'
import nodemailer from 'nodemailer'

dotenv.config()

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

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
    // users 테이블 생성
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

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
    // Add user_id column if not exists
    const [userIdCol] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'todos' AND COLUMN_NAME = 'user_id'`,
      [process.env.DB_NAME]
    )
    if (userIdCol.length === 0) {
      await pool.execute('ALTER TABLE todos ADD COLUMN user_id INT')
    }
    // Add due_time column if not exists
    const [dueTimeCol] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'todos' AND COLUMN_NAME = 'due_time'`,
      [process.env.DB_NAME]
    )
    if (dueTimeCol.length === 0) {
      await pool.execute('ALTER TABLE todos ADD COLUMN due_time TIME DEFAULT NULL')
    }
    // Add notify_email column if not exists
    const [notifyEmailCol] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'todos' AND COLUMN_NAME = 'notify_email'`,
      [process.env.DB_NAME]
    )
    if (notifyEmailCol.length === 0) {
      await pool.execute('ALTER TABLE todos ADD COLUMN notify_email BOOLEAN DEFAULT FALSE')
    }
    // Add notify_minutes column if not exists
    const [notifyMinutesCol] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'todos' AND COLUMN_NAME = 'notify_minutes'`,
      [process.env.DB_NAME]
    )
    if (notifyMinutesCol.length === 0) {
      await pool.execute('ALTER TABLE todos ADD COLUMN notify_minutes INT DEFAULT NULL')
    }
    // Add notified column if not exists (알림 발송 여부)
    const [notifiedCol] = await pool.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'todos' AND COLUMN_NAME = 'notified'`,
      [process.env.DB_NAME]
    )
    if (notifiedCol.length === 0) {
      await pool.execute('ALTER TABLE todos ADD COLUMN notified BOOLEAN DEFAULT FALSE')
    }
    console.log('Database initialized')
  } catch (err) {
    console.error('Database initialization failed:', err.message)
  }
}

// JWT 인증 미들웨어
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: '로그인이 필요합니다.' })
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '유효하지 않은 토큰입니다.' })
    }
    req.user = user
    next()
  })
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 회원가입
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body

  if (!email || !password || !name) {
    return res.status(400).json({ error: '이메일, 비밀번호, 이름을 모두 입력해주세요.' })
  }

  try {
    // 이메일 중복 확인
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email])
    if (existing.length > 0) {
      return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' })
    }

    // 비밀번호 해시
    const hashedPassword = await bcrypt.hash(password, 10)

    // 사용자 생성
    const [result] = await pool.execute(
      'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
      [email, hashedPassword, name]
    )

    const token = jwt.sign({ id: result.insertId, email, name }, JWT_SECRET, { expiresIn: '7d' })

    res.status(201).json({ token, user: { id: result.insertId, email, name } })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({ error: '회원가입에 실패했습니다.' })
  }
})

// 로그인
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: '이메일과 비밀번호를 입력해주세요.' })
  }

  try {
    const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email])
    if (users.length === 0) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' })
    }

    const user = users[0]
    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' })
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' })

    res.json({ token, user: { id: user.id, email: user.email, name: user.name } })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: '로그인에 실패했습니다.' })
  }
})

// 내 정보 조회
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  res.json({ user: req.user })
})

// Presigned URL 발급 (이미지 업로드용)
app.get('/api/upload-url', async (req, res) => {
  try {
    const memBefore = process.memoryUsage().rss
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
    const memAfter = process.memoryUsage().rss
    console.log(`[Presigned URL] WAS 수신 데이터: ${req.headers['content-length'] || 0} bytes | 메모리 변화: ${memAfter - memBefore} bytes`)
    res.json({ uploadUrl, imageUrl })
  } catch (err) {
    console.error('Error generating presigned URL:', err)
    res.status(500).json({ error: 'Failed to generate upload URL' })
  }
})

// WAS 경유 업로드 (비교 테스트용)
app.post('/api/upload-direct', upload.single('image'), async (req, res) => {
  try {
    const memBefore = process.memoryUsage().rss
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
    const memAfter = process.memoryUsage().rss
    console.log(`[WAS 경유] WAS 수신 파일: ${req.file.size} bytes (${(req.file.size / 1024 / 1024).toFixed(2)} MB) | 메모리 변화: ${memAfter - memBefore} bytes`)
    res.json({ imageUrl })
  } catch (err) {
    console.error('Error uploading file:', err)
    res.status(500).json({ error: 'Failed to upload file' })
  }
})

// Get all todos (with optional date filter)
app.get('/api/todos', authenticateToken, async (req, res) => {
  try {
    const { date } = req.query
    const userId = req.user.id
    let query = 'SELECT * FROM todos WHERE user_id = ?'
    let params = [userId]

    if (date) {
      query += ' AND due_date = ?'
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
app.get('/api/todos/calendar', authenticateToken, async (req, res) => {
  try {
    const { year, month } = req.query
    const userId = req.user.id
    const [rows] = await pool.execute(
      `SELECT due_date, COUNT(*) as count, SUM(completed) as completed_count
       FROM todos
       WHERE user_id = ? AND YEAR(due_date) = ? AND MONTH(due_date) = ?
       GROUP BY due_date`,
      [userId, year, month]
    )
    res.json(rows)
  } catch (err) {
    console.error('Error fetching calendar data:', err)
    res.status(500).json({ error: 'Failed to fetch calendar data' })
  }
})

// Create todo
app.post('/api/todos', authenticateToken, async (req, res) => {
  const { title, due_date, due_time, image_url, notify_email, notify_minutes } = req.body
  const userId = req.user.id
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' })
  }

  try {
    const dateValue = due_date || new Date().toISOString().split('T')[0]
    const encryptedTitle = await kmsEncrypt(title.trim())
    const [result] = await pool.execute(
      'INSERT INTO todos (title, due_date, due_time, image_url, user_id, notify_email, notify_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [encryptedTitle, dateValue, due_time || null, image_url || null, userId, notify_email || false, notify_minutes || null]
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
app.patch('/api/todos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params
  const { title, completed, due_date, image_url } = req.body
  const userId = req.user.id

  try {
    // 본인 소유 확인
    const [existing] = await pool.execute('SELECT * FROM todos WHERE id = ? AND user_id = ?', [id, userId])
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Todo not found' })
    }

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

    values.push(id, userId)
    await pool.execute(`UPDATE todos SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, values)

    const [rows] = await pool.execute('SELECT * FROM todos WHERE id = ?', [id])
    try { rows[0].title = await kmsDecrypt(rows[0].title) } catch { /* 평문 호환 */ }
    res.json(rows[0])
  } catch (err) {
    console.error('Error updating todo:', err)
    res.status(500).json({ error: 'Failed to update todo' })
  }
})

// Delete todo
app.delete('/api/todos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  try {
    const [result] = await pool.execute('DELETE FROM todos WHERE id = ? AND user_id = ?', [id, userId])
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Todo not found' })
    }
    res.status(204).send()
  } catch (err) {
    console.error('Error deleting todo:', err)
    res.status(500).json({ error: 'Failed to delete todo' })
  }
})

// 이메일 발송 설정 (Gmail SMTP)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
})

// 이메일 발송 함수
async function sendEmailNotification(toEmail, todoTitle, dueDate, dueTime) {
  const mailOptions = {
    from: `"Todo Calendar" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `[Todo 알림] ${todoTitle}`,
    html: `
      <div style="font-family: 'Apple SD Gothic Neo', Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #f0f7f4 0%, #e8f5e9 100%);">
        <h2 style="color: #2d5a47; margin-bottom: 20px;">Todo 알림</h2>
        <div style="background: white; padding: 24px; border-radius: 12px; box-shadow: 0 2px 8px rgba(45, 90, 71, 0.1);">
          <p style="font-size: 16px; color: #3d6b54; margin: 0 0 12px 0;"><strong>할 일:</strong> ${todoTitle}</p>
          <p style="font-size: 16px; color: #3d6b54; margin: 0;"><strong>일정:</strong> ${dueDate} ${dueTime || ''}</p>
        </div>
        <p style="color: #7a9c8a; margin-top: 20px; font-size: 13px; text-align: center;">
          이 알림은 설정하신 시간에 맞춰 자동으로 발송되었습니다.
        </p>
      </div>
    `
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    console.log('Email sent:', info.messageId)
    return info
  } catch (err) {
    console.error('Email send failed:', err)
    throw err
  }
}

// 이메일 알림 스케줄러 (매분 실행)
function startNotificationScheduler() {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date()
      const currentDate = now.toISOString().split('T')[0]
      const currentHours = String(now.getHours()).padStart(2, '0')
      const currentMinutes = String(now.getMinutes()).padStart(2, '0')
      const currentTime = `${currentHours}:${currentMinutes}`

      // 알림이 필요한 Todo 조회
      const [todos] = await pool.execute(`
        SELECT t.*, u.email as user_email
        FROM todos t
        JOIN users u ON t.user_id = u.id
        WHERE t.notify_email = 1
          AND t.notified = 0
          AND t.due_date = ?
          AND t.due_time IS NOT NULL
      `, [currentDate])

      for (const todo of todos) {
        // 알림 시간 계산 (due_time - notify_minutes)
        const [hours, minutes] = todo.due_time.split(':').map(Number)
        const dueDateTime = new Date(now)
        dueDateTime.setHours(hours, minutes, 0, 0)

        const notifyTime = new Date(dueDateTime.getTime() - (todo.notify_minutes || 0) * 60 * 1000)
        const notifyHours = String(notifyTime.getHours()).padStart(2, '0')
        const notifyMinutes = String(notifyTime.getMinutes()).padStart(2, '0')
        const notifyTimeStr = `${notifyHours}:${notifyMinutes}`

        // 현재 시간이 알림 시간과 같으면 발송
        if (currentTime === notifyTimeStr) {
          try {
            // 복호화된 title 가져오기
            let decryptedTitle
            try {
              decryptedTitle = await kmsDecrypt(todo.title)
            } catch {
              decryptedTitle = todo.title
            }

            await sendEmailNotification(
              todo.user_email,
              decryptedTitle,
              todo.due_date,
              todo.due_time.slice(0, 5)
            )

            // 발송 완료 표시
            await pool.execute('UPDATE todos SET notified = 1 WHERE id = ?', [todo.id])
            console.log(`Notification sent for todo ${todo.id} to ${todo.user_email}`)
          } catch (err) {
            console.error(`Failed to send notification for todo ${todo.id}:`, err)
          }
        }
      }
    } catch (err) {
      console.error('Notification scheduler error:', err)
    }
  })
  console.log('Email notification scheduler started')
}

// Start server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
    // Gmail 설정이 있을 때만 스케줄러 시작
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      startNotificationScheduler()
    } else {
      console.log('Email notification disabled (GMAIL_USER or GMAIL_APP_PASSWORD not set)')
    }
  })
})

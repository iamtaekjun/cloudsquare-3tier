import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || '/api'

// 토큰 관리
const getToken = () => localStorage.getItem('token')
const setToken = (token) => localStorage.setItem('token', token)
const removeToken = () => localStorage.removeItem('token')
const getUser = () => {
  const user = localStorage.getItem('user')
  return user ? JSON.parse(user) : null
}
const setUser = (user) => localStorage.setItem('user', JSON.stringify(user))
const removeUser = () => localStorage.removeItem('user')

// 인증 API 요청 헬퍼
const authFetch = async (url, options = {}) => {
  const token = getToken()
  const headers = {
    ...options.headers,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return fetch(url, { ...options, headers })
}

// 로그인/회원가입 컴포넌트
function AuthForm({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register'
      const body = isLogin ? { email, password } : { email, password, name }

      const res = await fetch(`${API_URL.replace('/api', '')}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '요청에 실패했습니다.')
      }

      setToken(data.token)
      setUser(data.user)
      onLogin(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <h1>{isLogin ? '로그인' : '회원가입'}</h1>
      <p>{isLogin ? '계정에 로그인하세요' : '새 계정을 만드세요'}</p>

      {error && <div className="auth-error">{error}</div>}

      <form className="auth-form" onSubmit={handleSubmit}>
        {!isLogin && (
          <input
            type="text"
            placeholder="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? '처리 중...' : (isLogin ? '로그인' : '가입하기')}
        </button>
      </form>

      <div className="auth-switch">
        {isLogin ? '계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
        <button onClick={() => { setIsLogin(!isLogin); setError(null); }}>
          {isLogin ? '회원가입' : '로그인'}
        </button>
      </div>
    </div>
  )
}

function App() {
  const [user, setUserState] = useState(getUser())
  const [todos, setTodos] = useState([])
  const [newTodo, setNewTodo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [calendarData, setCalendarData] = useState({})
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [uploading, setUploading] = useState(false)

  const handleLogin = (userData) => {
    setUserState(userData)
  }

  const handleLogout = () => {
    removeToken()
    removeUser()
    setUserState(null)
    setTodos([])
    setCalendarData({})
  }

  const formatDate = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const formatDisplayDate = (date) => {
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  // UTC 날짜를 로컬 날짜 문자열로 변환
  const parseDate = (dateStr) => {
    const date = new Date(dateStr)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  // 캘린더 데이터 조회 (월별 Todo 개수)
  const fetchCalendarData = async (year, month) => {
    try {
      const res = await authFetch(`${API_URL}/todos/calendar?year=${year}&month=${month}`)
      if (!res.ok) throw new Error('Failed to fetch calendar')
      const data = await res.json()
      const mapped = {}
      data.forEach(item => {
        const dateStr = parseDate(item.due_date)
        mapped[dateStr] = { count: item.count, completed: item.completed_count }
      })
      setCalendarData(mapped)
    } catch (err) {
      console.error('Calendar fetch error:', err)
    }
  }

  // Todo 목록 조회 (날짜별)
  const fetchTodos = async (date) => {
    try {
      setLoading(true)
      const dateStr = formatDate(date)
      const res = await authFetch(`${API_URL}/todos?date=${dateStr}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setTodos(data)
      setError(null)
    } catch (err) {
      setError('할 일 목록을 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // useEffect는 조건문 전에 위치해야 함
  useEffect(() => {
    if (user) {
      fetchTodos(selectedDate)
    }
  }, [selectedDate, user])

  useEffect(() => {
    if (user) {
      fetchCalendarData(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
    }
  }, [currentMonth, user])

  // 로그인 안 했으면 로그인 폼 보여주기
  if (!user) {
    return <AuthForm onLogin={handleLogin} />
  }

  // 이미지 선택
  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  // 이미지 제거
  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
  }

  // Presigned URL로 이미지 업로드
  const uploadImage = async (file) => {
    const res = await fetch(`${API_URL}/upload-url?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`)
    if (!res.ok) throw new Error('Failed to get upload URL')
    const { uploadUrl, imageUrl } = await res.json()

    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file
    })

    return imageUrl
  }

  // Todo 추가
  const addTodo = async (e) => {
    e.preventDefault()
    if (!newTodo.trim()) return

    try {
      setUploading(true)
      let imageUrl = null
      if (imageFile) {
        imageUrl = await uploadImage(imageFile)
      }

      const res = await authFetch(`${API_URL}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTodo, due_date: formatDate(selectedDate), image_url: imageUrl })
      })
      if (!res.ok) throw new Error('Failed to add')
      const todo = await res.json()
      setTodos([todo, ...todos])
      setNewTodo('')
      clearImage()
      fetchCalendarData(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
    } catch (err) {
      setError('할 일 추가에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  // Todo 완료 토글
  const toggleTodo = async (id, completed) => {
    try {
      const res = await authFetch(`${API_URL}/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed })
      })
      if (!res.ok) throw new Error('Failed to update')
      const updated = await res.json()
      setTodos(todos.map(t => t.id === id ? updated : t))
      fetchCalendarData(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
    } catch (err) {
      setError('업데이트에 실패했습니다.')
    }
  }

  // Todo 삭제
  const deleteTodo = async (id) => {
    try {
      const res = await authFetch(`${API_URL}/todos/${id}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to delete')
      setTodos(todos.filter(t => t.id !== id))
      fetchCalendarData(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
    } catch (err) {
      setError('삭제에 실패했습니다.')
    }
  }

  // 캘린더 렌더링
  const renderCalendar = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = formatDate(new Date())
    const selected = formatDate(selectedDate)

    const days = []
    const dayNames = ['일', '월', '화', '수', '목', '금', '토']

    // 요일 헤더
    dayNames.forEach((day, i) => {
      days.push(
        <div key={`header-${i}`} className={`calendar-header-cell ${i === 0 ? 'sunday' : i === 6 ? 'saturday' : ''}`}>
          {day}
        </div>
      )
    })

    // 빈 칸
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-cell empty"></div>)
    }

    // 날짜
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const data = calendarData[dateStr]
      const isToday = dateStr === today
      const isSelected = dateStr === selected
      const dayOfWeek = new Date(year, month, day).getDay()

      days.push(
        <div
          key={day}
          className={`calendar-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${dayOfWeek === 0 ? 'sunday' : dayOfWeek === 6 ? 'saturday' : ''}`}
          onClick={() => setSelectedDate(new Date(year, month, day))}
        >
          <span className="day-number">{day}</span>
          {data && (
            <div className="todo-indicator">
              <span className={`dot ${data.count === data.completed ? 'all-done' : ''}`}></span>
              <span className="count">{data.count}</span>
            </div>
          )}
        </div>
      )
    }

    return days
  }

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

  const goToToday = () => {
    const today = new Date()
    setCurrentMonth(today)
    setSelectedDate(today)
  }

  return (
    <div className="container">
      <div className="app-header">
        <h1>Todo Calendar</h1>
        <div className="user-info">
          <span>{user.name}님</span>
          <button onClick={handleLogout}>로그아웃</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="main-content">
        <div className="left-panel">
          <div className="calendar-container">
            <div className="calendar-nav">
              <button onClick={prevMonth}>&lt;</button>
              <span>{currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월</span>
              <button onClick={nextMonth}>&gt;</button>
              <button className="today-btn" onClick={goToToday}>오늘</button>
            </div>
            <div className="calendar-grid">
              {renderCalendar()}
            </div>
          </div>
        </div>

        <div className="right-panel">
          <div className="selected-date">
            <h2>{formatDisplayDate(selectedDate)}</h2>
          </div>

          <form className="todo-form" onSubmit={addTodo}>
            <div className="todo-input-row">
              <input
                type="text"
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                placeholder="할 일을 입력하세요"
              />
              <label className="image-btn">
                📎
                <input type="file" accept="image/*" onChange={handleImageChange} hidden />
              </label>
              <button type="submit" disabled={uploading}>
                {uploading ? '업로드 중...' : '추가'}
              </button>
            </div>
            {imagePreview && (
              <div className="image-preview">
                <img src={imagePreview} alt="미리보기" />
                <button type="button" onClick={clearImage}>✕</button>
              </div>
            )}
          </form>

          {loading ? (
            <p className="loading">로딩 중...</p>
          ) : (
            <ul className="todo-list">
              {todos.length === 0 ? (
                <li className="no-todos">이 날짜에 등록된 할 일이 없습니다.</li>
              ) : (
                todos.map(todo => (
                  <li key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => toggleTodo(todo.id, todo.completed)}
                    />
                    <div className="todo-content">
                      <span>{todo.title}</span>
                      {todo.image_url && (
                        <img
                          className="todo-image"
                          src={todo.image_url}
                          alt="첨부 이미지"
                          onClick={() => window.open(todo.image_url, '_blank')}
                        />
                      )}
                    </div>
                    <button onClick={() => deleteTodo(todo.id)}>삭제</button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default App

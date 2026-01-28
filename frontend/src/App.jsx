import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || '/api'

function App() {
  const [todos, setTodos] = useState([])
  const [newTodo, setNewTodo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [calendarData, setCalendarData] = useState({})

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
      const res = await fetch(`${API_URL}/todos/calendar?year=${year}&month=${month}`)
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
      const res = await fetch(`${API_URL}/todos?date=${dateStr}`)
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

  useEffect(() => {
    fetchTodos(selectedDate)
  }, [selectedDate])

  useEffect(() => {
    fetchCalendarData(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
  }, [currentMonth])

  // Todo 추가
  const addTodo = async (e) => {
    e.preventDefault()
    if (!newTodo.trim()) return

    try {
      const res = await fetch(`${API_URL}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTodo, due_date: formatDate(selectedDate) })
      })
      if (!res.ok) throw new Error('Failed to add')
      const todo = await res.json()
      setTodos([todo, ...todos])
      setNewTodo('')
      fetchCalendarData(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
    } catch (err) {
      setError('할 일 추가에 실패했습니다.')
    }
  }

  // Todo 완료 토글
  const toggleTodo = async (id, completed) => {
    try {
      const res = await fetch(`${API_URL}/todos/${id}`, {
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
      const res = await fetch(`${API_URL}/todos/${id}`, {
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
      <h1>Todo Calendar</h1>

      {error && <p className="error">{error}</p>}

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

      <div className="selected-date">
        <h2>{formatDisplayDate(selectedDate)}</h2>
      </div>

      <form className="todo-form" onSubmit={addTodo}>
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="할 일을 입력하세요"
        />
        <button type="submit">추가</button>
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
                <span>{todo.title}</span>
                <button onClick={() => deleteTodo(todo.id)}>삭제</button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

export default App

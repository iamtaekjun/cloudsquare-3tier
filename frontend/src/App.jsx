import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || '/api'

function App() {
  const [todos, setTodos] = useState([])
  const [newTodo, setNewTodo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Todo 목록 조회
  const fetchTodos = async () => {
    try {
      const res = await fetch(`${API_URL}/todos`)
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
    fetchTodos()
  }, [])

  // Todo 추가
  const addTodo = async (e) => {
    e.preventDefault()
    if (!newTodo.trim()) return

    try {
      const res = await fetch(`${API_URL}/todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTodo })
      })
      if (!res.ok) throw new Error('Failed to add')
      const todo = await res.json()
      setTodos([...todos, todo])
      setNewTodo('')
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
    } catch (err) {
      setError('삭제에 실패했습니다.')
    }
  }

  if (loading) return <div className="container"><p className="loading">로딩 중...</p></div>

  return (
    <div className="container">
      <h1>Todo App</h1>

      {error && <p className="error">{error}</p>}

      <form className="todo-form" onSubmit={addTodo}>
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="할 일을 입력하세요"
        />
        <button type="submit">추가</button>
      </form>

      <ul className="todo-list">
        {todos.map(todo => (
          <li key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => toggleTodo(todo.id, todo.completed)}
            />
            <span>{todo.title}</span>
            <button onClick={() => deleteTodo(todo.id)}>삭제</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default App

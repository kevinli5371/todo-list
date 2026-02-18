import React, { useState, useEffect, useRef } from 'react';
import { LayoutGrid, List, Check, Trash2, Plus, ZoomIn, ZoomOut, GripVertical, Search, Edit, PanelLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SidebarItem = ({ todo, active, onClick, onDelete }) => {
  const title = todo.text.split('\n')[0] || 'New Item';
  const rest = todo.text.split('\n').slice(1).join(' ') || 'No additional text';
  const date = new Date(todo.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div
      className={`sidebar-item ${active ? 'active' : ''}`}
      onClick={() => onClick(todo)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sidebar-item-title">{title}</div>
          <div className="sidebar-item-meta">
            <span>{date}</span>
            <span className="sidebar-item-preview">{rest}</span>
          </div>
        </div>
        <button
          className="sidebar-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(todo.id);
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

const snappyTransition = { duration: 0.15, ease: [0.4, 0, 1, 1] };

// Helper Component for Individual Todo Items to handle focus and drag
const TodoItem = ({ todo, isFocused, onUpdate, onToggle, onDelete, onFocus }) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (isFocused && inputRef.current) {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const length = inputRef.current.value.length;
          inputRef.current.setSelectionRange(length, length);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isFocused]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{
        opacity: 1,
        scale: isFocused ? 1.01 : 1,
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={snappyTransition}
      className="todo-item-canvas"
      style={{
        position: 'absolute',
        left: todo.x,
        top: todo.y,
        pointerEvents: 'auto',
        zIndex: isFocused ? 10 : 1,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        onFocus(todo.id);
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div
          className={`checkbox ${todo.completed ? 'checked' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(todo.id);
          }}
          style={{ marginTop: 4 }}
        >
          {todo.completed && <Check size={14} color="white" />}
        </div>
        <div style={{ flex: 1 }}>
          <textarea
            ref={inputRef}
            className={`todo-input ${todo.completed ? 'completed' : ''}`}
            value={todo.text}
            onChange={(e) => onUpdate(todo.id, e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="New Item"
            rows={1}
            style={{ resize: 'none', overflow: 'hidden' }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
          />
        </div>
        <button
          className="delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(todo.id);
          }}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </motion.div>
  );
};

const App = () => {
  const [todos, setTodos] = useState(() => {
    const saved = localStorage.getItem('spatial-todos');
    return saved ? JSON.parse(saved) : [];
  });

  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const [focusedId, setFocusedId] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const canvasRef = useRef(null);

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    localStorage.setItem('spatial-todos', JSON.stringify(todos));
  }, [todos]);

  const createNote = (x, y) => {
    const sidebarWidth = showSidebar ? 280 : 0;
    const newTodo = {
      id,
      text: '',
      x: x ?? (camera.x + ((window.innerWidth - sidebarWidth) / 2) / camera.zoom - 120),
      y: y ?? (camera.y + (window.innerHeight / 2) / camera.zoom - 20),
      completed: false,
      timestamp: new Date().toISOString()
    };
    setTodos(prev => [newTodo, ...prev]);
    setFocusedId(id);
    return id;
  };

  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY;
      const factor = Math.pow(1.1, delta / 100);
      const newZoom = Math.min(Math.max(camera.zoom * factor, 0.1), 5);

      const mouseX = e.clientX - (showSidebar ? 280 : 0); // Offset for sidebar
      const mouseY = e.clientY - 52; // Offset for toolbar

      setCamera(prev => ({
        zoom: newZoom,
        x: prev.x + (mouseX / prev.zoom) - (mouseX / newZoom),
        y: prev.y + (mouseY / prev.zoom) - (mouseY / newZoom)
      }));
    } else {
      setCamera(prev => ({
        ...prev,
        x: prev.x + e.deltaX / prev.zoom,
        y: prev.y + e.deltaY / prev.zoom
      }));
    }
  };

  const handleMouseDown = (e) => {
    if (e.target !== canvasRef.current) return;
    setIsPanning(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setCamera(prev => ({
      ...prev,
      x: prev.x - dx / prev.zoom,
      y: prev.y - dy / prev.zoom
    }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = (e) => {
    if (!isPanning) return;
    setIsPanning(false);
    const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);
    if (dist < 5) {
      const rect = canvasRef.current.getBoundingClientRect();
      const worldX = camera.x + (e.clientX - rect.left) / camera.zoom - 120;
      const worldY = camera.y + (e.clientY - rect.top) / camera.zoom - 20;
      createNote(worldX, worldY);
    }
  };

  const centerOnTodo = (todo) => {
    const rect = canvasRef.current.getBoundingClientRect();
    setCamera({
      x: todo.x - (rect.width / 2) / camera.zoom + 120,
      y: todo.y - (rect.height / 2) / camera.zoom + 40,
      zoom: camera.zoom
    });
    setFocusedId(todo.id);
  };

  const updateTodoText = (id, text) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, text } : t));
  };

  const toggleComplete = (id) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTodo = (id) => {
    setTodos(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className={`app-container ${showSidebar ? '' : 'sidebar-hidden'}`}>
      <aside className="sidebar">
        <div className="sidebar-header">Notes</div>
        <div className="sidebar-list">
          {todos.map(todo => (
            <SidebarItem
              key={todo.id}
              todo={todo}
              active={todo.id === focusedId}
              onClick={centerOnTodo}
              onDelete={deleteTodo}
            />
          ))}
          {todos.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              No notes yet
            </div>
          )}
        </div>
      </aside>

      <main className="main-area">
        <header className="toolbar">
          <button
            className={`toolbar-btn ${!showSidebar ? 'active' : ''}`}
            onClick={() => setShowSidebar(!showSidebar)}
            title={showSidebar ? "Hide Sidebar" : "Show Sidebar"}
            style={{ marginRight: 'auto' }}
          >
            <PanelLeft size={20} />
          </button>
          <button className="toolbar-btn" onClick={() => createNote()} title="New Item">
            <Edit size={20} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
            <button className="toolbar-btn" onClick={() => setCamera(prev => ({ ...prev, zoom: Math.min(prev.zoom * 1.2, 5) }))}>
              <ZoomIn size={18} />
            </button>
            <button className="toolbar-btn" onClick={() => setCamera(prev => ({ ...prev, zoom: Math.max(prev.zoom / 1.2, 0.1) }))}>
              <ZoomOut size={18} />
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: 40, textAlign: 'center' }}>
              {Math.round(camera.zoom * 100)}%
            </span>
          </div>
        </header>

        <div
          className="canvas-container"
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setIsPanning(false)}
          style={{
            cursor: isPanning ? 'grabbing' : 'grab',
            backgroundImage: `radial-gradient(var(--notebook-dot) 1px, transparent 1px)`,
            backgroundPosition: `${-camera.x * camera.zoom}px ${-camera.y * camera.zoom}px`,
            backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`
          }}
        >
          <motion.div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              transformOrigin: '0 0'
            }}
            animate={{
              x: -camera.x * camera.zoom,
              y: -camera.y * camera.zoom,
              scale: camera.zoom
            }}
            transition={{ duration: 0 }}
          >
            <AnimatePresence>
              {todos.map(todo => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  isFocused={todo.id === focusedId}
                  onUpdate={updateTodoText}
                  onToggle={toggleComplete}
                  onDelete={deleteTodo}
                  onFocus={setFocusedId}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default App;

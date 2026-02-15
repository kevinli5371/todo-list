import React, { useState, useEffect, useRef } from 'react';
import { LayoutGrid, List, Check, Trash2, Plus, ZoomIn, ZoomOut, GripVertical } from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';

const fadeTransition = { duration: 0.2, ease: [0.4, 0, 0.2, 1] };

// Helper Component for Individual Todo Items to handle focus and drag
const TodoItem = ({ todo, camera, isFocused, onUpdate, onToggle, onDelete, onFocus, onMove }) => {
  const inputRef = useRef(null);
  const dragControls = useDragControls();
  const dragStartPos = useRef({ x: 0, y: 0, worldX: 0, worldY: 0 });

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
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        scale: isFocused ? 1.02 : 1,
        x: 0,
        y: 0
      }}
      whileHover={{ scale: isFocused ? 1.02 : 1.01 }}
      exit={{ opacity: 0 }}
      transition={{
        opacity: { duration: 0.2 },
        scale: { duration: 0.2 },
        x: { duration: 0 },
        y: { duration: 0 }
      }}
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
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div
          style={{ cursor: 'default', padding: '4px 0', opacity: 0.3, transition: 'opacity 0.2s', display: 'flex' }}
        >
          <GripVertical size={16} />
        </div>
        <div
          className={`checkbox ${todo.completed ? 'checked' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(todo.id);
          }}
        >
          {todo.completed && <Check size={12} color="white" />}
        </div>
        <input
          ref={inputRef}
          className={`todo-input ${todo.completed ? 'completed' : ''}`}
          value={todo.text}
          onChange={(e) => onUpdate(todo.id, e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          placeholder="Write something..."
        />
        <button
          className="delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(todo.id);
          }}
        >
          <Trash2 size={14} />
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
  const [view, setView] = useState('canvas');
  const [focusedId, setFocusedId] = useState(null);
  const canvasRef = useRef(null);

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    localStorage.setItem('spatial-todos', JSON.stringify(todos));
  }, [todos]);

  // Handle keydown for "Type-to-Create"
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || view !== 'canvas') return;

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const id = Date.now();
        const worldX = camera.x + (window.innerWidth / 2) / camera.zoom - 120; // Center offset
        const worldY = camera.y + (window.innerHeight / 2) / camera.zoom - 20;

        const centerTodo = {
          id,
          text: e.key,
          x: worldX,
          y: worldY,
          completed: false,
          timestamp: new Date().toISOString()
        };
        setTodos(prev => [...prev, centerTodo]);
        setFocusedId(id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [camera, view]);

  const handleWheel = (e) => {
    if (view !== 'canvas') return;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY;
      const factor = Math.pow(1.2, delta / 100);
      const newZoom = Math.min(Math.max(camera.zoom * factor, 0.1), 5);

      const mouseX = e.clientX;
      const mouseY = e.clientY;

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

    // If mouse moved less than 5px, treat as a click
    const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);
    if (dist < 5) {
      const worldX = camera.x + e.clientX / camera.zoom - 120; // Correct for card width
      const worldY = camera.y + e.clientY / camera.zoom - 20;

      const newTodo = {
        id: Date.now(),
        text: '',
        x: worldX,
        y: worldY,
        completed: false,
        timestamp: new Date().toISOString()
      };

      setTodos(prev => [...prev, newTodo]);
      setFocusedId(newTodo.id);
    }
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

  const moveTodo = (id, x, y) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, x, y } : t));
  };

  return (
    <div style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <div className="nav-bar">
        <button className={`nav-btn ${view === 'canvas' ? 'active' : ''}`} onClick={() => setView('canvas')}>
          <LayoutGrid size={18} /> Canvas
        </button>
        <button className={`nav-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
          <List size={18} /> List
        </button>
        {view === 'canvas' && (
          <div style={{ display: 'flex', borderLeft: '1px solid var(--border-color)', marginLeft: 8, paddingLeft: 8, gap: 4 }}>
            <button className="nav-btn" onClick={() => setCamera(prev => ({ ...prev, zoom: Math.min(prev.zoom * 1.2, 5) }))}><ZoomIn size={16} /></button>
            <button className="nav-btn" onClick={() => setCamera(prev => ({ ...prev, zoom: Math.max(prev.zoom / 1.2, 0.1) }))}><ZoomOut size={16} /></button>
            <span style={{ fontSize: '0.8rem', color: '#64748b', alignSelf: 'center', minWidth: 40, textAlign: 'center' }}>
              {Math.round(camera.zoom * 100)}%
            </span>
          </div>
        )}
      </div>

      <main style={{ height: '100%', width: '100%' }}>
        {view === 'canvas' ? (
          <div
            className="canvas-container"
            ref={canvasRef}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setIsPanning(false)}
            style={{
              backgroundPosition: `${-camera.x * camera.zoom}px ${-camera.y * camera.zoom}px`,
              backgroundSize: `${40 * camera.zoom}px ${40 * camera.zoom}px`,
              cursor: isPanning ? 'grabbing' : 'grab'
            }}
          >
            {todos.length === 0 && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.15, textAlign: 'center', pointerEvents: 'none' }}>
                <Plus size={48} style={{ marginBottom: 16 }} />
                <h2 style={{ fontWeight: 400, fontSize: '1.2rem' }}>Start typing to create a note</h2>
                <p style={{ marginTop: 4, fontSize: '0.8rem' }}>Scroll or Drag empty space to pan, Cmd + Scroll to zoom</p>
              </div>
            )}
            <motion.div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '1000%', // huge workspace
                height: '1000%',
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
                    camera={camera}
                    isFocused={todo.id === focusedId}
                    onUpdate={updateTodoText}
                    onToggle={toggleComplete}
                    onDelete={deleteTodo}
                    onFocus={setFocusedId}
                    onMove={moveTodo}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </div>
        ) : (
          <div className="list-view">
            <h1 style={{ marginBottom: 40, fontWeight: 700, fontSize: '2.5rem' }}>All Tasks</h1>
            {todos.length === 0 && <p style={{ opacity: 0.5, fontSize: '1.2rem' }}>Your workspace is clean.</p>}
            <AnimatePresence>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {todos.map(todo => (
                  <motion.div
                    key={todo.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={fadeTransition}
                    className="list-item"
                  >
                    <div className={`checkbox ${todo.completed ? 'checked' : ''}`} onClick={() => toggleComplete(todo.id)}>
                      {todo.completed && <Check size={12} color="white" />}
                    </div>
                    <span className={`todo-text ${todo.completed ? 'completed' : ''}`} style={{ flex: 1 }}>
                      {todo.text || <em style={{ opacity: 0.3 }}>Empty note</em>}
                    </span>
                    <button className="delete-btn" onClick={() => deleteTodo(todo.id)}>
                      <Trash2 size={18} />
                    </button>
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;

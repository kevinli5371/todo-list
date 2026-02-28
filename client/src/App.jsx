import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LayoutGrid, List, Check, Trash2, Plus, ZoomIn, ZoomOut, GripVertical, Search, Edit, PanelLeft, Calendar, RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClassify } from './hooks/useClassify';

const REPEAT_OPTIONS = [null, 'daily', 'weekly', 'monthly', 'yearly'];
const REPEAT_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

const CATEGORY_ORDER = ['Work', 'Personal', 'Health', 'Finance', 'Learning', 'Home', 'Social', 'Other'];
const CATEGORY_COLORS = {
  Work:     { bg: '#dbeafe', text: '#1d4ed8', dot: '#3b82f6' },
  Personal: { bg: '#ede9fe', text: '#6d28d9', dot: '#8b5cf6' },
  Health:   { bg: '#dcfce7', text: '#15803d', dot: '#22c55e' },
  Finance:  { bg: '#fef3c7', text: '#b45309', dot: '#f59e0b' },
  Learning: { bg: '#ccfbf1', text: '#0f766e', dot: '#14b8a6' },
  Home:     { bg: '#ffedd5', text: '#c2410c', dot: '#f97316' },
  Social:   { bg: '#fce7f3', text: '#be185d', dot: '#ec4899' },
  Other:    { bg: '#f3f4f6', text: '#4b5563', dot: '#9ca3af' },
};

const formatDueDate = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tmrw = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const isTomorrow = d.toDateString() === tmrw.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today · ${timeStr}`;
  if (isTomorrow) return `Tomorrow · ${timeStr}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + timeStr;
};

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa'];

const DatePickerPopup = ({ value, onChange, onClear }) => {
  const init = value ? new Date(value) : new Date();
  const [viewYear, setViewYear] = useState(init.getFullYear());
  const [viewMonth, setViewMonth] = useState(init.getMonth());
  const [timeH, setTimeH] = useState(value ? new Date(value).getHours() : 9);
  const [timeM, setTimeM] = useState(value ? new Date(value).getMinutes() : 0);

  const selected = value ? new Date(value) : null;
  const today = new Date();

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = Array(firstDow).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  const isSelected = (day) =>
    selected && selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === day;
  const isToday = (day) =>
    today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;

  const pickDay = (day) => {
    const d = new Date(viewYear, viewMonth, day, timeH, timeM);
    onChange(d.toISOString());
  };

  const applyTime = (h, m) => {
    if (!selected) return;
    const d = new Date(selected);
    d.setHours(h, m);
    onChange(d.toISOString());
  };

  const prevMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = (e) => {
    e.stopPropagation();
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const ampm = timeH >= 12 ? 'PM' : 'AM';
  const displayH = timeH % 12 === 0 ? 12 : timeH % 12;

  return (
    <div className="dp-popup" onMouseDown={(e) => e.stopPropagation()}>
      <div className="dp-header">
        <button className="dp-nav" onClick={prevMonth}>‹</button>
        <span className="dp-month-year">{MONTH_NAMES[viewMonth]} {viewYear}</span>
        <button className="dp-nav" onClick={nextMonth}>›</button>
      </div>

      <div className="dp-grid">
        {DAY_NAMES.map(d => <div key={d} className="dp-dow">{d}</div>)}
        {cells.map((day, i) => (
          <div
            key={i}
            className={[
              'dp-cell',
              day ? 'dp-day' : '',
              day && isSelected(day) ? 'dp-selected' : '',
              day && isToday(day) && !isSelected(day) ? 'dp-today' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => day && pickDay(day)}
          >
            {day ?? ''}
          </div>
        ))}
      </div>

      <div className="dp-time-row">
        <span className="dp-time-label">Time</span>
        <div className="dp-time-controls">
          <input
            className="dp-time-input"
            type="number"
            min={1} max={12}
            value={displayH}
            onChange={(e) => {
              let h = Math.max(1, Math.min(12, parseInt(e.target.value) || 1));
              const h24 = ampm === 'PM' ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
              setTimeH(h24);
              applyTime(h24, timeM);
            }}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <span className="dp-time-sep">:</span>
          <input
            className="dp-time-input"
            type="number"
            min={0} max={59}
            value={String(timeM).padStart(2, '0')}
            onChange={(e) => {
              const m = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
              setTimeM(m);
              applyTime(timeH, m);
            }}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <button
            className="dp-ampm"
            onClick={(e) => {
              e.stopPropagation();
              const newH = timeH >= 12 ? timeH - 12 : timeH + 12;
              setTimeH(newH);
              applyTime(newH, timeM);
            }}
          >
            {ampm}
          </button>
        </div>
      </div>

      {value && (
        <div className="dp-actions">
          <button className="dp-clear" onClick={(e) => { e.stopPropagation(); onClear(); }}>
            Clear date
          </button>
        </div>
      )}
    </div>
  );
};

const SidebarItem = ({ todo, active, onClick, onDelete, classification }) => {
  const title = todo.text.split('\n')[0] || 'New Item';
  const rest = todo.text.split('\n').slice(1).join(' ') || 'No additional text';
  const date = new Date(todo.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const colors = classification ? CATEGORY_COLORS[classification.category] : null;

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
            {classification && (
              <span className="sidebar-importance" style={{ color: colors?.text }}>
                #{classification.importance}
              </span>
            )}
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
const TodoItem = ({ todo, isFocused, onUpdate, onToggle, onDelete, onFocus, onPositionChange, cameraRef, onUpdateDueDate, onUpdateRepeat, classification }) => {
  const inputRef = useRef(null);
  const itemRef = useRef(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const isOverdue = todo.dueDate && new Date(todo.dueDate) < new Date() && !todo.completed;
  const isSoon = todo.dueDate && !isOverdue && !todo.completed && (new Date(todo.dueDate) - new Date()) < 86400000;
  const dateClass = isOverdue ? 'overdue' : isSoon ? 'soon' : todo.dueDate ? 'active' : '';
  const catColors = classification ? CATEGORY_COLORS[classification.category] : null;

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

  const handleDragHandleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onFocus(todo.id);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startTodoX = todo.x;
    const startTodoY = todo.y;
    // Capture zoom at drag start — doesn't change during drag
    const zoom = cameraRef.current.zoom;

    if (itemRef.current) {
      itemRef.current.style.zIndex = '100';
    }
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const onMove = (moveEvent) => {
      // Convert screen-space delta to world-space by dividing by zoom
      const dx = (moveEvent.clientX - startClientX) / zoom;
      const dy = (moveEvent.clientY - startClientY) / zoom;
      // Update DOM directly — no React re-render, zero lag
      if (itemRef.current) {
        itemRef.current.style.left = `${startTodoX + dx}px`;
        itemRef.current.style.top = `${startTodoY + dy}px`;
      }
    };

    const onUp = (upEvent) => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (itemRef.current) {
        itemRef.current.style.zIndex = '';
      }
      const dx = (upEvent.clientX - startClientX) / zoom;
      const dy = (upEvent.clientY - startClientY) / zoom;
      // Sync final position to React state — matches DOM exactly, no visual snap
      onPositionChange(todo.id, startTodoX + dx, startTodoY + dy);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <motion.div
      ref={itemRef}
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
      onMouseDown={(e) => { e.stopPropagation(); onFocus(todo.id); }}
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
            style={{ resize: 'none', overflow: 'hidden', cursor: 'text' }}
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
        <div
          className="drag-handle"
          onMouseDown={handleDragHandleMouseDown}
        >
          {[0, 1, 2].map(row => (
            [0, 1].map(col => (
              <div key={`${row}-${col}`} className="drag-dot" />
            ))
          ))}
        </div>
      </div>

      {/* Date / repeat footer */}
      <div className={`todo-footer ${(todo.dueDate || todo.repeat || showDatePicker || classification) ? 'has-data' : ''}`}>
        {classification && (
          <span
            className="category-badge"
            style={{ background: catColors?.bg, color: catColors?.text }}
            title={`Importance: ${classification.importance}/10 — ${classification.reasoning}`}
          >
            <span className="category-dot" style={{ background: catColors?.dot }} />
            {classification.category}
            <span className="category-importance">{classification.importance}</span>
          </span>
        )}
        <button
          className={`todo-meta-btn ${dateClass}`}
          onClick={(e) => { e.stopPropagation(); setShowDatePicker(p => !p); }}
          onMouseDown={(e) => e.stopPropagation()}
          title={todo.dueDate ? 'Edit date' : 'Add date'}
        >
          <Calendar size={12} />
          <span>{todo.dueDate ? formatDueDate(todo.dueDate) : 'Date'}</span>
        </button>
        <button
          className={`todo-meta-btn ${todo.repeat ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            const idx = REPEAT_OPTIONS.indexOf(todo.repeat ?? null);
            onUpdateRepeat(todo.id, REPEAT_OPTIONS[(idx + 1) % REPEAT_OPTIONS.length]);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Set repeat"
        >
          <RefreshCw size={12} />
          <span>{todo.repeat ? REPEAT_LABELS[todo.repeat] : 'Repeat'}</span>
        </button>
      </div>

      {/* Custom date/time picker */}
      {showDatePicker && (
        <DatePickerPopup
          value={todo.dueDate}
          onChange={(iso) => onUpdateDueDate(todo.id, iso)}
          onClear={() => { onUpdateDueDate(todo.id, null); setShowDatePicker(false); }}
        />
      )}
    </motion.div>
  );
};

const App = () => {
  const [todos, setTodos] = useState(() => {
    const saved = localStorage.getItem('spatial-todos');
    return saved ? JSON.parse(saved) : [];
  });

  const { classifications, isLoading: classifyLoading } = useClassify(todos);

  // Group todos by category for the sidebar (falls back to flat list when server is off)
  const groupedSidebar = useMemo(() => {
    if (classifications.size === 0) return null;
    const groups = {};
    todos.forEach((todo) => {
      const cat = classifications.get(todo.id)?.category ?? 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(todo);
    });
    // Sort within each group by importance descending
    Object.values(groups).forEach((g) =>
      g.sort((a, b) => (classifications.get(b.id)?.importance ?? 0) - (classifications.get(a.id)?.importance ?? 0))
    );
    return groups;
  }, [todos, classifications]);

  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const cameraRef = useRef(camera);
  const [focusedId, setFocusedId] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const canvasRef = useRef(null);

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    localStorage.setItem('spatial-todos', JSON.stringify(todos));
  }, [todos]);

  const updateTodoPosition = (id, x, y) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, x, y } : t));
  };

  const updateDueDate = (id, dueDate) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, dueDate } : t));
  };

  const updateRepeat = (id, repeat) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, repeat } : t));
  };

  const createNote = (x, y, initialText = '') => {
    const sidebarWidth = showSidebar ? 280 : 0;
    const id = Date.now();
    const newTodo = {
      id,
      text: initialText,
      x: x ?? (camera.x + ((window.innerWidth - sidebarWidth) / 2) / camera.zoom - 120),
      y: y ?? (camera.y + (window.innerHeight / 2) / camera.zoom - 20),
      completed: false,
      timestamp: new Date().toISOString()
    };
    setTodos(prev => [newTodo, ...prev]);
    setFocusedId(id);
    return id;
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Ignore if user is already typing in an input or textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Ignore modifier keys
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Only trigger for single printable characters
      if (e.key.length === 1) {
        e.preventDefault();
        createNote(null, null, e.key);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [camera, showSidebar]); // Re-bind if camera/sidebar change to get correct center position

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
        <div className="sidebar-header">
          Notes
          {classifyLoading && <span className="classify-spinner" title="Classifying…" />}
        </div>
        <div className="sidebar-list">
          {groupedSidebar
            ? CATEGORY_ORDER.filter((cat) => groupedSidebar[cat]).map((cat) => (
                <div key={cat} className="sidebar-group">
                  <div className="sidebar-group-header">
                    <span className="sidebar-group-dot" style={{ background: CATEGORY_COLORS[cat].dot }} />
                    {cat}
                    <span className="sidebar-group-count">{groupedSidebar[cat].length}</span>
                  </div>
                  {groupedSidebar[cat].map((todo) => (
                    <SidebarItem
                      key={todo.id}
                      todo={todo}
                      active={todo.id === focusedId}
                      onClick={centerOnTodo}
                      onDelete={deleteTodo}
                      classification={classifications.get(todo.id)}
                    />
                  ))}
                </div>
              ))
            : todos.map((todo) => (
                <SidebarItem
                  key={todo.id}
                  todo={todo}
                  active={todo.id === focusedId}
                  onClick={centerOnTodo}
                  onDelete={deleteTodo}
                  classification={classifications.get(todo.id)}
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
                  onPositionChange={updateTodoPosition}
                  cameraRef={cameraRef}
                  onUpdateDueDate={updateDueDate}
                  onUpdateRepeat={updateRepeat}
                  classification={classifications.get(todo.id)}
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

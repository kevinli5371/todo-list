import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Check, Trash2, ZoomIn, ZoomOut, Edit, PanelLeft, Calendar, RefreshCw, Users, LogOut, Copy, Plus, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  fetchMe,
  updateMe,
  pairWithCode,
  fetchTodos,
  createTodoRemote,
  patchTodoRemote,
  deleteTodoRemote,
  isOnline,
  flushOfflineQueue,
} from './api';
import { supabase, isSupabaseConfigured } from './supabaseClient';

// ── Helpers ────────────────────────────────────────────────

const TEXTAREA_FIELD_SIZING =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content');

const REPEAT_OPTIONS = [null, 'daily', 'weekly', 'monthly', 'yearly'];
const REPEAT_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

const IS_TOUCH_DEVICE = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
// Computed once at load; resize/orientation changes will not update this.
const IS_MOBILE = typeof window !== 'undefined' && window.innerWidth <= 768;

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

// ── Service Worker Registration ────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// ── Toast System ───────────────────────────────────────────

let _toastId = 0;
const _toastListeners = new Set();
let _toasts = [];

function addToast(message, options = {}) {
  const id = ++_toastId;
  const toast = { id, message, ...options };
  _toasts = [..._toasts, toast];
  _toastListeners.forEach((fn) => fn(_toasts));
  if (!options.persist) {
    setTimeout(() => removeToast(id), options.duration || 4000);
  }
  return id;
}

function removeToast(id) {
  _toasts = _toasts.filter((t) => t.id !== id);
  _toastListeners.forEach((fn) => fn(_toasts));
}

function useToasts() {
  const [toasts, setToasts] = useState(_toasts);
  useEffect(() => {
    _toastListeners.add(setToasts);
    return () => _toastListeners.delete(setToasts);
  }, []);
  return toasts;
}

const ToastContainer = () => {
  const toasts = useToasts();
  return (
    <div className="toast-container">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className="toast"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <span>{t.message}</span>
            {t.onUndo && (
              <button className="toast-undo" onClick={() => { t.onUndo(); removeToast(t.id); }}>
                Undo
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// ── DatePickerPopup ────────────────────────────────────────

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

  const stopTouch = (e) => e.stopPropagation();

  return (
    <div className="dp-popup" onMouseDown={(e) => e.stopPropagation()} onTouchStart={stopTouch}>
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
            onTouchStart={stopTouch}
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
            onTouchStart={stopTouch}
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

// ── SidebarItem ────────────────────────────────────────────

const SidebarItem = ({ todo, active, onClick, onDelete, readOnly, isPartner }) => {
  const title = todo.text.split('\n')[0] || 'New Item';
  const rest = todo.text.split('\n').slice(1).join(' ') || 'No additional text';
  const date = new Date(todo.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <div
      className={`sidebar-item ${active ? 'active' : ''} ${isPartner ? 'sidebar-item--partner' : ''}`}
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
        {!readOnly && (
          <button
            className="sidebar-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(todo.id);
            }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

// ── TodoItem ───────────────────────────────────────────────

const snappyTransition = { duration: 0.15, ease: [0.4, 0, 1, 1] };
const TODO_CARD_CHROME_W = 132;

const TodoItem = ({
  todo,
  isFocused,
  onUpdate,
  onToggle,
  onDelete,
  onFocus,
  onPositionChange,
  cameraRef,
  onUpdateDueDate,
  onUpdateRepeat,
  readOnly,
  isPartner,
}) => {
  const inputRef = useRef(null);
  const itemRef = useRef(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isExpanded = isFocused && !readOnly;

  const isOverdue = todo.dueDate && new Date(todo.dueDate) < new Date() && !todo.completed;
  const isSoon = todo.dueDate && !isOverdue && !todo.completed && (new Date(todo.dueDate) - new Date()) < 86400000;
  const dateClass = isOverdue ? 'overdue' : isSoon ? 'soon' : todo.dueDate ? 'active' : '';

  useEffect(() => {
    if (isFocused && !readOnly && inputRef.current) {
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const length = inputRef.current.value.length;
          inputRef.current.setSelectionRange(length, length);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isFocused, readOnly]);

  useLayoutEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    if (!isExpanded) {
      ta.style.height = '';
      return;
    }
    if (TEXTAREA_FIELD_SIZING) {
      ta.style.height = '';
      return;
    }
    ta.style.height = '1.5em';
    const oneLinePx = ta.offsetHeight;
    if (ta.scrollHeight > oneLinePx + 1) {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    }
  }, [isExpanded]);

  useLayoutEffect(() => {
    const ta = inputRef.current;
    const box = itemRef.current;
    if (!ta || !box) return;
    const measure = () => {
      const style = getComputedStyle(ta);
      const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) return;
      ctx.font = font;
      const lines = (todo.text || '').split('\n');
      const sample = lines.length && lines[0].length ? lines[0] : 'New Item';
      let textW = ctx.measureText(sample).width;
      if (isExpanded && lines.length > 1) {
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].length ? lines[i] : ' ';
          textW = Math.max(textW, ctx.measureText(line).width);
        }
      }
      const maxW = Math.max(240, Math.floor(window.innerWidth * 0.9) - 48);
      const w = Math.min(maxW, Math.max(240, Math.ceil(textW) + TODO_CARD_CHROME_W));
      box.style.width = `${w}px`;
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [todo.text, isExpanded]);

  // ── Drag (mouse) ──
  const handleDragHandleMouseDown = (e) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    onFocus(todo.id);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startTodoX = todo.x;
    const startTodoY = todo.y;
    const zoom = cameraRef.current.zoom;

    if (itemRef.current) itemRef.current.style.zIndex = '100';
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const onMove = (moveEvent) => {
      const dx = (moveEvent.clientX - startClientX) / zoom;
      const dy = (moveEvent.clientY - startClientY) / zoom;
      if (itemRef.current) {
        itemRef.current.style.left = `${startTodoX + dx}px`;
        itemRef.current.style.top = `${startTodoY + dy}px`;
      }
    };

    const onUp = (upEvent) => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (itemRef.current) itemRef.current.style.zIndex = '';
      const dx = (upEvent.clientX - startClientX) / zoom;
      const dy = (upEvent.clientY - startClientY) / zoom;
      onPositionChange(todo.id, startTodoX + dx, startTodoY + dy);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Drag (touch) ──
  const handleDragHandleTouchStart = (e) => {
    if (readOnly) return;
    e.stopPropagation();
    const touch = e.touches[0];
    onFocus(todo.id);

    const startX = touch.clientX;
    const startY = touch.clientY;
    const startTodoX = todo.x;
    const startTodoY = todo.y;
    const zoom = cameraRef.current.zoom;

    if (itemRef.current) itemRef.current.style.zIndex = '100';

    const onMove = (moveEvent) => {
      moveEvent.preventDefault();
      const t = moveEvent.touches[0];
      const dx = (t.clientX - startX) / zoom;
      const dy = (t.clientY - startY) / zoom;
      if (itemRef.current) {
        itemRef.current.style.left = `${startTodoX + dx}px`;
        itemRef.current.style.top = `${startTodoY + dy}px`;
      }
    };

    const onEnd = (endEvent) => {
      if (itemRef.current) itemRef.current.style.zIndex = '';
      const t = endEvent.changedTouches[0];
      const dx = (t.clientX - startX) / zoom;
      const dy = (t.clientY - startY) / zoom;
      onPositionChange(todo.id, startTodoX + dx, startTodoY + dy);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  return (
    <motion.div
      ref={itemRef}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{
        opacity: 1,
        scale: isFocused && !readOnly ? 1.01 : 1,
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={snappyTransition}
      className={`todo-item-canvas ${isExpanded ? 'is-expanded' : ''} ${readOnly ? 'todo-readonly' : ''} ${isPartner ? 'todo-partner' : ''}`}
      style={{
        position: 'absolute',
        left: todo.x,
        top: todo.y,
        pointerEvents: 'auto',
        zIndex: isFocused ? 10 : 1,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        if (!readOnly) onFocus(todo.id);
      }}
      onTouchStart={(e) => {
        e.stopPropagation();
        if (!readOnly) onFocus(todo.id);
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div
          className={`checkbox ${todo.completed ? 'checked' : ''} ${readOnly ? 'checkbox-readonly' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!readOnly) onToggle(todo.id);
          }}
          style={{ marginTop: 4 }}
        >
          {todo.completed && <Check size={14} color="white" />}
        </div>
        <div style={{ flex: 1 }}>
          <textarea
            ref={inputRef}
            readOnly={readOnly}
            className={`todo-input ${todo.completed ? 'completed' : ''}`}
            value={todo.text}
            onChange={(e) => onUpdate(todo.id, e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            placeholder="New Item"
            rows={1}
            style={{ resize: 'none', overflow: 'hidden', cursor: readOnly ? 'default' : 'text' }}
            onInput={(e) => {
              if (TEXTAREA_FIELD_SIZING) return;
              if (!itemRef.current?.classList.contains('is-expanded')) return;
              const ta = e.target;
              ta.style.height = 'auto';
              ta.style.height = ta.scrollHeight + 'px';
            }}
          />
        </div>
        {!readOnly && (
          <button
            className="delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(todo.id);
            }}
          >
            <Trash2 size={16} />
          </button>
        )}
        {!readOnly && (
          <div
            className="drag-handle"
            onMouseDown={handleDragHandleMouseDown}
            onTouchStart={handleDragHandleTouchStart}
          >
            {[0, 1, 2].map(row => (
              [0, 1].map(col => (
                <div key={`${row}-${col}`} className="drag-dot" />
              ))
            ))}
          </div>
        )}
      </div>

      {readOnly && (todo.dueDate || todo.repeat) && (
        <div className="todo-readonly-meta">
          {todo.dueDate && <span>{formatDueDate(todo.dueDate)}</span>}
          {todo.dueDate && todo.repeat && <span> · </span>}
          {todo.repeat && <span>{REPEAT_LABELS[todo.repeat]}</span>}
        </div>
      )}

      {!readOnly && (
      <div
        className={`todo-footer-wrapper ${(todo.dueDate || todo.repeat || showDatePicker || isFocused) ? 'is-open' : ''}`}
      >
        <div className="todo-footer">
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
        {showDatePicker && (
          <div onMouseDown={(e) => e.stopPropagation()}>
            <DatePickerPopup
              value={todo.dueDate}
              onChange={(iso) => onUpdateDueDate(todo.id, iso)}
              onClear={() => { onUpdateDueDate(todo.id, null); setShowDatePicker(false); }}
            />
          </div>
        )}
      </div>
      )}
    </motion.div>
  );
};

// ── AuthScreen ─────────────────────────────────────────────

const AuthScreen = () => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [invite, setInvite] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setErr('Check your email to confirm your account, then log in.');
          return;
        }
        if (invite.trim()) {
          try {
            await pairWithCode(invite.trim());
          } catch (pe) {
            throw new Error(pe.message || 'Signed up but pairing failed — use Pair in the sidebar after you log in.');
          }
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (er) {
      setErr(er.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-overlay">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="auth-title">Shared todo list</h1>
        <p className="auth-subtitle">Sign in to your canvas. Pair with one friend using an invite code.</p>
        {!isSupabaseConfigured && (
          <div className="auth-error" style={{ marginBottom: 16 }}>
            Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{' '}
            <code>client/.env</code>, then stop and restart <code>npm run dev</code> (Vite only reads env at startup).
          </div>
        )}
        <div className="auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Log in</button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Create account</button>
        </div>
        <label className="auth-label">
          Email
          <input className="auth-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="auth-label">
          Password (min 8 characters)
          <input className="auth-input" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </label>
        {mode === 'register' && (
          <label className="auth-label">
            Friend&apos;s invite code (optional)
            <input className="auth-input" type="text" placeholder="e.g. A1B2C3D4" value={invite} onChange={(e) => setInvite(e.target.value)} autoComplete="off" />
          </label>
        )}
        {err && <div className="auth-error">{err}</div>}
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Log in'}
        </button>
      </form>
    </div>
  );
};

// ── Main App ───────────────────────────────────────────────

const App = () => {
  const [me, setMe] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [todos, setTodos] = useState([]);
  const [listScope, setListScope] = useState('both');
  const [pairInput, setPairInput] = useState('');
  const [pairErr, setPairErr] = useState('');
  const [usernameEditing, setUsernameEditing] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameErr, setUsernameErr] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);

  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const cameraRef = useRef(camera);
  const [focusedId, setFocusedId] = useState(null);
  const [showSidebar, setShowSidebar] = useState(!IS_MOBILE);
  const canvasRef = useRef(null);
  const textTimers = useRef({});

  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const isCreatingRef = useRef(false);
  const deletingIdsRef = useRef(new Set());

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Undo delete stack
  const undoStackRef = useRef([]);

  // Touch state for canvas
  const touchStateRef = useRef({ type: null, startTouches: null, startCamera: null });

  // Online/offline state
  const [online, setOnline] = useState(isOnline());

  const cameraStorageKey = me ? `spatial-camera-${me.id}` : null;

  // ── Online/offline handling ──
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      addToast('Back online');
      flushOfflineQueue().catch(() => {});
    };
    const goOffline = () => {
      setOnline(false);
      addToast('You are offline — changes will sync when reconnected');
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // ── Auth init ──
  useEffect(() => {
    let cancelled = false;
    let initDone = false;
    let subscription = { unsubscribe() {} };

    const markReady = (profile) => {
      if (initDone || cancelled) return;
      initDone = true;
      setMe(profile ?? null);
      setAuthReady(true);
    };

    const fallback = setTimeout(() => markReady(null), 3000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(fallback);
      if (cancelled) return;
      if (session?.access_token) {
        try {
          const profile = await fetchMe();
          markReady(profile);
        } catch (e) {
          console.warn('fetchMe failed on init:', e?.message || e);
          markReady(null);
        }
      } else {
        markReady(null);
      }
    }).catch(() => {
      clearTimeout(fallback);
      markReady(null);
    });

    try {
      const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (cancelled || !initDone) return;
        if (session?.access_token) {
          try {
            const profile = await fetchMe();
            if (!cancelled) setMe(profile);
          } catch {
            if (!cancelled) setMe(null);
          }
        } else {
          if (!cancelled) setMe(null);
        }
      });
      subscription = data.subscription;
    } catch (e) {
      console.error('onAuthStateChange failed:', e);
    }

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, []);

  // ── Camera persistence ──
  useEffect(() => {
    if (!cameraStorageKey) return;
    try {
      const raw = localStorage.getItem(cameraStorageKey);
      if (raw) {
        const c = JSON.parse(raw);
        if (typeof c?.x === 'number' && typeof c?.y === 'number' && typeof c?.zoom === 'number') {
          setCamera(c);
        }
      }
    } catch (_) { /* ignore */ }
  }, [cameraStorageKey]);

  useEffect(() => {
    if (!cameraStorageKey) return;
    localStorage.setItem(cameraStorageKey, JSON.stringify(camera));
  }, [camera, cameraStorageKey]);

  useEffect(() => {
    if (me && !me.partner && listScope !== 'mine') {
      setListScope('mine');
    }
  }, [me, listScope]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const effectiveScope = me?.partner ? listScope : 'mine';
  const readOnlyCanvas = effectiveScope === 'partner';
  const todoReadOnly = (todo) =>
    effectiveScope === 'partner' || (effectiveScope === 'both' && todo.owner_id !== me?.id);

  // ── Fetch todos ──
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchTodos(effectiveScope);
        if (!cancelled) setTodos((prev) => data.map((t) => {
          if (textTimers.current[t.id]) {
            const current = prev.find((p) => p.id === t.id);
            return current ? { ...t, text: current.text } : t;
          }
          return t;
        }));
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, [me, effectiveScope]);

  // ── Realtime subscriptions ──
  useEffect(() => {
    if (!me) return;

    const callback = (payload) => {
      // Partner change notifications
      if (payload?.new?.owner_id && payload.new.owner_id !== me.id && me.partner) {
        const event = payload.eventType;
        if (event === 'INSERT') {
          addToast(`${me.partner.username || me.partner.email.split('@')[0]} added a new item`);
        } else if (event === 'UPDATE' && payload.old?.completed !== payload.new?.completed && payload.new.completed) {
          const text = (payload.new.text || '').split('\n')[0] || 'an item';
          addToast(`${me.partner.username || me.partner.email.split('@')[0]} completed "${text.slice(0, 30)}"`);
        }
      }

      fetchTodos(effectiveScope)
        .then((data) => setTodos((prev) => {
          return data
            .filter((t) => !deletingIdsRef.current.has(t.id))
            .map((t) => {
              if (textTimers.current[t.id]) {
                const current = prev.find((p) => p.id === t.id);
                return current ? { ...t, text: current.text } : t;
              }
              return t;
            });
        }))
        .catch(() => {});
    };

    const channels = [];
    if (effectiveScope === 'both' && me.partner) {
      channels.push(
        supabase.channel(`todos:mine:${me.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `owner_id=eq.${me.id}` }, callback)
          .subscribe()
      );
      channels.push(
        supabase.channel(`todos:partner:${me.partner.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `owner_id=eq.${me.partner.id}` }, callback)
          .subscribe()
      );
    } else {
      const ownerId = effectiveScope === 'partner' ? me.partner?.id : me.id;
      if (!ownerId) return;
      channels.push(
        supabase.channel(`todos:owner:${ownerId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `owner_id=eq.${ownerId}` }, callback)
          .subscribe()
      );
    }

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch));
    };
  }, [me, effectiveScope]);

  // ── Create note ──
  const createNote = useCallback(async (x, y, initialText = '') => {
    if (!me || readOnlyCanvas || isCreatingRef.current) return;
    isCreatingRef.current = true;
    const sidebarWidth = showSidebar && !IS_MOBILE ? 280 : 0;
    const worldX = x ?? (camera.x + ((window.innerWidth - sidebarWidth) / 2) / camera.zoom - 120);
    const worldY = y ?? (camera.y + (window.innerHeight / 2) / camera.zoom - 20);
    const payload = {
      text: initialText,
      x: worldX,
      y: worldY,
      completed: false,
      timestamp: new Date().toISOString(),
    };
    try {
      const created = await createTodoRemote(payload);
      if (created) {
        // Online: server returned the real object
        setTodos((prev) => [created, ...prev]);
        setFocusedId(created.id);
      } else {
        // Offline: insert a temporary optimistic todo with a local id
        const localId = `local-${Date.now()}`;
        const optimistic = { ...payload, id: localId, owner_id: me.id };
        setTodos((prev) => [optimistic, ...prev]);
        setFocusedId(localId);
      }
    } catch (e) {
      console.error(e);
      addToast('Failed to create item');
    } finally {
      isCreatingRef.current = false;
    }
  }, [me, readOnlyCanvas, camera, showSidebar]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    if (!me) return;
    const handleGlobalKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Cmd/Ctrl+Z → undo last delete
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        const last = undoStackRef.current.pop();
        if (last) last.restore();
        return;
      }

      // Escape → unfocus / close sidebar on mobile
      if (e.key === 'Escape') {
        if (focusedId) {
          setFocusedId(null);
        } else if (IS_MOBILE && showSidebar) {
          setShowSidebar(false);
        }
        return;
      }

      // N → new item
      if (e.key === 'n' || e.key === 'N') {
        if (!readOnlyCanvas && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          createNote();
          return;
        }
      }

      // Delete/Backspace → delete focused item
      if ((e.key === 'Delete' || e.key === 'Backspace') && focusedId && !readOnlyCanvas) {
        e.preventDefault();
        deleteTodo(focusedId);
        return;
      }

      // Any printable key → create note with that character
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !readOnlyCanvas) {
        e.preventDefault();
        createNote(null, null, e.key);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [me, readOnlyCanvas, createNote, focusedId, showSidebar]);

  // ── Todo mutations ──
  const updateTodoPosition = (id, x, y) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, x, y } : t)));
    if (!readOnlyCanvas) {
      patchTodoRemote(id, { x, y }).catch((err) => console.error(err));
    }
  };

  const updateDueDate = (id, dueDate) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, dueDate } : t)));
    if (!readOnlyCanvas) {
      patchTodoRemote(id, { dueDate }).catch((err) => console.error(err));
    }
  };

  const updateRepeat = (id, repeat) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, repeat } : t)));
    if (!readOnlyCanvas) {
      patchTodoRemote(id, { repeat }).catch((err) => console.error(err));
    }
  };

  const updateTodoText = (id, text) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
    if (readOnlyCanvas) return;
    clearTimeout(textTimers.current[id]);
    textTimers.current[id] = setTimeout(() => {
      patchTodoRemote(id, { text }).catch((err) => console.error(err));
      delete textTimers.current[id];
    }, 450);
  };

  const toggleComplete = (id) => {
    if (readOnlyCanvas) return;
    setTodos((prev) => {
      const t = prev.find((x) => x.id === id);
      if (!t) return prev;
      const completed = !t.completed;
      patchTodoRemote(id, { completed }).catch((err) => console.error(err));
      return prev.map((x) => (x.id === id ? { ...x, completed } : x));
    });
  };

  // ── Delete with undo ──
  const deleteTodo = async (id) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    // Optimistically remove from UI
    deletingIdsRef.current.add(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
    if (focusedId === id) setFocusedId(null);

    // Set up undo — delay the actual server delete
    let undone = false;
    const deleteTimer = setTimeout(async () => {
      if (undone) return;
      try {
        await deleteTodoRemote(id);
      } catch (e) {
        console.error(e);
        // Restore on failure
        deletingIdsRef.current.delete(id);
        try {
          const data = await fetchTodos(effectiveScope);
          setTodos(data.filter((t) => !deletingIdsRef.current.has(t.id)));
        } catch (_) { /* ignore */ }
        return;
      }
      deletingIdsRef.current.delete(id);
    }, 5000);

    const restore = () => {
      undone = true;
      clearTimeout(deleteTimer);
      deletingIdsRef.current.delete(id);
      setTodos((prev) => [todo, ...prev]);
    };

    undoStackRef.current.push({ restore });

    addToast('Item deleted', { duration: 5000, onUndo: restore });
  };

  // ── Pairing ──
  const handlePair = async (e) => {
    e.preventDefault();
    setPairErr('');
    try {
      const profile = await pairWithCode(pairInput.trim());
      setMe(profile);
      setPairInput('');
      addToast('Paired successfully!');
    } catch (er) {
      setPairErr(er.message || 'Could not pair');
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setMe(null);
    setTodos([]);
    setFocusedId(null);
  };

  const copyInvite = () => {
    if (!me?.invite_code) return;
    navigator.clipboard.writeText(me.invite_code).then(() => {
      addToast('Invite code copied!');
    }).catch(() => {});
  };

  // ── Canvas: Mouse events ──
  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY;
      const factor = Math.pow(1.1, delta / 100);
      const newZoom = Math.min(Math.max(camera.zoom * factor, 0.1), 5);

      const sidebarWidth = showSidebar && !IS_MOBILE ? 280 : 0;
      const mouseX = e.clientX - sidebarWidth;
      const mouseY = e.clientY - 52;

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
      setFocusedId(null);
    }
  };

  const handleDoubleClick = (e) => {
    if (readOnlyCanvas || e.target !== canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const worldX = camera.x + (e.clientX - rect.left) / camera.zoom - 120;
    const worldY = camera.y + (e.clientY - rect.top) / camera.zoom - 20;
    createNote(worldX, worldY);
  };

  // ── Canvas: Touch events ──
  const handleTouchStart = (e) => {
    // Only handle touches directly on the canvas background
    if (e.target !== canvasRef.current) return;

    if (e.touches.length === 1) {
      // Single finger → pan
      const t = e.touches[0];
      touchStateRef.current = {
        type: 'pan',
        startX: t.clientX,
        startY: t.clientY,
        lastX: t.clientX,
        lastY: t.clientY,
        startCamera: { ...cameraRef.current },
        moved: false,
      };
    } else if (e.touches.length === 2) {
      // Two fingers → pinch zoom
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      touchStateRef.current = {
        type: 'pinch',
        startDist: dist,
        startZoom: cameraRef.current.zoom,
        midX,
        midY,
        startCamera: { ...cameraRef.current },
      };
    }
  };

  const handleTouchMove = (e) => {
    const ts = touchStateRef.current;
    if (!ts.type) return;

    if (ts.type === 'pan' && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - ts.lastX;
      const dy = t.clientY - ts.lastY;
      ts.lastX = t.clientX;
      ts.lastY = t.clientY;
      ts.moved = true;
      setCamera(prev => ({
        ...prev,
        x: prev.x - dx / prev.zoom,
        y: prev.y - dy / prev.zoom,
      }));
    } else if (ts.type === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const scale = dist / ts.startDist;
      const newZoom = Math.min(Math.max(ts.startZoom * scale, 0.1), 5);

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
      const midY = (t1.clientY + t2.clientY) / 2 - rect.top;

      setCamera({
        zoom: newZoom,
        x: ts.startCamera.x + (midX / ts.startZoom) - (midX / newZoom),
        y: ts.startCamera.y + (midY / ts.startZoom) - (midY / newZoom),
      });
    }
  };

  const handleTouchEnd = (e) => {
    const ts = touchStateRef.current;
    if (ts.type === 'pan' && !ts.moved) {
      // Tap on canvas → unfocus
      setFocusedId(null);
    }
    if (e.touches.length === 0) {
      touchStateRef.current = { type: null };
    }
  };

  // ── Double-tap detection for mobile ──
  const lastTapRef = useRef(0);
  const handleCanvasTap = (e) => {
    if (e.target !== canvasRef.current || readOnlyCanvas) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double-tap → create note
      const rect = canvasRef.current.getBoundingClientRect();
      const touch = e.changedTouches[0];
      const worldX = cameraRef.current.x + (touch.clientX - rect.left) / cameraRef.current.zoom - 120;
      const worldY = cameraRef.current.y + (touch.clientY - rect.top) / cameraRef.current.zoom - 20;
      createNote(worldX, worldY);
    }
    lastTapRef.current = now;
  };

  const centerOnTodo = (todo) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCamera({
      x: todo.x - (rect.width / 2) / camera.zoom + 120,
      y: todo.y - (rect.height / 2) / camera.zoom + 40,
      zoom: camera.zoom,
    });
    setFocusedId(todo.id);
    // Close sidebar on mobile after navigating
    if (IS_MOBILE) setShowSidebar(false);
  };

  // ── Filter todos by search ──
  const filteredTodos = searchQuery.trim()
    ? todos.filter((t) => t.text.toLowerCase().includes(searchQuery.toLowerCase()))
    : todos;

  if (!authReady) {
    return (
      <div className="auth-overlay auth-overlay--loading">
        <p className="auth-loading-text">Loading…</p>
      </div>
    );
  }

  if (!me) {
    return <AuthScreen />;
  }

  const partnerEmail = me.partner?.email ?? '';
  const partnerShort = me.partner?.username || (partnerEmail ? partnerEmail.split('@')[0] : '');
  const myDisplayName = me.username || me.email.split('@')[0];

  return (
    <div className={`app-container ${showSidebar ? '' : 'sidebar-hidden'}`}>
      {/* Mobile backdrop */}
      <div className="sidebar-backdrop" onClick={() => setShowSidebar(false)} />

      <aside className="sidebar">
        <div className="sidebar-header">
          {readOnlyCanvas ? `${partnerShort || 'Partner'}'s list` : effectiveScope === 'both' ? 'Both lists' : 'Your list'}
        </div>

        {/* Search bar */}
        <div className="sidebar-search">
          <div className="sidebar-search-wrap">
            <Search size={14} className="sidebar-search-icon" />
            <input
              className="sidebar-search-input"
              type="text"
              placeholder="Search items…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="sidebar-list">
          {effectiveScope === 'both' ? (
            <>
              <div className="sidebar-section-label">Yours</div>
              {filteredTodos.filter((t) => t.owner_id === me.id).map((todo) => (
                <SidebarItem
                  key={todo.id}
                  todo={todo}
                  active={todo.id === focusedId}
                  onClick={centerOnTodo}
                  onDelete={deleteTodo}
                  readOnly={todoReadOnly(todo)}
                  isPartner={false}
                />
              ))}
              {me.partner && (
                <>
                  <div className="sidebar-section-label sidebar-section-label--partner">
                    {partnerShort || 'Partner'}
                  </div>
                  {filteredTodos.filter((t) => t.owner_id !== me.id).map((todo) => (
                    <SidebarItem
                      key={todo.id}
                      todo={todo}
                      active={todo.id === focusedId}
                      onClick={centerOnTodo}
                      onDelete={deleteTodo}
                      readOnly={todoReadOnly(todo)}
                      isPartner={true}
                    />
                  ))}
                </>
              )}
            </>
          ) : (
            filteredTodos.map((todo) => (
              <SidebarItem
                key={todo.id}
                todo={todo}
                active={todo.id === focusedId}
                onClick={centerOnTodo}
                onDelete={deleteTodo}
                readOnly={todoReadOnly(todo)}
                isPartner={me && todo.owner_id !== me.id}
              />
            ))
          )}
          {filteredTodos.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              {searchQuery ? 'No matching items' : readOnlyCanvas ? 'No items yet' : 'No notes yet'}
            </div>
          )}
        </div>
        <div className="sidebar-account">
          <div className="sidebar-account-identity">
            {usernameEditing ? (
              <form
                className="sidebar-username-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const val = usernameInput.trim();
                  if (!val) return;
                  setUsernameSaving(true);
                  setUsernameErr('');
                  try {
                    const updated = await updateMe({ username: val });
                    setMe(updated);
                    setUsernameEditing(false);
                  } catch (err) {
                    setUsernameErr(err.message || 'Failed to save');
                  } finally {
                    setUsernameSaving(false);
                  }
                }}
              >
                <input
                  className="auth-input auth-input--compact"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Enter username"
                  autoFocus
                  maxLength={32}
                  disabled={usernameSaving}
                />
                <div className="sidebar-username-actions">
                  <button type="submit" className="auth-submit auth-submit--small" disabled={usernameSaving || !usernameInput.trim()}>
                    {usernameSaving ? '…' : 'Save'}
                  </button>
                  <button type="button" className="sidebar-icon-btn" onClick={() => { setUsernameEditing(false); setUsernameErr(''); }}>
                    Cancel
                  </button>
                </div>
                {usernameErr && <div className="auth-error auth-error--compact">{usernameErr}</div>}
              </form>
            ) : (
              <div className="sidebar-account-name-row">
                <span className="sidebar-account-name">{myDisplayName}</span>
                <button
                  type="button"
                  className="sidebar-icon-btn sidebar-icon-btn--muted"
                  title="Edit username"
                  onClick={() => { setUsernameInput(me.username || ''); setUsernameEditing(true); setUsernameErr(''); }}
                >
                  <Edit size={13} />
                </button>
              </div>
            )}
          </div>
          {me.partner ? (
            <div className="sidebar-paired">Paired with {partnerShort || partnerEmail}</div>
          ) : (
            <>
              <div className="sidebar-invite-label">Your invite code</div>
              <div className="sidebar-invite-row">
                <code className="sidebar-invite-code">{me.invite_code}</code>
                <button type="button" className="sidebar-icon-btn" onClick={copyInvite} title="Copy code">
                  <Copy size={16} />
                </button>
              </div>
              <p className="sidebar-hint">Share this code with one friend. They can enter it when signing up or below after logging in.</p>
              <form className="sidebar-pair-form" onSubmit={handlePair}>
                <input
                  className="auth-input auth-input--compact"
                  placeholder="Enter friend's code"
                  value={pairInput}
                  onChange={(e) => setPairInput(e.target.value)}
                  autoComplete="off"
                />
                <button type="submit" className="auth-submit auth-submit--small">Pair</button>
              </form>
              {pairErr && <div className="auth-error auth-error--compact">{pairErr}</div>}
            </>
          )}
          <button type="button" className="sidebar-logout" onClick={logout}>
            <LogOut size={16} />
            Log out
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="toolbar">
          <button
            type="button"
            className={`toolbar-btn ${!showSidebar ? 'active' : ''}`}
            onClick={() => setShowSidebar(!showSidebar)}
            title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
            style={{ marginRight: 'auto' }}
          >
            <PanelLeft size={20} />
          </button>
          {me.partner && (
            <div className="toolbar-list-toggle" role="group" aria-label="Whose list to view">
              <button
                type="button"
                className={`toolbar-seg ${effectiveScope === 'both' ? 'active' : ''}`}
                onClick={() => { setListScope('both'); setFocusedId(null); }}
              >
                Both
              </button>
              <button
                type="button"
                className={`toolbar-seg ${effectiveScope === 'mine' ? 'active' : ''}`}
                onClick={() => { setListScope('mine'); setFocusedId(null); }}
              >
                Yours
              </button>
              <button
                type="button"
                className={`toolbar-seg ${effectiveScope === 'partner' ? 'active' : ''}`}
                onClick={() => { setListScope('partner'); setFocusedId(null); }}
              >
                <span className="toolbar-seg-inner">
                  <Users size={16} aria-hidden />
                  {partnerShort || 'Theirs'}
                </span>
              </button>
            </div>
          )}
          <button
            type="button"
            className="toolbar-btn zoom-controls-mobile"
            onClick={() => createNote()}
            title={readOnlyCanvas ? 'Switch to your list to add items' : 'New item'}
            disabled={readOnlyCanvas}
            style={{ opacity: readOnlyCanvas ? 0.4 : 1 }}
          >
            <Edit size={20} />
          </button>
          <div className="zoom-controls-mobile" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
            <button type="button" className="toolbar-btn" onClick={() => setCamera((prev) => ({ ...prev, zoom: Math.min(prev.zoom * 1.2, 5) }))}>
              <ZoomIn size={18} />
            </button>
            <button type="button" className="toolbar-btn" onClick={() => setCamera((prev) => ({ ...prev, zoom: Math.max(prev.zoom / 1.2, 0.1) }))}>
              <ZoomOut size={18} />
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: 40, textAlign: 'center' }}>
              {Math.round(camera.zoom * 100)}%
            </span>
          </div>
        </header>

        {readOnlyCanvas && (
          <div className="read-only-banner">
            View only — you can pan and zoom. Switch to &quot;Yours&quot; to edit your list.
          </div>
        )}

        {!online && (
          <div className="read-only-banner" style={{ background: 'rgba(255, 149, 0, 0.1)', color: '#996300' }}>
            Offline — changes will sync when you reconnect
          </div>
        )}

        <div
          className="canvas-container"
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onMouseLeave={() => setIsPanning(false)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={(e) => { handleTouchEnd(e); handleCanvasTap(e); }}
          style={{
            cursor: isPanning ? 'grabbing' : IS_TOUCH_DEVICE ? 'default' : 'grab',
            backgroundImage: 'radial-gradient(var(--notebook-dot) 1px, transparent 1px)',
            backgroundPosition: `${-camera.x * camera.zoom}px ${-camera.y * camera.zoom}px`,
            backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`,
            touchAction: 'none',
          }}
        >
          <div className="canvas-notebook-paper" aria-hidden />

          {/* Empty state for new users */}
          {todos.length === 0 && !readOnlyCanvas && (
            <div className="empty-state">
              <div className="empty-state-text">
                Your notebook is empty.<br />
                {IS_TOUCH_DEVICE ? 'Tap the + button to create your first item.' : 'Double-click anywhere or press any key to start writing.'}
              </div>
              {!me.partner && (
                <div className="empty-state-hint">
                  Share your invite code to collaborate with your partner.
                </div>
              )}
            </div>
          )}

          <motion.div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              transformOrigin: '0 0',
              zIndex: 1,
            }}
            animate={{
              x: -camera.x * camera.zoom,
              y: -camera.y * camera.zoom,
              scale: camera.zoom,
            }}
            transition={{ duration: 0 }}
          >
            <AnimatePresence>
              {todos.map((todo) => (
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
                  readOnly={todoReadOnly(todo)}
                  isPartner={me && todo.owner_id !== me.id}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Mobile FAB */}
        {!readOnlyCanvas && (
          <button
            className="fab"
            onClick={() => createNote()}
            aria-label="New item"
          >
            <Plus size={28} />
          </button>
        )}
      </main>

      <ToastContainer />
    </div>
  );
};

export default App;

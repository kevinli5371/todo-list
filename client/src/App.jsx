import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Check, Trash2, ZoomIn, ZoomOut, Edit, PanelLeft, Calendar, RefreshCw, Users, LogOut, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  fetchMe,
  pairWithCode,
  fetchTodos,
  createTodoRemote,
  patchTodoRemote,
  deleteTodoRemote,
} from './api';
import { supabase, isSupabaseConfigured } from './supabaseClient';

const TEXTAREA_FIELD_SIZING =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content');

const REPEAT_OPTIONS = [null, 'daily', 'weekly', 'monthly', 'yearly'];
const REPEAT_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

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

const SidebarItem = ({ todo, active, onClick, onDelete, readOnly }) => {
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

const snappyTransition = { duration: 0.15, ease: [0.4, 0, 1, 1] };

/** Checkbox + gaps + delete + drag handle + horizontal padding — add to text width for card size */
const TODO_CARD_CHROME_W = 132;

// Helper Component for Individual Todo Items to handle focus and drag
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

  // Clear inline height when expanded so CSS field-sizing: content controls size (no flicker).
  // Legacy browsers: set height once on expand only.
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

  // Widen card with long titles (first line when collapsed; max line when expanded)
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

  const handleDragHandleMouseDown = (e) => {
    if (readOnly) return;
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
        scale: isFocused && !readOnly ? 1.01 : 1,
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={snappyTransition}
      className={`todo-item-canvas ${isExpanded ? 'is-expanded' : ''} ${readOnly ? 'todo-readonly' : ''}`}
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

      {/* Single wrapper so footer + calendar collapse in one smooth motion */}
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

const App = () => {
  const [me, setMe] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [todos, setTodos] = useState([]);
  const [listScope, setListScope] = useState('mine');
  const [pairInput, setPairInput] = useState('');
  const [pairErr, setPairErr] = useState('');

  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });
  const cameraRef = useRef(camera);
  const [focusedId, setFocusedId] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const canvasRef = useRef(null);
  const textTimers = useRef({});

  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 });
  const isCreatingRef = useRef(false);
  const deletingIdsRef = useRef(new Set());

  const cameraStorageKey = me ? `spatial-camera-${me.id}` : null;

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

    // Fast path: read session from localStorage (no network when no session)
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

    // Handle subsequent sign-in / sign-out events
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
    if (me && !me.partner && listScope === 'partner') {
      setListScope('mine');
    }
  }, [me, listScope]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  const effectiveScope = me?.partner ? listScope : 'mine';
  const readOnlyCanvas = effectiveScope === 'partner';

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchTodos(effectiveScope);
        if (!cancelled) setTodos(data);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { cancelled = true; };
  }, [me, effectiveScope]);

  useEffect(() => {
    if (!me) return;
    const ownerId = effectiveScope === 'partner' ? me.partner?.id : me.id;
    if (!ownerId) return;

    const channel = supabase
      .channel(`todos:owner:${ownerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'todos', filter: `owner_id=eq.${ownerId}` },
        () => {
          fetchTodos(effectiveScope)
            .then((data) => setTodos(data.filter((t) => !deletingIdsRef.current.has(t.id))))
            .catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, effectiveScope]);

  const createNote = useCallback(async (x, y, initialText = '') => {
    if (!me || readOnlyCanvas || isCreatingRef.current) return;
    isCreatingRef.current = true;
    const sidebarWidth = showSidebar ? 280 : 0;
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
      setTodos((prev) => [created, ...prev]);
      setFocusedId(created.id);
    } catch (e) {
      console.error(e);
    } finally {
      isCreatingRef.current = false;
    }
  }, [me, readOnlyCanvas, camera, showSidebar]);

  useEffect(() => {
    if (!me || readOnlyCanvas) return;
    const handleGlobalKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length === 1) {
        e.preventDefault();
        createNote(null, null, e.key);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [me, readOnlyCanvas, createNote]);

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

  const deleteTodo = async (id) => {
    deletingIdsRef.current.add(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteTodoRemote(id);
    } catch (e) {
      console.error(e);
      deletingIdsRef.current.delete(id);
      try {
        const data = await fetchTodos(effectiveScope);
        setTodos(data.filter((t) => !deletingIdsRef.current.has(t.id)));
      } catch (_) { /* ignore */ }
      return;
    }
    deletingIdsRef.current.delete(id);
  };

  const handlePair = async (e) => {
    e.preventDefault();
    setPairErr('');
    try {
      const profile = await pairWithCode(pairInput.trim());
      setMe(profile);
      setPairInput('');
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
    navigator.clipboard.writeText(me.invite_code).catch(() => {});
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
    // Single click on canvas → just unfocus the current item
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

  const centerOnTodo = (todo) => {
    const rect = canvasRef.current.getBoundingClientRect();
    setCamera({
      x: todo.x - (rect.width / 2) / camera.zoom + 120,
      y: todo.y - (rect.height / 2) / camera.zoom + 40,
      zoom: camera.zoom,
    });
    setFocusedId(todo.id);
  };

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
  const partnerShort = partnerEmail ? partnerEmail.split('@')[0] : '';

  return (
    <div className={`app-container ${showSidebar ? '' : 'sidebar-hidden'}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          {readOnlyCanvas ? `${partnerShort || 'Partner'}'s list` : 'Your list'}
        </div>
        <div className="sidebar-list">
          {todos.map((todo) => (
            <SidebarItem
              key={todo.id}
              todo={todo}
              active={todo.id === focusedId}
              onClick={centerOnTodo}
              onDelete={deleteTodo}
              readOnly={readOnlyCanvas}
            />
          ))}
          {todos.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
              {readOnlyCanvas ? 'No items yet' : 'No notes yet'}
            </div>
          )}
        </div>
        <div className="sidebar-account">
          <div className="sidebar-account-email">{me.email}</div>
          {me.partner ? (
            <div className="sidebar-paired">Paired with {me.partner.email}</div>
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
            className="toolbar-btn"
            onClick={() => createNote()}
            title={readOnlyCanvas ? 'Switch to your list to add items' : 'New item'}
            disabled={readOnlyCanvas}
            style={{ opacity: readOnlyCanvas ? 0.4 : 1 }}
          >
            <Edit size={20} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
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

        <div
          className="canvas-container"
          ref={canvasRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onMouseLeave={() => setIsPanning(false)}
          style={{
            cursor: isPanning ? 'grabbing' : 'grab',
            backgroundImage: 'radial-gradient(var(--notebook-dot) 1px, transparent 1px)',
            backgroundPosition: `${-camera.x * camera.zoom}px ${-camera.y * camera.zoom}px`,
            backgroundSize: `${24 * camera.zoom}px ${24 * camera.zoom}px`,
          }}
        >
          <div className="canvas-notebook-paper" aria-hidden />
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
                  readOnly={readOnlyCanvas}
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

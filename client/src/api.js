import { supabase } from './supabaseClient';

const API_URL = import.meta.env.VITE_API_URL
  || `${window.location.protocol}//${window.location.hostname}:8000`;

const REQUEST_TIMEOUT_MS = 12_000;

// ── Online state ────────────────────────────────────────────

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

// ── Offline mutation queue ──────────────────────────────────

const _offlineQueue = [];

function enqueue(fn) {
  _offlineQueue.push(fn);
}

export async function flushOfflineQueue() {
  while (_offlineQueue.length > 0) {
    const fn = _offlineQueue[0];
    try {
      await fn();
      _offlineQueue.shift();
    } catch (e) {
      // If still offline or server error, stop flushing
      if (!isOnline()) break;
      // Drop permanently failed mutations after 3 retries
      if (fn._retries == null) fn._retries = 0;
      fn._retries++;
      if (fn._retries >= 3) {
        _offlineQueue.shift();
        console.warn('Dropping failed offline mutation after 3 retries:', e);
      }
      break;
    }
  }
}

// ── Request helpers ─────────────────────────────────────────

function timeoutSignal(existing) {
  if (existing) {
    return { signal: existing, clear: () => {} };
  }
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), clear: () => {} };
  }
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  return { signal: ctrl.signal, clear: () => clearTimeout(tid) };
}

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function request(path, options = {}) {
  const headers = { ...options.headers };
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const { signal: optSignal, ...rest } = options;
  const { signal, clear } = timeoutSignal(optSignal);
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { ...rest, headers, signal });
  } finally {
    clear();
  }
  if (res.status === 401) {
    supabase.auth.signOut({ scope: 'local' });
    throw new Error('UNAUTHORIZED');
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : data?.detail?.[0]?.msg || res.statusText;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return data;
}

// ── Mutation wrapper that queues when offline ───────────────

function mutationRequest(path, options = {}) {
  if (!isOnline()) {
    return new Promise((resolve, reject) => {
      const fn = async () => {
        const result = await request(path, options);
        resolve(result);
        return result;
      };
      enqueue(fn);
      // Return a fake response so the UI can proceed optimistically
      // For create calls this won't have a server ID, but patch/delete will work
      resolve(null);
    });
  }
  return request(path, options);
}

// ── API functions ───────────────────────────────────────────

export function fetchMe() {
  return request('/api/me');
}

export function updateMe(patch) {
  return request('/api/me', { method: 'PATCH', body: patch });
}

export function pairWithCode(inviteCode) {
  return request('/api/pair', {
    method: 'POST',
    body: { invite_code: inviteCode },
  });
}

export function fetchTodos(scope) {
  return request(`/api/todos?scope=${encodeURIComponent(scope)}`);
}

export function createTodoRemote(payload) {
  return request('/api/todos', { method: 'POST', body: payload });
}

export function patchTodoRemote(id, patch) {
  return mutationRequest(`/api/todos/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
}

export function deleteTodoRemote(id) {
  return mutationRequest(`/api/todos/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

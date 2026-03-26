import { supabase } from './supabaseClient';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401) {
    await supabase.auth.signOut();
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

export function fetchMe() {
  return request('/api/me');
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
  return request(`/api/todos/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
}

export function deleteTodoRemote(id) {
  return request(`/api/todos/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

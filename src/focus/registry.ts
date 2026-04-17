export interface Shortcut {
  key: string;
  label: string;
}

export interface FocusContext {
  id: string;
  shortcuts: Shortcut[];
}

type Subscriber = (ctx: FocusContext) => void;

const EMPTY: FocusContext = { id: "idle", shortcuts: [] };

let current: FocusContext = EMPTY;
const subscribers = new Set<Subscriber>();

export function setContext(ctx: FocusContext): void {
  current = ctx;
  for (const sub of subscribers) sub(current);
}

export function clearContext(id: string): void {
  if (current.id === id) {
    current = EMPTY;
    for (const sub of subscribers) sub(current);
  }
}

export function getContext(): FocusContext {
  return current;
}

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  fn(current);
  return () => subscribers.delete(fn);
}

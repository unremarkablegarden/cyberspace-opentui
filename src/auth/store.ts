import { homedir } from "node:os";
import { mkdir, chmod, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface StoredAuth {
  email: string;
  idToken: string;
  refreshToken: string;
  obtainedAt: number;
}

const CONFIG_DIR = join(homedir(), ".config", "cyberspace-tui");
const AUTH_FILE = join(CONFIG_DIR, "auth.json");

export async function loadAuth(): Promise<StoredAuth | null> {
  try {
    const file = Bun.file(AUTH_FILE);
    if (!(await file.exists())) return null;
    const json = await file.json();
    if (
      typeof json === "object" &&
      json != null &&
      typeof json.email === "string" &&
      typeof json.idToken === "string" &&
      typeof json.refreshToken === "string"
    ) {
      return {
        email: json.email,
        idToken: json.idToken,
        refreshToken: json.refreshToken,
        obtainedAt: typeof json.obtainedAt === "number" ? json.obtainedAt : Date.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveAuth(auth: StoredAuth): Promise<void> {
  await mkdir(dirname(AUTH_FILE), { recursive: true });
  await writeFile(AUTH_FILE, JSON.stringify(auth, null, 2));
  await chmod(AUTH_FILE, 0o600);
}

export async function clearAuth(): Promise<void> {
  try {
    await Bun.file(AUTH_FILE).delete();
  } catch {
    // ignore — file may not exist
  }
}

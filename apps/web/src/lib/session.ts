const SESSION_KEY = "receptionist-ai-session";

export type BusinessSession = {
  id: string;
  name: string;
  role: string;
  onboardingCompleted: boolean;
};

export type AdminSession = {
  email: string;
  role: string;
};

export type AuthSession = {
  email: string;
  business?: BusinessSession;
  admin?: AdminSession;
};

export function saveSession(session: AuthSession) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SESSION_KEY);
}

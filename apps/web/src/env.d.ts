/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OAuth client ID for Google sign-in (YouTube Music). Public by design. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

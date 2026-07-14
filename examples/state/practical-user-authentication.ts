import type { Render, State } from "../../release/dsl.js";

type Unauthenticated = {};
type Authenticating = {};
type Authenticated = {};
type SessionExpired = {};
type Locked = {};

export type AuthStates = Render<State.Diagram<[
  State.Transition<State.Start, Unauthenticated>,
  State.Transition<Unauthenticated, Authenticating, "login_attempt">,
  State.Transition<Authenticating, Authenticated, "valid_credentials">,
  State.Transition<Authenticating, Unauthenticated, "invalid_credentials">,
  State.Transition<Authenticating, Locked, "max_attempts_exceeded">,
  State.Transition<Authenticated, Unauthenticated, "logout">,
  State.Transition<Authenticated, SessionExpired, "timeout">,
  State.Transition<SessionExpired, Unauthenticated, "confirm_logout">,
  State.Transition<SessionExpired, Authenticated, "refresh_token">,
  State.Transition<Locked, Unauthenticated, "admin_unlock">,
  State.Note<Locked, "right", "Account locked after 3 failed login attempts">,
]>>;
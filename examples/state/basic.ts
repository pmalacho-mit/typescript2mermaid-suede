import type { State } from "../../release/diagrams/state.js";

type Idle = {};
type Processing = {};
type Success = {};
type Failed = {};

export type JobStates = State.Diagram<
  [
    State.Transition<State.Start, Idle>,
    State.Transition<Idle, Processing, "start_job">,
    State.Transition<Processing, Success, "job_complete">,
    State.Transition<Processing, Failed, "error_occurred">,
    State.Transition<Success, State.End>,
    State.Transition<Failed, Idle, "retry">,
    State.Transition<Failed, State.End, "abort">,
  ]
>;

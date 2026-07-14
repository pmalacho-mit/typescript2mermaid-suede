import type { Render, State } from "../../release/dsl.js";

type Active = {};
type Inactive = {};
type Running = {};
type Paused = {};
type Stopped = {};

export type CompositeStates = Render<State.Diagram<[
  State.Transition<State.Start, Active>,
  State.Composite<Active, [
    State.Transition<State.Start, Running>,
    State.Transition<Running, Paused, "pause">,
    State.Transition<Paused, Running, "resume">,
    State.Transition<Running, Stopped, "stop">,
    State.Transition<Paused, Stopped, "stop">,
  ]>,
  State.Transition<Active, Inactive, "deactivate">,
  State.Transition<Inactive, Active, "activate">,
  State.Transition<Active, State.End, "terminate">,
]>>;
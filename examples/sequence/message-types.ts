import type { Render, Sequence } from "../../release/dsl.js";

type User = {};
type API = {};

export type MessageTypes = Render<Sequence.Diagram<[
  Sequence.Message<User, API, "Solid arrow (synchronous)">,
  Sequence.Reply<API, User, "Dashed arrow (async response)">,
  Sequence.Lost<User, API, "Cross ending (lost message)">,
  Sequence.Async<User, API, "Open arrow">,
]>>;
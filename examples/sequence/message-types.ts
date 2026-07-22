import type { Sequence } from "../../release/sequence.js";

type User = {};
type API = {};

export type MessageTypes = Sequence.Diagram<
  [
    Sequence.Message<User, API, "Solid arrow (synchronous)">,
    Sequence.Reply<API, User, "Dashed arrow (async response)">,
    Sequence.Lost<User, API, "Cross ending (lost message)">,
    Sequence.Async<User, API, "Open arrow">,
  ]
>;

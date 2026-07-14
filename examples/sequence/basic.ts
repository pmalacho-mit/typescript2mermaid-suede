import type { Render, Sequence } from "../../release/dsl.js";

type User = {};
type API = {};
type Database = {};

export type BasicSequence = Render<Sequence.Diagram<[
  Sequence.Participant<User, "User">,
  Sequence.Participant<API, "API">,
  Sequence.Participant<Database, "Database">,
  Sequence.Message<User, API, "Request">,
  Sequence.Message<API, Database, "Query">,
  Sequence.Reply<Database, API, "Data">,
  Sequence.Reply<API, User, "Response">,
]>>;
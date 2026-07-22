import type { Sequence } from "../../release/diagrams/sequence.js";

type User = {};
type API = {};
type Database = {};

export type BasicSequence = Sequence.Diagram<
  [
    Sequence.Participant<User, "User">,
    Sequence.Participant<API, "API">,
    Sequence.Participant<Database, "Database">,
    Sequence.Message<User, API, "Request">,
    Sequence.Message<API, Database, "Query">,
    Sequence.Reply<Database, API, "Data">,
    Sequence.Reply<API, User, "Response">,
  ]
>;

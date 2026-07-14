import type { Render, Sequence } from "../../release/dsl.js";

type User = {};
type API = {};
type Database = {};

export type ActivationBoxes = Render<
  Sequence.Diagram<
    [
      Sequence.Participant<User, "User">,
      Sequence.Participant<API, "API">,
      Sequence.Participant<Database, "Database">,
      Sequence.Message<User, API, "Login Request", "activate">,
      Sequence.Message<API, Database, "Validate Credentials", "activate">,
      Sequence.Reply<Database, API, "User Data", "deactivate">,
      Sequence.Reply<API, User, "Login Success", "deactivate">,
    ]
  >
>;

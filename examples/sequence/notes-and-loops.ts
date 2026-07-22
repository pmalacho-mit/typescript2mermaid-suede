import type { Sequence } from "../../release/diagrams/sequence.js";

type Client = {};
type Server = {};

export type NotesAndLoops = Sequence.Diagram<
  [
    Sequence.Participant<Client, "Client">,
    Sequence.Participant<Server, "Server">,
    Sequence.NoteOver<[Client, Server], "Authentication Flow">,
    Sequence.Message<Client, Server, "Connect">,
    Sequence.Loop<
      "Every 30 seconds",
      [
        Sequence.Message<Client, Server, "Heartbeat">,
        Sequence.Reply<Server, Client, "Ack">,
      ]
    >,
    Sequence.NoteRight<Server, "Connection maintained">,
  ]
>;

import type { Render, Sequence } from "../../release/dsl.js";

type Client = {};
type Server = {};

export type NotesAndLoops = Render<Sequence.Diagram<[
  Sequence.Participant<Client, "Client">,
  Sequence.Participant<Server, "Server">,
  Sequence.NoteOver<[Client, Server], "Authentication Flow">,
  Sequence.Message<Client, Server, "Connect">,
  Sequence.Loop<"Every 30 seconds", [
    Sequence.Message<Client, Server, "Heartbeat">,
    Sequence.Reply<Server, Client, "Ack">,
  ]>,
  Sequence.NoteRight<Server, "Connection maintained">,
]>>;

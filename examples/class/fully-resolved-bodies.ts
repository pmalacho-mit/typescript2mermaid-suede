import type { Render, ClassDiagram } from "../../release/dsl.js";

/* Types expand into real `class` definitions: fields, methods, and
   visibility markers survive resolution through the identity wrappers.  */

type Credentials = { email: string; password: string };

type AppUser = {
  name: string;
  email: string;
  password: ClassDiagram.Private<string>;
  login(credentials: Credentials): boolean;
  logout(): void;
  validateEmail: ClassDiagram.Protected<() => boolean>;
};

export type UserClass = Render<ClassDiagram.Diagram<[
  // Class<AppUser> alone would work; the relation includes both ends too.
  ClassDiagram.Association<AppUser, Credentials, "authenticates with">,
]>>;
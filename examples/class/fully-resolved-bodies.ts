import type { Class } from "../../release/diagrams/class.js";

/* Types expand into real `class` definitions: fields, methods, and
   visibility markers survive resolution through the identity wrappers.  */

type Credentials = { email: string; password: string };

type AppUser = {
  name: string;
  email: string;
  password: Class.Private<string>;
  login(credentials: Credentials): boolean;
  logout(): void;
  validateEmail: Class.Protected<() => boolean>;
};

export type UserClass = Class.Diagram<
  [
    // Class<AppUser> alone would work; the relation includes both ends too.
    Class.Association<AppUser, Credentials, "authenticates with">,
  ]
>;

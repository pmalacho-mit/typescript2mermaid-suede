import type { Class } from "../../release/class.js";

type Animal = {
  name: string;
  makeSound(): void;
};

type Dog = Animal & { bark(): void };
type Cat = Animal & { meow(): void };

type Owner = {
  name: string;
  addAnimal(animal: Animal): void;
};

export type AnimalHierarchy = Class.Diagram<
  [
    Class.Extends<Dog, Animal>,
    Class.Extends<Cat, Animal>,
    Class.Association<Owner, Animal, "owns">,
  ]
>;

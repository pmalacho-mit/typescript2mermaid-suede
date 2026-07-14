import type { Render, ClassDiagram } from "../../release/dsl.js";

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

export type AnimalHierarchy = Render<
  ClassDiagram.Diagram<
    [
      ClassDiagram.Extends<Dog, Animal>,
      ClassDiagram.Extends<Cat, Animal>,
      ClassDiagram.Association<Owner, Animal, "owns">,
    ]
  >
>;

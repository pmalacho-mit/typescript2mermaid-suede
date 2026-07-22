import type { Entity } from "../../release/entity.js";

type Customer = { id: Entity.Key.Primary<Entity.Integer>; name: Entity.Text };
type Invoice = {
  id: Entity.Key.Primary<Entity.Integer>;
  order_id: Entity.Key.Foreign<Entity.Integer>;
};
type Supplier = { id: Entity.Key.Primary<Entity.Integer>; name: Entity.Text };
type Student = { id: Entity.Key.Primary<Entity.Integer>; name: Entity.Text };
type Course = { id: Entity.Key.Primary<Entity.Integer>; title: Entity.Text };
type Sale = {
  id: Entity.Key.Primary<Entity.Integer>;
  customer_id: Entity.Key.Foreign<Entity.Integer>;
};
type Item = {
  id: Entity.Key.Primary<Entity.Integer>;
  supplier_id: Entity.Key.Foreign<Entity.Integer>;
};

export type Cardinalities = Entity.Diagram<
  [
    Entity.Relation<Customer, Sale, "one-to-zero-or-many", "1 to many">,
    Entity.Relation<Sale, Invoice, "one-to-one", "1 to 1">,
    Entity.Relation<Item, Supplier, "many-to-one", "many to 1">,
    Entity.Relation<Student, Course, "many-to-many", "many to many">,
  ]
>;

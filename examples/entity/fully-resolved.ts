import type { Render, Entity } from "../../release/dsl.js";

type User = {
  user_id: Entity.Key.Primary<Entity.Integer>;
  username: Entity.Key.Unique<Entity.Text>;
  email: Entity.Key.Unique<Entity.Text>;
  password_hash: Entity.Text;
  created_at: Entity.DateTime;
  updated_at: Entity.DateTime;
};

type Order = {
  order_id: Entity.Key.Primary<Entity.Integer>;
  user_id: Entity.Key.Foreign<Entity.Integer>;
  total_amount: Entity.Decimal;
  status: Entity.Text;
  order_date: Entity.DateTime;
  shipped_date: Entity.DateTime;
};

type OrderItem = {
  order_item_id: Entity.Key.Primary<Entity.Integer>;
  order_id: Entity.Key.Foreign<Entity.Integer>;
  product_id: Entity.Key.Foreign<Entity.Integer>;
  quantity: Entity.Integer;
  unit_price: Entity.Decimal;
};

type Product = {
  product_id: Entity.Key.Primary<Entity.Integer>;
  category_id: Entity.Key.Foreign<Entity.Integer>;
  name: Entity.Text;
  description: Entity.Text;
  price: Entity.Decimal;
  stock_quantity: Entity.Integer;
  is_active: Entity.Boolean;
};

type Category = {
  category_id: Entity.Key.Primary<Entity.Integer>;
  name: Entity.Text;
  description: Entity.Text;
  parent_category_id: Entity.Key.Foreign<Entity.Integer>;
};

export type OrderSchema = Render<
  Entity.Diagram<
    [
      Entity.Relation<User, Order, "one-to-zero-or-many", "places">,
      Entity.Relation<Order, OrderItem, "one-to-many", "contains">,
      Entity.Relation<Product, OrderItem, "one-to-zero-or-many", "ordered in">,
      Entity.Relation<Category, Product, "one-to-zero-or-many", "categorizes">,
    ]
  >
>;

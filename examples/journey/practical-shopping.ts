import type { Journey } from "../../release/journey.js";

type User = {};

export type ShoppingJourney = Journey.Diagram<
  "User Shopping Journey",
  [
    Journey.Section<
      "Discovery",
      [
        Journey.Task<"Visit homepage", 5, [User]>,
        Journey.Task<"Browse categories", 4, [User]>,
        Journey.Task<"Search for product", 3, [User]>,
        Journey.Task<"View product details", 4, [User]>,
      ]
    >,
    Journey.Section<
      "Purchase",
      [
        Journey.Task<"Add to cart", 5, [User]>,
        Journey.Task<"Review cart", 3, [User]>,
        Journey.Task<"Enter shipping info", 2, [User]>,
        Journey.Task<"Enter payment info", 1, [User]>,
        Journey.Task<"Confirm order", 3, [User]>,
      ]
    >,
    Journey.Section<
      "Post-Purchase",
      [
        Journey.Task<"Receive confirmation", 4, [User]>,
        Journey.Task<"Track shipment", 5, [User]>,
        Journey.Task<"Receive product", 5, [User]>,
        Journey.Task<"Leave review", 3, [User]>,
      ]
    >,
  ]
>;

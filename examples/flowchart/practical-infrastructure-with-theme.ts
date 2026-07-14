import type { Render, Flowchart, Theme } from "../../release/dsl.js";

type Users = {};
type ApplicationLoadBalancer = {};
type AppServer1 = {};
type AppServer2 = {};
type PrimaryDatabase = {};
type RedisCache = {};

export type InfrastructureExample = Render<Flowchart.Diagram<"topdown", [
  Flowchart.Subgraph<"User Layer", [Users]>,
  Flowchart.Subgraph<"Load Balancing", [Flowchart.Node<ApplicationLoadBalancer, "rectangle", "Application Load Balancer">]>,
  Flowchart.Subgraph<"Application Tier", [
    Flowchart.Node<AppServer1, "rectangle", "App Server 1">,
    Flowchart.Node<AppServer2, "rectangle", "App Server 2">,
  ]>,
  Flowchart.Subgraph<"Data Tier", [
    Flowchart.Node<PrimaryDatabase, "database", "Primary Database">,
    Flowchart.Node<RedisCache, "database", "Redis Cache">,
  ]>,
  Flowchart.Connect<Users, ApplicationLoadBalancer>,
  Flowchart.Connect<ApplicationLoadBalancer, AppServer1>,
  Flowchart.Connect<ApplicationLoadBalancer, AppServer2>,
  Flowchart.Connect<AppServer1, PrimaryDatabase>,
  Flowchart.Connect<AppServer2, PrimaryDatabase>,
  Flowchart.Connect<AppServer1, RedisCache>,
  Flowchart.Connect<AppServer2, RedisCache>,
  Flowchart.DefineClass<"userClass", "fill:#e3f2fd,stroke:#1976d2,stroke-width:2px">,
  Flowchart.DefineClass<"dataClass", "fill:#fce4ec,stroke:#c2185b,stroke-width:2px">,
  Flowchart.ApplyClass<[Users], "userClass">,
  Flowchart.ApplyClass<[PrimaryDatabase, RedisCache], "dataClass">,
]>, [Theme<"neutral">]>;
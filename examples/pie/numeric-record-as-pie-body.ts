import type { Pie } from "../../release/pie.js";

type MonthlyAwsCosts = {
  "EC2 Instances": 45;
  "RDS Database": 25;
  "S3 Storage": 15;
  "Load Balancers": 10;
  "CloudWatch/Monitoring": 5;
};

export type AwsCosts = Pie.Diagram<"Monthly AWS Costs", MonthlyAwsCosts>;

import type { Render, Flowchart } from "../../release/dsl.js";

type CodeCommit = {};
type TestsPass = {};
type BuildImage = {};
type NotifyDeveloper = {};
type SecurityScan = {};
type DeployToStaging = {};
type BlockDeployment = {};
type RunIntegrationTests = {};
type DeployToProduction = {};
type Rollback = {};

export type DeploymentPipeline = Render<
  Flowchart.Diagram<
    "topdown",
    [
      Flowchart.Node<CodeCommit, "rectangle", "Code Commit">,
      Flowchart.Node<TestsPass, "diamond", "Tests Pass?">,
      Flowchart.Node<SecurityScan, "diamond", "Security Scan">,
      Flowchart.Connect<CodeCommit, TestsPass>,
      Flowchart.Connect<TestsPass, BuildImage, "Yes">,
      Flowchart.Connect<TestsPass, NotifyDeveloper, "No">,
      Flowchart.Connect<BuildImage, SecurityScan>,
      Flowchart.Connect<SecurityScan, DeployToStaging, "Pass">,
      Flowchart.Connect<SecurityScan, BlockDeployment, "Fail">,
      Flowchart.Connect<DeployToStaging, RunIntegrationTests>,
      Flowchart.Connect<RunIntegrationTests, DeployToProduction, "Pass">,
      Flowchart.Connect<RunIntegrationTests, Rollback, "Fail">,
    ]
  >
>;

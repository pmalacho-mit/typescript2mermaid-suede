import type { Flowchart } from "../../release/diagrams/flowchart.js";

type MainBranch = {};
type CreateFeatureBranch = {};
type DevelopFeature = {};
type CommitChanges = {};
type MoreWork = {};
type CreatePR = {};
type CodeReview = {};
type Approved = {};
type AddressFeedback = {};
type MergeToMain = {};
type DeleteFeatureBranch = {};

export type GitWorkflow = Flowchart.Diagram<
  "topdown",
  [
    Flowchart.Node<MainBranch, "rectangle", "main branch">,
    Flowchart.Node<MoreWork, "diamond", "more work?">,
    Flowchart.Node<Approved, "diamond", "approved?">,
    Flowchart.Connect<MainBranch, CreateFeatureBranch>,
    Flowchart.Connect<CreateFeatureBranch, DevelopFeature>,
    Flowchart.Connect<DevelopFeature, CommitChanges>,
    Flowchart.Connect<CommitChanges, MoreWork>,
    Flowchart.Connect<MoreWork, DevelopFeature, "yes">,
    Flowchart.Connect<MoreWork, CreatePR, "no">,
    Flowchart.Connect<CreatePR, CodeReview>,
    Flowchart.Connect<CodeReview, Approved>,
    Flowchart.Connect<Approved, AddressFeedback, "no">,
    Flowchart.Connect<AddressFeedback, CodeReview>,
    Flowchart.Connect<Approved, MergeToMain, "yes">,
    Flowchart.Connect<MergeToMain, DeleteFeatureBranch>,
  ]
>;

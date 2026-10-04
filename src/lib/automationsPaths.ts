// Addresses of the Automations screens (see AdminAutomationsPage):
//   /admin/automations/workflows[/<id>|/new]  an account's workflows
//   /admin/automations/templates[/<id>|/new]  the shared template library
//   /admin/automations/scheduled              what's about to happen
// A workflow's address also takes ?tab=builder|leads|history|settings,
// &run=<run id> (show where that lead is) and &step=<step id> (Leads tab,
// narrowed to one step).

export type Scope = "account" | "templates";

export const listPath = (scope: Scope) => `/admin/automations/${scope === "templates" ? "templates" : "workflows"}`;
export const workflowPath = (id: string, scope: Scope = "account") => `${listPath(scope)}/${id}`;

/** Where the editor's back button goes, and what it says. Set (in history
 *  state) by whoever links to a workflow from somewhere other than its list. */
export interface BackTo { to: string; label: string }

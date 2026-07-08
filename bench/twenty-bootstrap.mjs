// Twenty auth bootstrap (Gate B5). On a FRESH Twenty instance, programmatically
// creates + activates a workspace and prints a WORKSPACE-SCOPED access token to
// stdout — usable as a Bearer for Twenty's /graphql (data) and /rest APIs to
// seed + benchmark. Verified against Twenty v2.18.
//
// Flow (all core mutations on the /metadata endpoint):
//   1. signUp(email,password)                        -> workspace-agnostic token
//   2. signUpInNewWorkspace({displayName})           -> loginToken + workspace
//   3. getAuthTokensFromLoginToken(loginToken,origin)-> pre-activation token
//   4. activateWorkspace({displayName})              -> workspace ACTIVE (schema built)
//   5. getLoginTokenFromCredentials(email,pw,origin) -> loginToken (post-activation)
//   6. getAuthTokensFromLoginToken(loginToken,origin)-> workspace-scoped data token
//
//   BASE_URL=http://localhost:3201 node bench/twenty-bootstrap.mjs
const BASE_URL = (process.env.BASE_URL || "http://localhost:3201").replace(/\/$/, "");
const META = `${BASE_URL}/metadata`;
const ORIGIN = BASE_URL;
const email = process.env.TWENTY_EMAIL || `bench-${Date.now()}@bench.test`;
const password = process.env.TWENTY_PASSWORD || "BenchPass123!";
const displayName = process.env.TWENTY_WORKSPACE || "Fourty Bench";

async function gql(query, variables, token) {
  const res = await fetch(META, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors[0]?.message || body.errors));
  return body.data;
}
const log = (...a) => process.stderr.write(a.join(" ") + "\n");
const accessToken = (d) => d.tokens.accessOrWorkspaceAgnosticToken.token;

// 1. signUp → workspace-agnostic token
const su = await gql(
  `mutation($email:String!,$password:String!){ signUp(email:$email,password:$password){ tokens { accessOrWorkspaceAgnosticToken { token } } } }`,
  { email, password },
);
const agnostic = accessToken(su.signUp);
log("1/6 signUp:", email);

// 2. create a new workspace (authorized by the agnostic token)
const nw = await gql(
  `mutation($input:SignUpInNewWorkspaceInput){ signUpInNewWorkspace(input:$input){ loginToken { token } workspace { id } } }`,
  { input: { displayName } },
  agnostic,
);
const loginToken1 = nw.signUpInNewWorkspace.loginToken.token;
log("2/6 workspace created:", nw.signUpInNewWorkspace.workspace.id);

// 3. exchange for a pre-activation access token
const t1 = await gql(
  `mutation($loginToken:String!,$origin:String!){ getAuthTokensFromLoginToken(loginToken:$loginToken,origin:$origin){ tokens { accessOrWorkspaceAgnosticToken { token } } } }`,
  { loginToken: loginToken1, origin: ORIGIN },
  agnostic,
);
const preToken = accessToken(t1.getAuthTokensFromLoginToken);
log("3/6 pre-activation token");

// 4. activate the workspace → provisions its data source / record schema
const act = await gql(
  `mutation($data:ActivateWorkspaceInput!){ activateWorkspace(data:$data){ id activationStatus } }`,
  { data: { displayName } },
  preToken,
);
log("4/6 workspace activated:", act.activateWorkspace.activationStatus);

// 5. re-authenticate now that the workspace is ACTIVE
const cred = await gql(
  `mutation($email:String!,$password:String!,$origin:String!){ getLoginTokenFromCredentials(email:$email,password:$password,origin:$origin){ loginToken { token } } }`,
  { email, password, origin: ORIGIN },
);
const loginToken2 = cred.getLoginTokenFromCredentials.loginToken.token;
log("5/6 re-auth");

// 6. final workspace-scoped data token
const t2 = await gql(
  `mutation($loginToken:String!,$origin:String!){ getAuthTokensFromLoginToken(loginToken:$loginToken,origin:$origin){ tokens { accessOrWorkspaceAgnosticToken { token } } } }`,
  { loginToken: loginToken2, origin: ORIGIN },
);
const dataToken = accessToken(t2.getAuthTokensFromLoginToken);
log("6/6 workspace data token acquired");

process.stdout.write(dataToken + "\n");

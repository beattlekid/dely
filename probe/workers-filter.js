const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const delyScript = path.resolve(__dirname, '../skills/delivery/scripts/dely.js');
const fakeOrcaScript = path.resolve(__dirname, 'fake-orca-workers.js');

function runDely(envVars) {
  try {
    const out = execFileSync(process.execPath, [delyScript, 'workers', '--run', 'run-123'], {
      env: { ...process.env, ORCA_CLI_COMMAND: fakeOrcaScript, ...envVars },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { ok: true, output: out.trim() };
  } catch (e) {
    return { ok: false, output: (e.stdout || '').trim(), status: e.status };
  }
}

function test() {
  let failed = false;
  
  // 1. Rich valid row containing unrelated sentinel transcript/metadata fields
  const richData = {
    workers: [{
      dispatchId: "d-1",
      agentIdentity: "claude",
      dispatchStatus: "dispatched",
      terminalState: "active",
      sentinelMetadata: "SHOULD_BE_REMOVED",
      projection: {
        liveness: { verdict: "live" },
        attention: { requiresAction: false },
        nextAction: { kind: "wait" },
        unrelated: "SHOULD_BE_REMOVED"
      }
    }]
  };
  fs.writeFileSync(fakeOrcaScript, `console.log(JSON.stringify(${JSON.stringify({result: richData})}));`);
  let res = runDely({});
  if (!res.ok) {
    console.error("FAIL: rich row failed");
    failed = true;
  } else {
    const parsed = JSON.parse(res.output);
    if (JSON.stringify(parsed).includes("SHOULD_BE_REMOVED")) {
      console.error("FAIL: rich row contains sentinel fields");
      failed = true;
    }
  }

  // 2. Explicit nextAction.kind: none
  const explicitData = {
    workers: [{
      dispatchId: "d-2",
      dispatchStatus: "dispatched",
      projection: {
        nextAction: { kind: "none" }
      }
    }]
  };
  fs.writeFileSync(fakeOrcaScript, `console.log(JSON.stringify(${JSON.stringify({result: explicitData})}));`);
  res = runDely({});
  if (!res.ok) {
    console.error("FAIL: explicit nextAction failed");
    failed = true;
  } else {
    const parsed = JSON.parse(res.output);
    if (!parsed[0].nextAction || parsed[0].nextAction.kind !== "none") {
      console.error("FAIL: explicit nextAction not preserved");
      failed = true;
    }
  }

  // 3. Missing nextAction
  const missingData = {
    workers: [{
      dispatchId: "d-3",
      dispatchStatus: "dispatched",
      projection: {}
    }]
  };
  fs.writeFileSync(fakeOrcaScript, `console.log(JSON.stringify(${JSON.stringify({result: missingData})}));`);
  res = runDely({});
  if (!res.ok) {
    console.error("FAIL: missing nextAction failed");
    failed = true;
  } else {
    const parsed = JSON.parse(res.output);
    if ('nextAction' in parsed[0]) {
      console.error("FAIL: missing nextAction synthesised as none");
      failed = true;
    }
  }

  // 4. Orca failure
  fs.writeFileSync(fakeOrcaScript, `process.exit(1);`);
  res = runDely({});
  if (res.ok) {
    console.error("FAIL: Orca failure succeeded");
    failed = true;
  }

  // 5. Malformed successful response
  fs.writeFileSync(fakeOrcaScript, `console.log(JSON.stringify({result: { workers: "not an array" }}));`);
  res = runDely({});
  if (res.ok || res.output === "[]") {
    console.error("FAIL: Malformed successful response treated as successful");
    failed = true;
  }

  try { fs.unlinkSync(fakeOrcaScript); } catch (_) {}

  if (failed) {
    process.exit(1);
  }
}

test();

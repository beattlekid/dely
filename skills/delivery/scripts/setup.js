#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const configDir = path.join(os.homedir(), ".dely");
const configPath = path.join(configDir, "config.json");

let config = {};
try {
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  }
} catch (e) {
  console.log("Could not read existing config, starting fresh.");
}

function prompt(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

async function setupPhase(phaseName) {
  console.log(`\n--- Setup for ${phaseName} phase ---`);
  const harness = await prompt(`Agent/Harness (e.g., Antigravity CLI, Codex CLI) [leave blank to skip]: `);
  if (!harness.trim()) return;
  const model = await prompt(`Model (e.g., gemini-3.1-pro-high, auto): `);
  const effort = await prompt(`Effort (default, medium, high): `);
  
  config[phaseName] = { 
    harness: harness.trim(), 
    model: model.trim() || "auto", 
    effort: effort.trim() || "default" 
  };
}

async function run() {
  console.log("Dely Agent Personalization Wizard");
  console.log("Configure your preferred agents and models for local execution.");
  
  await setupPhase("implement");
  await setupPhase("review");
  
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  console.log(`\nConfiguration saved to ${configPath}`);
  rl.close();
}

run().catch(err => {
  console.error(err);
  rl.close();
  process.exit(1);
});

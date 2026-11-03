# OrwellBlue

## Overview
OrwellBlue is an autonomous multi agent containment and surveillance system. The system governs autonomous language model agents using runtime guardrails, deterministic policy verification, automated killswitches, real time forensic logging, and an interactive monitoring dashboard.

## Key Features
System security and agent sandboxing:
Enforces sandboxed execution loops for autonomous agent workers.

Automated watchdog governance:
Actively tracks agent behavior, tool calls, and output integrity, terminating compromised sessions.

Killswitch mechanisms:
Hard cutoffs and containment triggers activated when policy violations occur.

Forensic event ledger:
Structured event streaming and logging of agent actions, decisions, and system alerts.

Interactive dashboard interface:
A web dashboard displaying live agent fleet status, real time telemetry, lab testing, and security boundaries.

## Architecture

The project is structured into three primary operational layers:

1. Intelligence and Models
Agents run on top of local inference provided by Ollama using Qwen based agent models.

2. Core Runtime and API
A Python backend that coordinates policies, executes sandboxes, runs the watchdog surveillance loop, and exposes status endpoints.

3. User Interface
A NextJS frontend delivering monitoring panels, forensic exploration, and real time fleet visualization.

## Directory Structure

OrwellBlue
.devcontainer : Container runtime definitions
agents : Model agents and worker runner definitions
api : Web service entry points and routing
core : Watchdog, policy engine, killswitch, and store logic
models : Remote engine connections for local inference
ui : NextJS web dashboard application
tests : Test suite for verification

## Prerequisites

Python 3.11 or newer
uv package manager or standard pip
NodeJS 18 or newer
npm package manager
Ollama installed and running locally

## Setup Instructions

### Environment Setup

Create and activate a Python virtual environment:
python3 -m venv .venv
source .venv/bin/activate

Install Python dependencies:
uv pip install -e .

Install frontend dependencies:
cd ui
npm install
cd ..

## Running Components Individually

Open separate terminal windows for each process to ensure proper lifecycle control and clear log outputs.

### Terminal 1 : Ollama Service

Start the local inference service:
ollama serve

Pull the required model in another prompt if not already present:
ollama pull qwen2.5:latest

### Terminal 2 : Watchdog Daemon

Run the watchdog to monitor agent actions and execute containment policies:
python -m core.watchdog

### Terminal 3 : Backend Service

Launch the central OrwellBlue server:
python -m api.main

### Terminal 4 : Agent Runner

Execute the agent loop or targeted test scenarios:
python -m agents.runner

Or run the interactive demonstration script:
python -m core.demo

### Terminal 5 : User Interface

Launch the NextJS monitoring web application:
cd ui
npm run dev

Once started, access the monitoring dashboard at:
http://localhost:3000

## Verification and Testing

Run automated tests to confirm that policies and sandboxes function correctly:
pytest tests/test_orwellblue.py

Verify code quality and formatting:
ruff check .
cd ui && npm run lint



Contributors:-
Jagath Sajjan (Team Leader)
Kartik Rana
Niteesh
Aditya Kumar

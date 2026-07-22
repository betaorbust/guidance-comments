#!/usr/bin/env node
//
// Offline test for the guidance-comments action.
//
// Runs the real action.yml under `act` (Docker), but redirects the GitHub API
// to a local mock server via $GITHUB_API_URL. For each state, it asserts the
// action made the correct mutating call (POST=create, PATCH=update/resolve,
// DELETE=remove) or none at all -- with no network and no real PR.
//
// Requirements: docker (running), act, and Node. act fetches the runner image
// and the referenced actions as needed (a brief network check per run).
//
// Usage: node --test tests/run.js   (or node tests/run.js)

import { describe, it, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve as _resolve, join } from 'node:path';
import { get } from 'node:http';

const TESTS_DIR = import.meta.dirname;
const REPO_ROOT = _resolve(TESTS_DIR, '..');
// This looks like a bad choice of image name, but it's the one recommended by act
// https://nektosact.com/usage/runners.html#runners
const IMAGE =
	'catthehacker/ubuntu:act-latest@sha256:3220992391c1182a0cfe4c64453511772c54f4c39e960d26a5e327960675982e';
const PORT = process.env.MOCK_PORT || '8899';
const API_URL = `http://host.docker.internal:${PORT}`;
const TAG = '<!-- guidance: test-guidance -->';
const LOG = join(tmpdir(), `gc-mock-${process.pid}.log`);
// Set GC_ARCH=linux/amd64 to force emulation if native arch misbehaves.
const ARCH_FLAG =
	process.env.GC_ARCH ?
		['--container-architecture', process.env.GC_ARCH]
	:	[];
// act can pull an image / clone actions on the first run, so give each test
// plenty of time and never hang forever.
const OPTS = { timeout: 300_000 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- mock server lifecycle --------------------------------------------------
let mock = null;
async function startMock(existing) {
	writeFileSync(LOG, '');
	mock = spawn(process.execPath, [join(TESTS_DIR, 'mock-github.js')], {
		// Pass only the vars the mock needs, not the whole environment.
		env: {
			MOCK_PORT: PORT,
			MOCK_LOG: LOG,
			MOCK_EXISTING: existing,
			MOCK_TAG: TAG,
		},
		stdio: 'ignore',
	});
	for (let i = 0; i < 50; i++) {
		const ok = await new Promise((resolve) => {
			const req = get(
				`http://127.0.0.1:${PORT}/repos/x/y/issues/1/comments`,
				(res) => {
					res.resume();
					resolve(res.statusCode === 200);
				},
			);
			req.on('error', () => resolve(false));
		});
		if (ok) return;
		await sleep(100);
	}
	throw new Error(`mock server did not start on port ${PORT}`);
}
function stopMock() {
	if (mock) {
		mock.kill();
		mock = null;
	}
}

// Remove the mock and its log. Also wired to signals so an interrupted run
// doesn't orphan the mock process holding the port.
function cleanup() {
	stopMock();
	rmSync(LOG, { force: true });
}
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		cleanup();
		process.exit(42);
	});
}

// ---- run the action once under act ------------------------------------------
function runAct(show, guidance, resolved) {
	const args = [
		'workflow_dispatch',
		'-W',
		join(TESTS_DIR, 'workflow.yml'),
		'-C',
		REPO_ROOT,
		// Don't mount the host Docker socket into the runner container: the test
		// needs no docker-in-docker, and mounting it is a container-escape vector.
		'--container-daemon-socket',
		'-',
		'--bind',
		'-P',
		`ubuntu-latest=${IMAGE}`,
		'--env',
		`GITHUB_API_URL=${API_URL}`,
		'--env',
		'GITHUB_REPOSITORY=acme/demo',
		...ARCH_FLAG,
		'--input',
		`show-guidance=${show}`,
		'--input',
		`guidance-body=${guidance}`,
		'--input',
		`resolved-body=${resolved}`,
	];
	return spawnSync('act', args, { encoding: 'utf8' });
}

function actOutput(res) {
	return (res.stdout || '') + (res.stderr || '') || String(res.error || '');
}

// Extract the mutating calls and the last mutation body from the mock log.
function parseLog() {
	const muts = [];
	let body = '';
	for (const line of readFileSync(LOG, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		const r = JSON.parse(line);
		if (['POST', 'PATCH', 'DELETE'].includes(r.method)) {
			muts.push(r.method);
			body = r.body || '';
		}
	}
	return { got: muts.join(','), body };
}

// Set the mock's existing-comment state, run the action once under act, and
// return which mutating call it made. The mock is torn down in afterEach.
async function run(existing, show, guidance, resolved) {
	await startMock(existing);
	const res = runAct(show, guidance, resolved);
	assert.equal(res.status, 0, actOutput(res));
	return parseLog();
}

describe('guidance-comments action (real action.yml under act, mocked API)', () => {
	afterEach(stopMock);
	after(() => rmSync(LOG, { force: true }));

	it('creates guidance when shown and none exists', OPTS, async () => {
		const { got, body } = await run('0', 'true', 'Fix lint', '');
		assert.equal(got, 'POST');
		assert.match(body, /Fix lint/);
	});

	it('updates guidance when one already exists', OPTS, async () => {
		const { got, body } = await run('1', 'true', 'Updated', '');
		assert.equal(got, 'PATCH');
		assert.match(body, /Updated/);
	});

	it('posts the resolved body when not shown and one exists', OPTS, async () => {
		const { got, body } = await run('1', 'false', '', 'Done');
		assert.equal(got, 'PATCH');
		assert.match(body, /Done/);
	});

	it('removes guidance when shown but the body is empty', OPTS, async () => {
		const { got } = await run('1', 'true', '', '');
		assert.equal(got, 'DELETE');
	});

	it('removes guidance when the resolved body is empty', OPTS, async () => {
		const { got } = await run('1', 'false', '', '');
		assert.equal(got, 'DELETE');
	});

	it('does nothing when not shown and none exists', OPTS, async () => {
		const { got } = await run('0', 'false', '', '');
		assert.equal(got, '', 'expected no API mutation');
	});
});

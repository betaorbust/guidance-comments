#!/usr/bin/env node
//
// Offline test for the guidance-comments action.
//
// Runs the real action.yml under `act` (Docker), but redirects the GitHub API
// to a local mock server via $GITHUB_API_URL. For each state, it asserts the
// action made the correct mutating call (POST=create, PATCH=update/resolve,
// DELETE=remove) or none at all -- with no network and no real PR.
//
// Requirements: docker (running), act, and Node. The FIRST run fetches the act
// runner image and the referenced actions online (one time); subsequent runs
// are fully offline via --action-offline-mode.
//
// Usage: node tests/run.js   (or ./tests/run.js)
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TESTS_DIR = __dirname;
const REPO_ROOT = path.resolve(TESTS_DIR, '..');
// This looks like a bad choice of image name, but it's the one recommended by act
// https://nektosact.com/usage/runners.html#runners
const IMAGE = 'catthehacker/ubuntu:act-latest';
const PORT = process.env.MOCK_PORT || '8899';
const API_URL = `http://host.docker.internal:${PORT}`;
const TAG = '<!-- guidance: test-guidance -->';
const LOG = path.join(os.tmpdir(), `gc-mock-${process.pid}.log`);
// Set GC_ARCH=linux/amd64 to force emulation if native arch misbehaves.
const ARCH_FLAG =
	process.env.GC_ARCH ?
		['--container-architecture', process.env.GC_ARCH]
	:	[];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- warmup detection: cold cache => allow the one-time online fetch --------
function cacheWarm() {
	if (
		spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' })
			.status !== 0
	)
		return false;
	try {
		return (
			fs.readdirSync(path.join(os.homedir(), '.cache', 'act')).length > 0
		);
	} catch {
		return false;
	}
}
let offlineFlags = ['--action-offline-mode', '--pull=false'];
if (!cacheWarm()) {
	console.log(
		'Cold act cache: the first scenario will fetch the runner image and',
	);
	console.log(
		'actions online (one time). Later scenarios run fully offline.',
	);
	offlineFlags = [];
}

// ---- mock server lifecycle --------------------------------------------------
let mock = null;
async function startMock(existing) {
	fs.writeFileSync(LOG, '');
	mock = spawn('node', [path.join(TESTS_DIR, 'mock-github.js')], {
		env: {
			...process.env,
			MOCK_PORT: PORT,
			MOCK_LOG: LOG,
			MOCK_EXISTING: existing,
			MOCK_TAG: TAG,
		},
		stdio: 'ignore',
	});
	for (let i = 0; i < 50; i++) {
		const ok = await new Promise((resolve) => {
			const req = http.get(
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

// ---- run the action once under act ------------------------------------------
function runAct(show, guidance, resolved) {
	const args = [
		'workflow_dispatch',
		'-W',
		path.join(TESTS_DIR, 'workflow.yml'),
		'-C',
		REPO_ROOT,
		'--bind',
		'-P',
		`ubuntu-latest=${IMAGE}`,
		'--env',
		`GITHUB_API_URL=${API_URL}`,
		'--env',
		'GITHUB_REPOSITORY=acme/demo',
		...ARCH_FLAG,
		...offlineFlags,
		'--input',
		`show-guidance=${show}`,
		'--input',
		`guidance-body=${guidance}`,
		'--input',
		`resolved-body=${resolved}`,
	];
	return spawnSync('act', args, { encoding: 'utf8' });
}

// Extract the mutating calls and the last mutation body from the mock log.
function parseLog() {
	const muts = [];
	let body = '';
	for (const line of fs.readFileSync(LOG, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		const r = JSON.parse(line);
		if (['POST', 'PATCH', 'DELETE'].includes(r.method)) {
			muts.push(r.method);
			body = r.body || '';
		}
	}
	return { got: muts.join(','), body };
}

let pass = 0;
let fail = 0;
async function scenario(
	name,
	existing,
	want,
	substr,
	show,
	guidance,
	resolved,
) {
	await startMock(existing);
	const res = runAct(show, guidance, resolved);
	stopMock();
	offlineFlags = ['--action-offline-mode', '--pull=false']; // warm after first run

	if (res.status !== 0) {
		console.log(`FAIL  ${name}  (act failed)`);
		const out =
			(res.stdout || '') + (res.stderr || '') || String(res.error || '');
		console.log(out.replace(/^/gm, '      | '));
		fail++;
		return;
	}

	const { got, body } = parseLog();
	let ok = got === want;
	if (substr && !body.includes(substr)) ok = false;

	if (ok) {
		console.log(`PASS  ${name}  -> ${got || 'no mutation'}`);
		pass++;
	} else {
		console.log(
			`FAIL  ${name}  expected=[${want || 'none'}] body~='${substr}'  got=[${got || 'none'}] body='${body}'`,
		);
		fail++;
	}
}

async function main() {
	console.log('Running guidance-comments offline action tests...\n');
	//                name                       exist  method   body-substring         show     guidance              resolved
	await scenario(
		'create guidance',
		'0',
		'POST',
		'Please fix the lint',
		'true',
		'Please fix the lint',
		'',
	);
	await scenario(
		'update guidance',
		'1',
		'PATCH',
		'Updated guidance',
		'true',
		'Updated guidance',
		'',
	);
	await scenario(
		'resolve guidance',
		'1',
		'PATCH',
		'All resolved',
		'false',
		'',
		'All resolved',
	);
	await scenario(
		'remove (empty guidance)',
		'1',
		'DELETE',
		'',
		'true',
		'',
		'',
	);
	await scenario(
		'remove (empty resolved)',
		'1',
		'DELETE',
		'',
		'false',
		'',
		'',
	);
	await scenario('initial (nothing to do)', '0', '', '', 'false', '', '');
	console.log(`\nPassed: ${pass}   Failed: ${fail}`);
}

main()
	.catch((err) => {
		console.error(err.message || err);
		fail++;
	})
	.finally(() => {
		stopMock();
		fs.rmSync(LOG, { force: true });
		process.exit(fail === 0 ? 0 : 1);
	});

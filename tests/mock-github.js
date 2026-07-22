#!/usr/bin/env node
// Minimal offline mock of the GitHub REST comment API.
//
// The guidance action reaches the GitHub API through @actions/github's Octokit,
// whose base URL defaults to $GITHUB_API_URL. The test harness points that at
// this server, so every list/create/update/delete the action performs is served
// locally and recorded here -- no network, no real PR.
//
// Configured via environment variables:
//   MOCK_PORT      port to listen on (default 8899)
//   MOCK_LOG       file to append one JSON line per request to (required)
//   MOCK_EXISTING  "1" => the comment list returns one existing guidance comment;
//                  anything else => the list is empty
//   MOCK_TAG       hidden marker the existing comment's body contains, so that
//                  find-comment's body-includes match succeeds
//
// Every request is logged as {"method","path","body"}. The harness asserts on
// which mutating call (POST/PATCH/DELETE) was made for each scenario.
'use strict';

import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';

const PORT = Number(process.env.MOCK_PORT || '8899');
const LOG = process.env.MOCK_LOG;
const EXISTING = process.env.MOCK_EXISTING === '1';
const TAG = process.env.MOCK_TAG || '<!-- guidance-comment: test-guidance -->';
const EXISTING_ID = 12345;

// GET/POST list endpoint:   /repos/{owner}/{repo}/issues/{n}/comments
const LIST_RE = /^\/repos\/[^/]+\/[^/]+\/issues\/\d+\/comments/;
// GET/PATCH/DELETE single:  /repos/{owner}/{repo}/issues/comments/{id}
const SINGLE_RE = /^\/repos\/[^/]+\/[^/]+\/issues\/comments\/\d+/;

function existingComment() {
	return {
		id: EXISTING_ID,
		node_id: 'MDEyOklzc3VlQ29tbWVudDEyMzQ1',
		body: `${TAG}\nprevious guidance body`,
		user: { login: 'github-actions[bot]' },
		created_at: '2020-01-01T00:00:00Z',
		updated_at: '2020-01-01T00:00:00Z',
		html_url: `https://example.test/comment/${EXISTING_ID}`,
	};
}

function record(method, path, body) {
	appendFileSync(LOG, JSON.stringify({ method, path, body }) + '\n');
}

function send(res, status, payload) {
	const data = payload === undefined ? '' : JSON.stringify(payload);
	res.writeHead(status, {
		'Content-Type': 'application/json',
		'Content-Length': Buffer.byteLength(data),
	});
	res.end(data);
}

function parseBody(body) {
	try {
		return JSON.parse(body);
	} catch {
		return {};
	}
}

const server = createServer((req, res) => {
	const chunks = [];
	req.on('data', (c) => chunks.push(c));
	req.on('end', () => {
		const body = Buffer.concat(chunks).toString('utf8');
		const { method, url } = req;
		record(
			method,
			url,
			method === 'POST' || method === 'PATCH' ? body : '',
		);

		if (method === 'GET' && LIST_RE.test(url)) {
			// Single page, no Link header -> octokit.paginate stops here.
			return send(res, 200, EXISTING ? [existingComment()] : []);
		}
		if (method === 'GET' && SINGLE_RE.test(url)) {
			return send(res, 200, existingComment());
		}
		if (method === 'POST' && LIST_RE.test(url)) {
			const created = {
				...existingComment(),
				id: 99001,
				html_url: 'https://example.test/comment/99001',
				body: parseBody(body).body || '',
			};
			return send(res, 201, created);
		}
		if (method === 'PATCH' && SINGLE_RE.test(url)) {
			const updated = existingComment();
			updated.body = parseBody(body).body || updated.body;
			return send(res, 200, updated);
		}
		if (method === 'DELETE' && SINGLE_RE.test(url)) {
			return send(res, 204);
		}
		return send(res, 200, {});
	});
});

server.listen(PORT, '0.0.0.0');

import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPublishedArtifact } from './check-published-artifacts.mjs';

test('a missing registry artifact may be published', () => {
  assert.equal(
    classifyPublishedArtifact({ remote: null, localDigest: 'a', remoteDigest: '', head: 'abc' }),
    'publish',
  );
});

test('a matching digest is a no-op', () => {
  assert.equal(
    classifyPublishedArtifact({
      remote: { gitHead: 'abc' },
      localDigest: 'same',
      remoteDigest: 'same',
      head: 'abc',
    }),
    'skip-match',
  );
});

test('a digest mismatch for this commit fails', () => {
  assert.equal(
    classifyPublishedArtifact({
      remote: { gitHead: 'abc' },
      localDigest: 'local',
      remoteDigest: 'remote',
      head: 'abc',
    }),
    'mismatch',
  );
});

test('a digest mismatch from another commit does not republish', () => {
  assert.equal(
    classifyPublishedArtifact({
      remote: { gitHead: 'other' },
      localDigest: 'local',
      remoteDigest: 'remote',
      head: 'abc',
    }),
    'skip-other-commit',
  );
});

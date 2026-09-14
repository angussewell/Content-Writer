import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  measurePassage, retentionAt, selectCohort, matchedSpan, comparePassage,
  typicalAt, analyzeRetention, accountFor,
} from '../lib/tiktokRetention.ts';

const curve = (values) => values.map((retained_fraction, second) => ({ second, retained_fraction }));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const video = (overrides = {}) => ({
  id: 100, tiktok_id: 'target', create_time: '2026-09-01T12:00:00Z',
  fetched_at: '2026-09-09T12:00:00Z', duration_ms: 60000, views: 2000,
  permalink: 'https://www.tiktok.com/@test/video/target', retention_curve: curve([1, .85, .7]),
  ...overrides,
});
const peer = (id, overrides = {}) => video({ id, tiktok_id: `peer${id}`,
  create_time: new Date(Date.UTC(2026, 7, 30 - id)).toISOString(), ...overrides });
const peers = (values) => Array.from({ length: 20 }, (_, i) => peer(i, { retention_curve: curve(values) }));
const span = (start_s, end_s) => ({ start_s, end_s, spoken: 'A passage', on_screen: 'A scene' });

test('true passage endpoints give 14, 13 and 10 points without shifted or double-counted loss', () => {
  const c = curve([1, .86, .73, .68, .63]);
  const result = [[0, 1], [1, 2], [2, 4]].map(([s, e]) => measurePassage(c, s, e));
  result.forEach((m, i) => { near(m.drop_pts, [14, 13, 10][i]); near(m.retained_end, [86, 73, 63][i]); });
  near(result.reduce((n, r) => n + r.drop_pts, 0), 37);
  near(result[1].decline, 13 / 86);
});

test('fractional boundaries interpolate adjacent samples only, without rounding source timestamps', () => {
  const c = curve([1, .8, .6]);
  const m = measurePassage(c, .5, 1.5);
  near(m.drop_pts, 20); near(m.retained_end, 70); assert.equal(m.interpolated, true);
  assert.equal(retentionAt(c, 2.1), null);
  assert.equal(retentionAt([c[0], c[2]], 1), null);
  assert.equal(measurePassage([...c.slice(0, 2), {second: 3, retained_fraction: .5}], 0, 3).quality, 'missing');
});

test('missing endpoints, missing first sample, last passage and subsecond spans remain ungraded', () => {
  const c = curve([1, .8, .6]);
  assert.equal(measurePassage(c.slice(1), 0, 1).drop_pts, null);
  assert.equal(measurePassage(c, 1, 3).drop_pts, null);
  assert.equal(measurePassage(c, 0, .5).quality, 'short');
  assert.equal(measurePassage(c, 1, 2).quality, 'ok');
});

test('malformed, rising and near-zero inputs never become a confident zero-loss grade', () => {
  for (const raw of [[{second: 0, retained_fraction: null}], curve([1, 1.2]), curve([1, NaN]), [...curve([1, .8]), {second: 1, retained_fraction: .7}]]) {
    assert.equal(measurePassage(raw, 0, 1).quality, 'malformed');
  }
  assert.equal(measurePassage(curve([.8, .9, .7]), 0, 2).quality, 'rising');
  assert.equal(measurePassage(curve([.01, 0]), 0, 1).decline, null);
  assert.equal(measurePassage(curve([0, 0]), 0, 1).quality, 'low-retention');
  assert.equal(measurePassage(null, 0, 1).quality, 'missing');
  assert.equal(measurePassage(curve([1, .8]), 1, 0).quality, 'malformed');
});

test('local relative decline uses each peer denominator, not two cumulative medians', () => {
  const target = video({retention_curve: curve([.5, .45])});
  const p = peers([1, .85]);
  const m = comparePassage(target, span(0, 1), p);
  near(m.decline, .1); near(m.usual_loss, 7.5); near(m.drop_pts, 5); near(m.excess_loss, -2.5);
  // Mixed entering levels reverse the ratio-of-medians answer.
  const mixed = p.map((v, i) => ({...v, retention_curve: curve(i < 10 ? [.9, .81] : [.2, .1])}));
  near(comparePassage(target, span(0, 1), mixed).median, .3);
});

test('cohorts are deterministic, distinct, earlier, recent, same-account, mature, runtime-matched and unweighted', () => {
  const target = video();
  const valid = Array.from({length: 25}, (_, i) => peer(i));
  const excluded = [target, peer(60, {tiktok_id: 'target'}),
    peer(61, {create_time: target.create_time}), peer(62, {create_time: '2026-09-02T12:00:00Z'}),
    peer(63, {create_time: '2026-04-01T12:00:00Z'}), peer(64, {duration_ms: 75001}),
    peer(65, {duration_ms: 44999}), peer(66, {views: 999}),
    peer(67, {fetched_at: '2026-06-01T12:00:00Z'}), peer(68, {retention_curve: null}),
    peer(69, {permalink: 'https://www.tiktok.com/@other/video/69'})];
  const chosen = selectCohort(target, [...valid, ...excluded, {...valid[0], id: 101, fetched_at: '2026-09-10', views: 5e7}]);
  assert.equal(chosen.length, 20); assert.equal(new Set(chosen.map((p) => p.tiktok_id)).size, 20);
  assert.equal(chosen[0].id, 101); assert.deepEqual(chosen.slice(1).map((v) => v.id), valid.slice(1, 20).map((v) => v.id));
  assert.deepEqual(selectCohort(target, [...valid].reverse()).map((p) => p.id), valid.slice(0, 20).map((p) => p.id));
  const equalDates = [peer(4), peer(5, {create_time: peer(4).create_time})];
  assert.deepEqual(selectCohort(target, equalDates).map((p) => p.id), [5, 4]);
  assert.equal(selectCohort(video({permalink: null}), valid).length, 0);
  assert.equal(accountFor('https://tiktok.com.evil.test/@test/video/1'), null);
});

test('runtime, recency, measured age and view eligibility boundaries are inclusive', () => {
  const target = video();
  const boundary = peer(1, {duration_ms: 45000, views: 1000, create_time: '2026-06-03T12:00:00Z', fetched_at: '2026-06-10T12:00:00Z'});
  assert.equal(selectCohort(target, [boundary]).length, 1);
  assert.equal(selectCohort(target, [{...boundary, duration_ms: 75000}]).length, 1);
  assert.equal(selectCohort(target, [{...boundary, fetched_at: '2026-06-10T11:59:59Z'}]).length, 0);
});

test('body spans match exact elapsed seconds and ending spans preserve duration at equal seconds remaining', () => {
  assert.deepEqual(matchedSpan(10, 12, 60, 50), {start: 10, end: 12});
  assert.equal(matchedSpan(44, 46, 60, 50), null);
  assert.deepEqual(matchedSpan(54, 57, 60, 50), {start: 44, end: 47});
  assert.deepEqual(matchedSpan(58, 60, 60, 65), {start: 63, end: 65});
  assert.equal(matchedSpan(58, 61, 60, 65), null);
});

test('sparse references stay sparse, and rising or missing peer spans do not turn into zeros', () => {
  const p = peers([1, .8]);
  assert.equal(comparePassage(video(), span(0, 1), p.slice(0, 9)).verdict, 'sparse');
  const invalid = p.map((v, i) => i < 11 ? {...v, retention_curve: curve([.5, .6])} : v);
  const m = comparePassage(video(), span(0, 1), invalid);
  assert.equal(m.peer_count, 9); assert.equal(m.usual_loss, null);
});

test('stronger labels require non-overlapping conservative endpoint bounds; early data stays neutral', () => {
  const p = peers([1, .8]);
  assert.equal(comparePassage(video({retention_curve: curve([1, .95])}), span(0, 1), p).verdict, 'better');
  assert.equal(comparePassage(video({retention_curve: curve([1, .6])}), span(0, 1), p).verdict, 'worse');
  assert.equal(comparePassage(video({retention_curve: curve([1, .79])}), span(0, 1), p).verdict, 'close');
  for (const overrides of [{views: 999}, {fetched_at: '2026-09-02'}]) {
    const m = comparePassage(video({...overrides, retention_curve: curve([1, .6])}), span(0, 1), p);
    assert.equal(m.verdict, 'early'); near(m.usual_loss, 20);
  }
  const varied = p.map((v, i) => ({...v, retention_curve: curve([1, i < 10 ? .7 : .9])}));
  assert.equal(comparePassage(video({retention_curve: curve([1, .8])}), span(0, 1), varied).verdict, 'usual');
  assert.equal(comparePassage(video({retention_curve: curve([.03, .03])}), span(0, 1), peers([.03, .03])).verdict, 'close');
});

test('cumulative reference reports N and gaps instead of extrapolating', () => {
  const p = peers([1, .8, .7]).map((v, i) => i < 11 ? {...v, retention_curve: curve([1, .8])} : v);
  near(typicalAt(p, 1).retained, .8);
  assert.deepEqual(typicalAt(p, 2), {second: 2, n: 9, retained: null});
  assert.deepEqual(typicalAt(p, 2.1), {second: 2.1, n: 0, retained: null});
});

test('summary ranks reliable worse passages by excess points; early data has no worst passage', () => {
  const target = video({retention_curve: curve([1, .6, .25])});
  const source = [span(1, 2), span(0, 1)];
  const p = peers([1, .85, .75]);
  const a = analyzeRetention(target, source, p);
  assert.equal(a.worstIndex, 1); assert.equal(a.steepestIndex, 0);
  assert.deepEqual(a.segments.map((s) => s.start_s), [0, 1]);
  assert.equal(analyzeRetention({...target, views: 50}, source, p).worstIndex, null);
  assert.equal(analyzeRetention(video({retention_curve: null}), null, []).hook.retained, null);
});

test('captured TikTok 4087: 33 passages, correct opening, approved illustrative baseline and unknown tail', () => {
  // Frozen source observations: this assertion is independent of future live fetches.
  const f = JSON.parse(readFileSync(new URL('./fixtures/tiktok-4087.json', import.meta.url)));
  const a = analyzeRetention(f.target, f.target.segments, f.peers);
  assert.equal(a.cohort.length, 20); assert.equal(a.segments.length, 33);
  a.segments.slice(0, 3).forEach((s, i) => near(s.drop_pts, [14, 13, 10][i]));
  near(a.segments[1].median, .15877630121816172);
  near(a.segments[1].usual_loss, 13.654761904761909);
  assert.equal(a.segments[1].verdict, 'early'); assert.equal(a.worstIndex, null);
  assert.equal(a.segments.at(-1).drop_pts, null); assert.equal(a.end.retained, null);
});

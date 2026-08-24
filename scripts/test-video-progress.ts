import assert from 'node:assert/strict';
import {
  clearVideoProgress,
  createVideoProgressSession,
  markVideoProgress,
  videoResumeAt,
  videoWatchedFraction,
  type VideoProgress,
} from '../packages/shared/src/videoProgress.ts';

let progress: VideoProgress = {};

progress = markVideoProgress(progress, 'recipe-a', 42.8, 120);
assert.equal(videoResumeAt(progress, 'recipe-a'), 42, 'a recipe resumes at its saved second');
assert.equal(videoWatchedFraction(progress, 'recipe-a'), 42.8 / 120);

progress = markVideoProgress(progress, 'recipe-b', 17.2, 200);
assert.equal(videoResumeAt(progress, 'recipe-a'), 42, 'a second meal does not overwrite the first');
assert.equal(videoResumeAt(progress, 'recipe-b'), 17, 'the second meal keeps its own clock');

progress = markVideoProgress(progress, 'recipe-a', 0, 120);
assert.equal(videoResumeAt(progress, 'recipe-a'), 42, 'a YouTube startup zero does not erase a mark');

progress = markVideoProgress(progress, 'recipe-b', 199, 200);
assert.equal(videoResumeAt(progress, 'recipe-b'), 199, 'near-end positions remain until ended is explicit');

progress = clearVideoProgress(progress, 'recipe-a');
assert.equal(videoResumeAt(progress, 'recipe-a'), 0, 'finishing one recipe clears its mark');
assert.equal(videoResumeAt(progress, 'recipe-b'), 199, 'finishing one recipe preserves the other meal');

const session = createVideoProgressSession();
session.saveVideoMark('finished-recipe', 38, 100);
session.saveVideoMark('other-meal', 27, 90);
session.finishVideoProgress('finished-recipe');
session.saveVideoMark('finished-recipe', 41, 100);
assert.equal(
  session.resumeAtFor('finished-recipe'),
  0,
  'late teardown writes cannot resurrect a finished recipe',
);
assert.equal(session.resumeAtFor('other-meal'), 27, 'finishing one cook preserves the other cook');

session.beginVideoProgress('finished-recipe');
session.saveVideoMark('finished-recipe', 6, 100);
assert.equal(
  session.resumeAtFor('finished-recipe'),
  6,
  'manually playing again starts a fresh resumable clock',
);

console.log('video progress tests passed');

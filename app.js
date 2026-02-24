const targetHeadingElement = document.getElementById('targetHeading');
const playfield = document.getElementById('playfield');
const aircraft = document.getElementById('aircraft');
const vector = document.getElementById('vector');
const feedback = document.getElementById('feedback');
const stats = document.getElementById('stats');
const nextRoundButton = document.getElementById('nextRound');

const state = {
  targetHeading: 0,
  score: 0,
  round: 1,
  dragging: false,
  maxPull: 110,
  returnAnimationFrame: null,
  nextRoundTimeout: null,
  lockedRotation: null,
};

const springConfig = {
  stiffness: 0.24,
  damping: 0.82,
  jitterCutoff: 0.12,
};

const center = () => {
  const rect = playfield.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
};

const normalize = (deg) => ((deg % 360) + 360) % 360;

const minimalAngleDiff = (a, b) => {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
};

const pullBearingFromDelta = (dx, dy) => {
  const radians = Math.atan2(dx, -dy);
  return normalize((radians * 180) / Math.PI);
};

const drawAircraft = (dx, dy, { rotationOverride = null } = {}) => {
  const length = Math.hypot(dx, dy);
  const rotation = rotationOverride ?? (length > 0 ? Math.atan2(-dy, -dx) + Math.PI / 2 : 0);
  aircraft.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotation}rad)`;

  const angle = Math.atan2(dy, dx) + Math.PI / 2;
  vector.style.height = `${length}px`;
  vector.style.transform = `translate(-50%, -100%) rotate(${angle}rad)`;
};

const stopReturnAnimation = () => {
  if (state.returnAnimationFrame) {
    cancelAnimationFrame(state.returnAnimationFrame);
    state.returnAnimationFrame = null;
  }
};

const clearNextRoundTimeout = () => {
  if (state.nextRoundTimeout) {
    clearTimeout(state.nextRoundTimeout);
    state.nextRoundTimeout = null;
  }
};

const resetAircraft = () => {
  stopReturnAnimation();
  state.lockedRotation = null;
  drawAircraft(0, 0);
};

const animateReturnToCenter = (startDx, startDy) => {
  stopReturnAnimation();

  let dx = startDx;
  let dy = startDy;
  let vx = -startDx * 0.18;
  let vy = -startDy * 0.18;

  const tick = () => {
    if (state.dragging) {
      stopReturnAnimation();
      return;
    }

    vx += -dx * springConfig.stiffness;
    vy += -dy * springConfig.stiffness;
    vx *= springConfig.damping;
    vy *= springConfig.damping;
    dx += vx;
    dy += vy;

    drawAircraft(dx, dy, { rotationOverride: state.lockedRotation });

    const motion = Math.hypot(dx, dy) + Math.hypot(vx, vy);
    if (motion < springConfig.jitterCutoff) {
      drawAircraft(0, 0, { rotationOverride: state.lockedRotation });
      state.returnAnimationFrame = null;
      return;
    }

    state.returnAnimationFrame = requestAnimationFrame(tick);
  };

  state.returnAnimationFrame = requestAnimationFrame(tick);
};

const setHeading = () => {
  state.targetHeading = Math.floor(Math.random() * 360);
  targetHeadingElement.textContent = `${String(state.targetHeading).padStart(3, '0')}°`;
};

const setFeedbackClass = (name) => {
  feedback.classList.remove('feedback-good', 'feedback-okay', 'feedback-bad');
  if (name) feedback.classList.add(name);
};

const updateStats = () => {
  const { perfect, solidEnabled, solid } = getErrorThresholds();
  const scoringText = solidEnabled
    ? `+3 ≤ ${perfect}°, +2 ≤ ${solid}°`
    : `+3 ≤ ${perfect}°`;
  stats.textContent = `Score: ${state.score} | Round: ${state.round} | ${scoringText}`;
};

const startRound = ({ keepRound = false } = {}) => {
  clearNextRoundTimeout();
  if (!keepRound) state.round += 1;
  setHeading();
  resetAircraft();
  setFeedbackClass('');
  feedback.textContent = 'Drag the plane opposite the heading and release.';
  updateStats();
};

const pointsFromError = (errorDeg) => {
  const { perfect, solidEnabled, solid } = getErrorThresholds();
  if (errorDeg <= perfect) return 3;
  if (solidEnabled && errorDeg <= solid) return 2;
  return 0;
};

const getErrorThresholds = () => {
  const perfect = Math.max(3, 10 - Math.floor(state.score / 8));
  const solidEnabled = state.score < 50;
  const tightenBy = Math.floor(state.score / 5);

  return {
    perfect,
    solidEnabled,
    solid: Math.max(12, 25 - tightenBy * 2),
  };
};

const messageFromError = (errorDeg) => {
  const { perfect, solidEnabled, solid } = getErrorThresholds();

  if (errorDeg <= perfect) return { text: `Perfect! ${errorDeg.toFixed(1)}° error. +3`, cls: 'feedback-good' };
  if (solidEnabled && errorDeg <= solid) return { text: `Solid pull. ${errorDeg.toFixed(1)}° error. +2`, cls: 'feedback-good' };
  return { text: `Missed by ${errorDeg.toFixed(1)}°. Pull more opposite next time.`, cls: 'feedback-bad' };
};

const updatePull = (clientX, clientY) => {
  const rect = playfield.getBoundingClientRect();
  const c = center();

  let dx = clientX - rect.left - c.x;
  let dy = clientY - rect.top - c.y;

  const dist = Math.hypot(dx, dy);
  if (dist > state.maxPull) {
    const ratio = state.maxPull / dist;
    dx *= ratio;
    dy *= ratio;
  }

  const length = Math.hypot(dx, dy);
  drawAircraft(dx, dy);

  return { dx, dy, length };
};

const finishPull = (dx, dy, length) => {
  state.lockedRotation = length > 0 ? Math.atan2(-dy, -dx) + Math.PI / 2 : state.lockedRotation;
  animateReturnToCenter(dx, dy);

  if (length < 20) {
    feedback.textContent = 'Pull farther before release.';
    setFeedbackClass('feedback-okay');
    return;
  }

  const pullBearing = pullBearingFromDelta(dx, dy);
  const expectedPullBearing = normalize(state.targetHeading + 180);
  const error = minimalAngleDiff(pullBearing, expectedPullBearing);
  const points = pointsFromError(error);
  state.score += points;

  const result = messageFromError(error);
  setFeedbackClass(result.cls);
  feedback.textContent = `${result.text} (Target pull: ${expectedPullBearing.toFixed(0)}°)`;
  updateStats();

  state.nextRoundTimeout = setTimeout(() => {
    startRound();
  }, 3000);

};

let lastPull = { dx: 0, dy: 0, length: 0 };

const pointerMove = (event) => {
  if (!state.dragging) return;
  event.preventDefault();
  lastPull = updatePull(event.clientX, event.clientY);
};

const pointerUp = (event) => {
  if (!state.dragging) return;
  event.preventDefault();
  state.dragging = false;
  aircraft.releasePointerCapture(event.pointerId);
  finishPull(lastPull.dx, lastPull.dy, lastPull.length);
};

aircraft.addEventListener('pointerdown', (event) => {
  if (state.nextRoundTimeout) startRound();
  state.dragging = true;
  state.lockedRotation = null;
  stopReturnAnimation();
  aircraft.setPointerCapture(event.pointerId);
  lastPull = updatePull(event.clientX, event.clientY);
});

aircraft.addEventListener('pointermove', pointerMove);
aircraft.addEventListener('pointerup', pointerUp);
aircraft.addEventListener('pointercancel', pointerUp);

nextRoundButton.addEventListener('click', () => startRound());

setHeading();
updateStats();

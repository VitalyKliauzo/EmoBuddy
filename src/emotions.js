// Emotion presets as TalkingHead morph-target values (ARKit blendshapes + TalkingHead's own rotation channels).
// Applied with head.setFixedValue(), which overrides the mood baseline and idle animations.
//
// Groups: eyebrows, eyes, eyelids, mouth, headTilt, posture.
//  - headTilt: headRotateX (pitch, + = down), headRotateY (turn), headRotateZ (roll/tilt)
//  - posture:  bodyRotateX (lean, + = forward/slump), bodyRotateZ (sway)
// Deliberately no mouthOpen/jawOpen/viseme_* so lip-sync keeps working while an emotion is held.
// Values are starting points to tune by eye on your avatar.

export const EMOTIONS = {
  neutral: { eyebrows: {}, eyes: {}, eyelids: {}, mouth: {}, headTilt: {}, posture: {} },

  interest: {
    eyebrows: { browInnerUp: 0.3, browOuterUpLeft: 0.4, browOuterUpRight: 0.4 },
    eyes: { eyeWideLeft: 0.3, eyeWideRight: 0.3 },
    eyelids: {},
    mouth: { mouthSmile: 0.1 },
    headTilt: { headRotateZ: 0.12, headRotateX: -0.03 },
    posture: { bodyRotateX: 0.08 }
  },
  joy: {
    eyebrows: { browInnerUp: 0.15, browOuterUpLeft: 0.3, browOuterUpRight: 0.3 },
    eyes: { eyeSquintLeft: 0.4, eyeSquintRight: 0.4, cheekSquintLeft: 0.5, cheekSquintRight: 0.5 },
    eyelids: {},
    mouth: { mouthSmileLeft: 0.8, mouthSmileRight: 0.8, mouthDimpleLeft: 0.3, mouthDimpleRight: 0.3 },
    headTilt: { headRotateX: -0.05, headRotateZ: 0.05 },
    posture: { bodyRotateX: -0.05 }
  },
  fatigue: {
    eyebrows: { browDownLeft: 0.2, browDownRight: 0.2, browInnerUp: 0.2 },
    eyes: { eyesRotateX: 0.3 },
    eyelids: { eyeBlinkLeft: 0.5, eyeBlinkRight: 0.5 },
    mouth: { mouthFrownLeft: 0.2, mouthFrownRight: 0.2 },
    headTilt: { headRotateX: 0.15, headRotateZ: 0.1 },
    posture: { bodyRotateX: 0.25 }
  },
  anxiety: {
    eyebrows: { browInnerUp: 0.7, browDownLeft: 0.1, browDownRight: 0.1 },
    eyes: { eyeWideLeft: 0.5, eyeWideRight: 0.5, eyesRotateY: 0.25 },
    eyelids: {},
    mouth: { mouthStretchLeft: 0.3, mouthStretchRight: 0.3, mouthPressLeft: 0.3, mouthPressRight: 0.3, mouthFrownLeft: 0.2, mouthFrownRight: 0.2 },
    headTilt: { headRotateX: 0.05, headRotateZ: -0.06 },
    posture: { bodyRotateX: 0.12 }
  },
  boredom: {
    eyebrows: { browDownLeft: 0.1, browDownRight: 0.1 },
    eyes: { eyesRotateX: -0.25, eyesRotateY: 0.3 },
    eyelids: { eyeBlinkLeft: 0.35, eyeBlinkRight: 0.35 },
    mouth: { mouthShrugLower: 0.3, mouthFrownLeft: 0.2, mouthFrownRight: 0.2, mouthPucker: 0.1 },
    headTilt: { headRotateZ: 0.18, headRotateX: 0.05 },
    posture: { bodyRotateX: 0.15 }
  },
  sadness: {
    eyebrows: { browInnerUp: 0.9, browDownLeft: 0.2, browDownRight: 0.2 },
    eyes: { eyeSquintLeft: 0.3, eyeSquintRight: 0.3, eyesRotateX: 0.35 },
    eyelids: { eyeBlinkLeft: 0.25, eyeBlinkRight: 0.25 },
    mouth: { mouthFrownLeft: 0.8, mouthFrownRight: 0.8, mouthShrugLower: 0.3, mouthRollLower: 0.2 },
    headTilt: { headRotateX: 0.2, headRotateZ: 0.08 },
    posture: { bodyRotateX: 0.3 }
  },
  anger: {
    eyebrows: { browDownLeft: 1, browDownRight: 1 },
    eyes: { eyeSquintLeft: 0.4, eyeSquintRight: 0.4, eyeWideLeft: 0.3, eyeWideRight: 0.3 },
    eyelids: {},
    mouth: { mouthFrownLeft: 0.8, mouthFrownRight: 0.8, mouthPressLeft: 0.5, mouthPressRight: 0.5, noseSneerLeft: 0.4, noseSneerRight: 0.4 },
    headTilt: { headRotateX: 0.1 },
    posture: { bodyRotateX: 0.15 }
  },
  irritation: {
    eyebrows: { browDownLeft: 0.5, browDownRight: 0.3, browOuterUpRight: 0.1 },
    eyes: { eyeSquintLeft: 0.4, eyeSquintRight: 0.3, eyesRotateY: -0.2 },
    eyelids: { eyeBlinkLeft: 0.15, eyeBlinkRight: 0.1 },
    mouth: { mouthPressLeft: 0.4, mouthFrownLeft: 0.4, mouthFrownRight: 0.3, mouthLeft: 0.2, noseSneerLeft: 0.3 },
    headTilt: { headRotateZ: -0.08, headRotateY: 0.1 },
    posture: { bodyRotateX: 0.05 }
  },
  fear: {
    eyebrows: { browInnerUp: 1, browOuterUpLeft: 0.4, browOuterUpRight: 0.4 },
    eyes: { eyeWideLeft: 1, eyeWideRight: 1 },
    eyelids: {},
    mouth: { mouthStretchLeft: 0.6, mouthStretchRight: 0.6, mouthFrownLeft: 0.3, mouthFrownRight: 0.3, mouthUpperUpLeft: 0.3, mouthUpperUpRight: 0.3 },
    headTilt: { headRotateX: -0.1 },
    posture: { bodyRotateX: -0.15 }
  },
  surprise: {
    eyebrows: { browInnerUp: 0.8, browOuterUpLeft: 0.9, browOuterUpRight: 0.9 },
    eyes: { eyeWideLeft: 0.9, eyeWideRight: 0.9 },
    eyelids: {},
    mouth: { mouthFunnel: 0.2 },
    headTilt: { headRotateX: -0.1 },
    posture: { bodyRotateX: -0.1 }
  }
};

const GROUPS = ['eyebrows', 'eyes', 'eyelids', 'mouth', 'headTilt', 'posture'];
const TRANSITION_MS = 500;

let head = null;
let current = {};   // morph target -> value currently applied (fixed)
let raf = 0;

/** Bind to a TalkingHead instance; call once after construction. */
export function initEmotions(talkingHead) {
  head = talkingHead;
}

/** Flatten an emotion's groups into one {morphTarget: value} map. */
export function flattenEmotion(name) {
  const e = EMOTIONS[name];
  if (!e) throw new Error(`Unknown emotion "${name}". Available: ${Object.keys(EMOTIONS).join(', ')}`);
  return Object.assign({}, ...GROUPS.map((g) => e[g]));
}

/** Smoothly apply an emotion to the avatar in real time. Morph targets not in the emotion are released. */
export function setEmotion(emotionName) {
  if (!head) throw new Error('Call initEmotions(head) first.');
  const target = flattenEmotion(String(emotionName).trim().toLowerCase());
  const from = { ...current };
  const keys = new Set([...Object.keys(from), ...Object.keys(target)]);
  const start = performance.now();
  cancelAnimationFrame(raf);

  const step = (now) => {
    const t = Math.min((now - start) / TRANSITION_MS, 1);
    const k = t * t * (3 - 2 * t); // smoothstep
    for (const mt of keys) {
      const a = from[mt] ?? 0;
      const b = target[mt] ?? 0;
      const v = a + (b - a) * k;
      if (t === 1 && !(mt in target)) { head.setFixedValue(mt, null); delete current[mt]; }
      else { head.setFixedValue(mt, v); current[mt] = v; }
    }
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

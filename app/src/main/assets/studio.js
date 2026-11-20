'use strict';

const el = id => document.getElementById(id);
const pitches = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const majorScale = [0, 2, 4, 5, 7, 9, 11];

function preset(type, count) {
  const ascending = Array.from({length: count}, (_, index) =>
    (type === 'lyre' ? 48 : 60) + 12 * Math.floor(index / 7) + majorScale[index % 7]);
  if (type === 'lyre') return ascending;
  const left = ascending.filter((_, index) => index % 2 === 1).reverse();
  return left.concat(ascending.filter((_, index) => index % 2 === 0));
}

function pitchName(midi) {
  return pitches[midi % 12] + (Math.floor(midi / 12) - 1);
}

function parsePitch(value) {
  const parts = /^([A-Ga-g])([#b♯♭]?)(-?\d)$/.exec(value);
  if (!parts) return NaN;
  const alteration = {'#': 1, '♯': 1, b: -1, '♭': -1};
  return (Number(parts[3]) + 1) * 12 + pitches.indexOf(parts[1].toUpperCase()) + (alteration[parts[2]] || 0);
}

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const example = {
  id: 'example',
  title: 'Morning light',
  type: 'kalimba',
  tuning: preset('kalimba', 17),
  bpm: 90,
  events: [
    {notes: [60], beats: 1}, {notes: [64], beats: 1}, {notes: [67], beats: 1},
    {notes: [64, 67], beats: 1}, {notes: [62], beats: 1}, {notes: [65], beats: 1},
    {notes: [64], beats: 1}, {notes: [60, 67], beats: 2}
  ]
};
const copy = value => JSON.parse(JSON.stringify(value));
const defaultTunings = {kalimba: preset('kalimba', 17), lyre: preset('lyre', 16)};
// Each note is one beat unless followed by :length.
const publicDomainSongs = [
  {
    id: 'builtin-fur-elise',
    title: 'Für Elise (opening)',
    credit: 'Ludwig van Beethoven · diatonic adaptation',
    bpm: 130,
    // D natural replaces D-sharp so the opening fits a C-major instrument.
    melody: 'E5 D5 E5 D5 E5 B4 D5 C5 A4:3 C4 E4 A4 B4:3 E4 G4 B4 C5:3 ' +
      'E4 E5 D5 E5 D5 E5 B4 D5 C5 A4:3 C4 E4 A4 B4:3 E4 C5 B4 A4:4'
  },
  {
    id: 'builtin-ode-to-joy',
    title: 'Ode to Joy',
    credit: 'Ludwig van Beethoven · main theme',
    bpm: 100,
    melody: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4:2 ' +
      'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4:2'
  },
  {
    id: 'builtin-twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    credit: 'Traditional French melody',
    bpm: 92,
    melody: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 ' +
      'G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 ' +
      'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2'
  },
  {
    id: 'builtin-amazing-grace',
    title: 'Amazing Grace',
    credit: 'Traditional melody · New Britain',
    bpm: 96,
    melody: 'G4 C5:2 E5:0.5 C5:0.5 E5:2 D5 C5:2 A4 G4:2 G4 C5:2 E5:0.5 C5:0.5 ' +
      'E5:2 D5 G5:4 E5 G5:2 E5:0.5 G5:0.5 E5:2 C5 G4:2 A4 C5:2 A4 G4:2 G4 C5:2 E5:0.5 C5:0.5 E5:2 D5 C5:4'
  }
];

function arrangeStarter(starter, type, preferredTuning) {
  const shift = type === 'lyre' ? -12 : 0;
  const events = starter.melody.split(' ').map(token => {
    const [pitch, beats = '1'] = token.split(':');
    return {notes: [parsePitch(pitch) + shift], beats: Number(beats)};
  });
  const fitsTuning = events.every(event => preferredTuning.includes(event.notes[0]));
  return {
    id: starter.id,
    title: starter.title,
    bpm: starter.bpm,
    type,
    tuning: [...(fitsTuning ? preferredTuning : defaultTunings[type])],
    events
  };
}

let tunings = readStorage('minimusic-tunings', defaultTunings);
let library = readStorage('minimusic-library', []);
let song = readStorage('minimusic-draft', copy(example));
let mode = 'compose';
let selected = new Set(song.events.slice(-1));
let multiSelect = false;
let clipboard = [];
let drag;
let current = -1;
let playing = false;
let playbackTimer;
let flashTimer;
let toastTimer;
let audio;
const voices = new Set();

function persistDraft() {
  writeStorage('minimusic-draft', song);
}

function notice(message) {
  el('toast').textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el('toast').textContent = ''; }, 2500);
}

function startAudio() {
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  audio ||= new AudioEngine();
  if (audio.state === 'suspended') audio.resume().catch(() => {});
}

function sound(notes, seconds) {
  if (!notes.length) return;
  try {
    startAudio();
    const now = audio.currentTime;
    const duration = Math.min(3, Math.max(.13, seconds));
    const partials = song.type === 'kalimba' ? [[1, .18], [2.76, .037], [5.4, .009]]
      : [[1, .15], [2, .055], [3, .026], [4, .013]];
    for (const note of notes) {
      const frequency = 440 * 2 ** ((note - 69) / 12);
      for (const [ratio, gain] of partials) {
        if (frequency * ratio >= audio.sampleRate / 2) continue;
        const oscillator = audio.createOscillator();
        const envelope = audio.createGain();
        oscillator.frequency.value = frequency * ratio;
        envelope.gain.setValueAtTime(.0001, now);
        envelope.gain.exponentialRampToValueAtTime(gain / Math.sqrt(notes.length), now + .012);
        envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
        oscillator.connect(envelope).connect(audio.destination);
        voices.add(oscillator);
        oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); envelope.disconnect(); };
        oscillator.start(now);
        oscillator.stop(now + duration);
      }
    }
  } catch {
    notice('Audio is unavailable on this device.');
  }
}

function highlight(notes, scroll = false) {
  let first;
  let last;
  for (const key of el('instrument').children) {
    const active = notes.includes(Number(key.dataset.pitch));
    key.classList.toggle('active', active);
    if (active) {
      first ||= key;
      last = key;
    }
  }
  const scroller = document.querySelector('.instrument-scroll');
  if (scroll && first) {
    const bounds = scroller.getBoundingClientRect();
    const left = first.getBoundingClientRect().left;
    const right = last.getBoundingClientRect().right;
    if (left < bounds.left || right > bounds.right) {
      scroller.scrollLeft += (left + right - bounds.left - bounds.right) / 2;
    }
  }
  el('instrument-status').textContent = notes.length
    ? notes.map(pitchName).join(' + ') + (first ? '' : ' · outside tuning')
    : playing ? 'Rest' : 'Ready to play';
}

function preview(notes) {
  clearTimeout(flashTimer);
  sound(notes, .85);
  highlight(notes);
  flashTimer = setTimeout(() => highlight([]), 450);
}

function renderInstrument() {
  const instrument = el('instrument');
  instrument.replaceChildren();
  instrument.classList.toggle('lyre', song.type === 'lyre');
  instrument.style.setProperty('--minimum', (song.tuning.length * 17 + 18) + 'px');
  const minimum = Math.min(...song.tuning);
  const maximum = Math.max(...song.tuning);
  for (const pitch of song.tuning) {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'play-key';
    key.dataset.pitch = pitch;
    key.setAttribute('aria-label', pitchName(pitch));
    key.style.setProperty('--key-height', (173 - 93 * (pitch - minimum) / Math.max(1, maximum - minimum)) + 'px');
    const letter = document.createElement('span');
    const octave = document.createElement('small');
    const label = pitchName(pitch);
    letter.textContent = label.slice(0, -1);
    octave.textContent = label.slice(-1);
    key.append(letter, octave);
    key.addEventListener('click', () => {
      stopSong();
      if (mode === 'compose') append([pitch]);
      preview([pitch]);
    });
    instrument.append(key);
  }
  for (const type of ['kalimba', 'lyre']) el(type).setAttribute('aria-pressed', String(song.type === type));
  const parts = song.type === 'kalimba' ? 'keys' : 'strings';
  el('tuning-label').textContent = song.tuning.length + ' ' + parts;
  el('range').textContent = pitchName(minimum) + ' – ' + pitchName(maximum);
  highlight([]);
}

function renderSequence() {
  const sequence = el('sequence');
  const previousScroll = sequence.scrollTop;
  sequence.replaceChildren();
  el('note-count').textContent = song.events.length + (song.events.length === 1 ? ' event' : ' events');
  if (!song.events.length) {
    const message = document.createElement('p');
    message.textContent = 'Tap the instrument to add your first note.';
    sequence.append(message);
  }
  song.events.forEach((event, index) => {
    const button = document.createElement('button');
    button.className = 'note';
    button.type = 'button';
    const name = event.notes.map(pitchName).join(' + ') || 'Rest';
    button.textContent = name;
    const duration = document.createElement('small');
    duration.textContent = (event.beats === .5 ? '½' : event.beats) + ' beat' + (event.beats > 1 ? 's' : '');
    button.append(duration);
    button.title = name + (event.notes.some(note => !song.tuning.includes(note)) ? ' · outside instrument tuning' : '');
    button.classList.toggle('current', index === current);
    button.addEventListener('click', () => {
      stopSong();
      if (mode === 'compose' && multiSelect) {
        if (selected.has(event)) selected.delete(event);
        else selected.add(event);
        updateSelection();
        return;
      }
      selected = new Set([event]);
      updateSelection();
      preview(event.notes);
    });
    const item = document.createElement('div');
    item.className = 'sequence-item';
    item.append(button);
    if (mode === 'compose') {
      item.classList.add('editable');
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'drag-handle';
      handle.textContent = '⠿';
      handle.setAttribute('aria-label', 'Reorder ' + name + ', event ' + (index + 1));
      handle.title = 'Drag or use arrow keys to reorder';
      handle.addEventListener('pointerdown', pointer => beginDrag(pointer, index));
      handle.addEventListener('keydown', key => {
        const direction = {ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1}[key.key];
        if (!direction) return;
        key.preventDefault();
        const moving = selected.has(event) ? selected : new Set([event]);
        const indices = song.events.flatMap((entry, position) => moving.has(entry) ? [position] : []);
        const slot = direction < 0 ? indices[0] - 1 : indices[indices.length - 1] + 2;
        if (slot >= 0 && slot <= song.events.length && moveEvents(index, slot)) {
          sequence.children[song.events.indexOf(event)].querySelector('.drag-handle').focus();
        }
      });
      item.append(handle);
    }
    sequence.append(item);
  });
  sequence.scrollTop = previousScroll;
  updateSelection();
  updateTransport();
}

function moveEvents(source, slot) {
  const event = song.events[source];
  const moving = selected.has(event) ? selected : new Set([event]);
  const before = song.events.slice(0, slot).filter(entry => !moving.has(entry)).length;
  const remaining = song.events.filter(entry => !moving.has(entry));
  remaining.splice(before, 0, ...song.events.filter(entry => moving.has(entry)));
  if (remaining.every((entry, index) => entry === song.events[index])) return false;
  stopSong();
  song.events = remaining;
  selected = moving;
  persistDraft();
  renderSequence();
  notice(moving.size === 1 ? 'Event moved' : moving.size + ' events moved');
  return true;
}

function beginDrag(pointer, source) {
  if (pointer.button !== 0 || drag) return;
  const handle = pointer.currentTarget;
  const pointerId = pointer.pointerId;
  const sequence = el('sequence');
  const controller = new AbortController();
  const options = {signal: controller.signal};
  const startX = pointer.clientX;
  const startY = pointer.clientY;
  let x = startX;
  let y = startY;
  let started = false;
  let target;
  let slot;
  let frame;
  const sourceEvent = song.events[source];
  const moving = selected.has(sourceEvent) ? new Set(selected) : new Set([sourceEvent]);
  const items = [...sequence.children];

  function showDropTarget() {
    const bounds = sequence.getBoundingClientRect();
    target?.classList.remove('drop-before', 'drop-after');
    target = undefined;
    slot = undefined;
    if (x < bounds.left - 16 || x > bounds.right + 16 || y < bounds.top - 16 || y > bounds.bottom + 16) return;
    if (y < bounds.top + 24) sequence.scrollTop -= 8;
    else if (y > bounds.bottom - 24) sequence.scrollTop += 8;

    let nearest = Infinity;
    items.forEach((candidate, index) => {
      const rect = candidate.getBoundingClientRect();
      if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) return;
      const center = (rect.left + rect.right) / 2;
      const rowDistance = Math.max(rect.top - y, y - rect.bottom, 0);
      const distance = rowDistance * (bounds.width + 1) + Math.abs(x - center);
      if (distance >= nearest) return;
      nearest = distance;
      const after = x >= center || y > rect.bottom;
      target = candidate;
      slot = index + Number(after);
    });
    if (target) target.classList.add(items[slot] === target ? 'drop-before' : 'drop-after');
  }

  function trackDrop() {
    showDropTarget();
    frame = requestAnimationFrame(trackDrop);
  }

  function finishDrag(event) {
    if (event.pointerId !== pointerId) return;
    if (event.type === 'pointerup' && started) {
      x = event.clientX;
      y = event.clientY;
      showDropTarget();
    }
    const destination = slot;
    controller.abort();
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    cancelAnimationFrame(frame);
    target?.classList.remove('drop-before', 'drop-after');
    for (const entry of items) entry.classList.remove('dragging');
    drag = undefined;
    if (event.type === 'pointerup' && started && sequence.contains(handle) && destination !== undefined) {
      requestAnimationFrame(() => {
        if (sequence.contains(handle)) moveEvents(source, destination);
      });
    }
  }

  pointer.preventDefault();
  drag = handle;
  handle.setPointerCapture(pointerId);
  handle.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    x = event.clientX;
    y = event.clientY;
    if (started || Math.hypot(x - startX, y - startY) < 5) return;
    started = true;
    items.forEach((entry, index) => entry.classList.toggle('dragging', moving.has(song.events[index])));
    trackDrop();
  }, options);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    handle.addEventListener(type, finishDrag, options);
  }
}

function updateSelection() {
  [...el('sequence').querySelectorAll('.note')].forEach((button, index) =>
    button.setAttribute('aria-pressed', String(selected.has(song.events[index]))));
  const event = selected.size === 1 ? selected.values().next().value : undefined;
  el('multi-select').setAttribute('aria-pressed', String(multiSelect));
  el('multi-select').textContent = multiSelect ? 'Done (' + selected.size + ')' : 'Multi-select';
  el('multi-select').disabled = !song.events.length && !multiSelect;
  el('copy-notes').disabled = !selected.size;
  el('paste-notes').disabled = !clipboard.length;
  el('remove').disabled = !selected.size;
  el('remove').textContent = selected.size > 1 ? 'Remove (' + selected.size + ')' : 'Remove';
  if (selected.size) {
    const lengths = new Set([...selected].map(entry => entry.beats));
    el('length').value = lengths.size === 1 ? lengths.values().next().value : '';
  }
  const chords = el('chords');
  chords.replaceChildren();
  const root = event?.notes[0];
  el('chord-description').textContent = root === undefined
    ? 'Select one note to see two-note combinations.'
    : 'Choose a pair to replace ' + pitchName(root) + ' in the sequence.';
  if (root === undefined) return;
  const intervals = [[4, 'Major third'], [3, 'Minor third'], [7, 'Perfect fifth'], [5, 'Perfect fourth'], [12, 'Octave']];
  for (const [interval, name] of intervals) {
    const partner = song.tuning.includes(root + interval) ? root + interval : root - interval;
    if (!song.tuning.includes(partner) || !song.tuning.includes(root)) continue;
    const label = [root, partner].map(pitchName).join(' + ');
    const button = document.createElement('button');
    button.className = 'chord';
    button.type = 'button';
    button.textContent = label;
    const description = document.createElement('small');
    description.textContent = name;
    button.append(description);
    button.addEventListener('click', () => {
      stopSong();
      event.notes = [root, partner];
      persistDraft();
      renderSequence();
      preview(event.notes);
    });
    chords.append(button);
  }
  if (!chords.children.length) el('chord-description').textContent = 'No common pairs are available for this note in the current tuning.';
}

function append(notes) {
  const event = {notes, beats: Number(el('length').value) || 1};
  song.events.push(event);
  if (!multiSelect) selected.clear();
  selected.add(event);
  persistDraft();
  renderSequence();
  el('sequence').scrollTop = el('sequence').scrollHeight;
}

function updateTransport() {
  el('play').disabled = !song.events.length;
  el('play').textContent = playing ? '■ Stop' : mode === 'learn' ? '▶︎ Start practice' : '▶︎ Play song';
}

function setCurrent(index) {
  el('sequence').children[current]?.querySelector('.note')?.classList.remove('current');
  current = index;
  const active = el('sequence').children[index]?.querySelector('.note');
  if (active) {
    active.classList.add('current');
    const sequence = el('sequence');
    const bounds = sequence.getBoundingClientRect();
    const note = active.getBoundingClientRect();
    if (note.top < bounds.top) sequence.scrollTop += note.top - bounds.top - 8;
    if (note.bottom > bounds.bottom) sequence.scrollTop += note.bottom - bounds.bottom + 8;
  }
}

function stopSong() {
  clearTimeout(playbackTimer);
  clearTimeout(flashTimer);
  for (const voice of voices) voice.stop();
  voices.clear();
  playing = false;
  setCurrent(-1);
  highlight([]);
  updateTransport();
}

function playSong() {
  if (playing) {
    stopSong();
    return;
  }
  if (!song.events.length) return;
  stopSong();
  playing = true;
  updateTransport();
  if (mode === 'learn') el('instrument-heading').scrollIntoView({block: 'nearest'});
  const multiplier = mode === 'learn' ? Number(el('speed').value) : 1;
  const beat = 60 / (song.bpm * multiplier);
  let deadline = performance.now();
  function playEvent(index) {
    const event = song.events[index];
    if (!event) {
      stopSong();
      return;
    }
    const seconds = event.beats * beat;
    setCurrent(index);
    highlight(event.notes, mode === 'learn');
    sound(event.notes, seconds * .92);
    deadline += seconds * 1000;
    playbackTimer = setTimeout(() => playEvent(index + 1), Math.max(0, deadline - performance.now()));
  }
  // Unlock audio during the tap even when the first event is a rest.
  if (!song.events[0].notes.length) {
    try { startAudio(); } catch { notice('Audio is unavailable on this device.'); }
  }
  playEvent(0);
}

function switchMode(next) {
  stopSong();
  mode = next;
  const composing = next === 'compose';
  for (const id of ['compose', 'learn']) {
    const tab = el(id + '-tab');
    tab.classList.toggle('selected', id === next);
    if (id === next) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  el('page-title').textContent = composing ? 'Compose' : 'Learn';
  el('page-description').textContent = composing
    ? 'Play your instrument, one note at a time, and turn it into a song.'
    : 'Follow the highlighted notes on your instrument as the song plays.';
  el('instrument-instruction').textContent = composing
    ? 'Tap a note to add it to your song.' : 'Tap to try a note, or start practice to follow along.';
  for (const id of ['chord-card', 'sequence-actions', 'edit-controls', 'save', 'new-song']) el(id).hidden = !composing;
  el('speed-controls').hidden = composing;
  el('title').readOnly = !composing;
  renderSequence();
}

function renderSong() {
  el('title').value = song.title;
  el('bpm').value = song.bpm;
  el('tempo').value = song.bpm;
  renderInstrument();
  renderSequence();
}

function switchInstrument(type) {
  if (type === song.type) return;
  stopSong();
  song.type = type;
  song.tuning = [...tunings[type]];
  persistDraft();
  renderInstrument();
  renderSequence();
  showTuningWarning();
}

function showTuningWarning() {
  if (song.events.some(event => event.notes.some(note => !song.tuning.includes(note)))) {
    notice('Some song notes are outside this instrument’s tuning.');
  }
}

function showDialog(id) {
  stopSong();
  const dialog = el(id);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(dialog) {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function saveSong() {
  const saved = copy(song);
  if (!song.id || song.id === 'example' || song.id.startsWith('builtin-')) {
    saved.id = Date.now().toString(36);
  }
  saved.title = song.title.trim() || 'Untitled song';
  const next = [saved, ...library.filter(item => item.id !== saved.id)];
  if (!writeStorage('minimusic-library', next)) {
    notice('Could not save this song. Device storage may be full.');
    return;
  }
  library = next;
  song.id = saved.id;
  song.title = saved.title;
  el('title').value = song.title;
  persistDraft();
  notice('Song saved');
}

function renderLibrary() {
  const list = el('song-list');
  list.replaceChildren();
  const starterList = el('starter-list');
  starterList.replaceChildren();
  el('saved-heading').hidden = !library.length;
  const type = song.type;
  const preferredTuning = song.tuning;
  for (const item of library) addLibraryRow(list, item);
  for (const starter of publicDomainSongs) {
    addLibraryRow(starterList, arrangeStarter(starter, type, preferredTuning), starter.credit);
  }
  addLibraryRow(starterList, example, 'Original example');
}

function addLibraryRow(list, item, credit) {
  const row = document.createElement('div');
  row.className = 'library-item';
  const info = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = item.title;
  const detail = document.createElement('small');
  const type = item.type === 'lyre' ? 'Lyre' : 'Kalimba';
  detail.textContent = [credit, type, item.events.length + ' events'].filter(Boolean).join(' · ');
  info.append(name, detail);
  row.append(info);
  for (const action of ['Open', 'Practice']) {
    const button = document.createElement('button');
    button.className = 'outline';
    button.textContent = action;
    button.setAttribute('aria-label', action + ' ' + item.title);
    button.addEventListener('click', () => {
      stopSong();
      const usesPreset = item.id.startsWith('builtin-') && !item.tuning.every(
        (pitch, index) => pitch === song.tuning[index] && item.tuning.length === song.tuning.length);
      song = copy(item);
      selected = new Set(song.events.slice(-1));
      multiSelect = false;
      closeDialog(el('library-dialog'));
      persistDraft();
      switchMode(action === 'Open' ? 'compose' : 'learn');
      renderSong();
      if (usesPreset) notice('This tune uses the default ' + type.toLowerCase() + ' tuning.');
    });
    row.append(button);
  }
  list.append(row);
}

for (const id of ['compose', 'learn']) el(id + '-tab').addEventListener('click', () => switchMode(id));
for (const type of ['kalimba', 'lyre']) el(type).addEventListener('click', () => switchInstrument(type));
document.querySelectorAll('dialog .close').forEach(button =>
  button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
el('library').addEventListener('click', () => { renderLibrary(); showDialog('library-dialog'); });
el('save').addEventListener('click', saveSong);
el('play').addEventListener('click', playSong);
el('new-song').addEventListener('click', () => {
  stopSong();
  song = {id: null, title: '', type: song.type, tuning: [...song.tuning], bpm: 90, events: []};
  selected.clear();
  multiSelect = false;
  el('length').value = '1';
  persistDraft();
  renderSong();
  el('title').focus();
});
el('title').addEventListener('input', event => { song.title = event.target.value; persistDraft(); });
el('tempo').addEventListener('input', event => {
  if (playing) stopSong();
  song.bpm = Number(event.target.value);
  el('bpm').value = song.bpm;
  persistDraft();
});
el('speed').addEventListener('change', () => { if (playing) stopSong(); });
el('length').addEventListener('change', event => {
  if (playing) stopSong();
  if (!selected.size || !event.target.value) return;
  for (const entry of selected) entry.beats = Number(event.target.value);
  persistDraft();
  renderSequence();
});
el('multi-select').addEventListener('click', () => {
  multiSelect = !multiSelect;
  if (multiSelect) selected.clear();
  else selected = new Set(song.events.filter(event => selected.has(event)).slice(-1));
  updateSelection();
});
el('copy-notes').addEventListener('click', () => {
  clipboard = copy(song.events.filter(event => selected.has(event)));
  el('paste-notes').disabled = !clipboard.length;
  notice('Copied ' + clipboard.length + (clipboard.length === 1 ? ' event' : ' events'));
});
el('paste-notes').addEventListener('click', () => {
  if (!clipboard.length) return;
  stopSong();
  let slot = song.events.length;
  song.events.forEach((event, index) => { if (selected.has(event)) slot = index + 1; });
  const pasted = copy(clipboard);
  song.events.splice(slot, 0, ...pasted);
  selected = new Set(pasted);
  multiSelect = pasted.length > 1;
  persistDraft();
  renderSequence();
  showTuningWarning();
});
el('rest').addEventListener('click', () => { stopSong(); append([]); });
el('remove').addEventListener('click', () => {
  if (!selected.size) return;
  stopSong();
  const first = song.events.findIndex(event => selected.has(event));
  song.events = song.events.filter(event => !selected.has(event));
  const next = song.events[Math.min(first, song.events.length - 1)];
  selected = new Set(next && !multiSelect ? [next] : []);
  persistDraft();
  renderSequence();
});
el('setup').addEventListener('click', () => {
  el('parts-label').textContent = song.type === 'kalimba' ? 'keys' : 'strings';
  el('part-count').value = song.tuning.length;
  el('tuning').value = song.tuning.map(pitchName).join(' ');
  el('setup-error').textContent = '';
  showDialog('setup-dialog');
});
el('preset').addEventListener('click', () => {
  if (!el('part-count').reportValidity()) return;
  el('tuning').value = preset(song.type, Number(el('part-count').value)).map(pitchName).join(' ');
  el('setup-error').textContent = '';
});
el('setup-form').addEventListener('submit', event => {
  event.preventDefault();
  const notes = el('tuning').value.trim().split(/[\s,]+/).filter(Boolean).map(parsePitch);
  const count = Number(el('part-count').value);
  if (notes.length !== count || notes.some(note => !Number.isInteger(note) || note < 12 || note > 119)) {
    el('setup-error').textContent = 'Enter exactly ' + count + ' notes from C0 to B8, including octaves.';
    return;
  }
  song.tuning = notes;
  tunings = {...tunings, [song.type]: notes};
  writeStorage('minimusic-tunings', tunings);
  persistDraft();
  closeDialog(el('setup-dialog'));
  renderInstrument();
  renderSequence();
  showTuningWarning();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopSong(); });
window.stopSong = stopSong;

renderSong();
